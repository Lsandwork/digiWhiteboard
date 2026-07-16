import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { getCachedGingrBasketCheckoutKeys } from "@/lib/basket-cleared-checkout";
import { applyCachedBackOfHousePhotos } from "@/lib/board-animal-photo-sources";
import {
  buildGingrCheckoutKeySet,
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts,
  shouldShowCheckoutAgainstBasket,
  sortCheckoutDogs
} from "@/lib/board-checkout-merge";
import { hideBasketClearedCheckoutRows } from "@/lib/basket-cleared-checkout";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { mapGingrBoardToLiveDogs } from "@/lib/gingr-board-sync";
import { getCachedBackOfHouseBoard } from "@/lib/gingr-request-guard";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const FAST_CHECKOUT_QUERY_TIMEOUT_MS = 1500;
const FAST_CHECKOUT_PHOTO_TIMEOUT_MS = 800;

export type FastCheckoutLoadResult = {
  checking_out: LiveDog[];
  newest_checkout_at: string | null;
  prompted_count: number;
  raw_checkout_rows: number;
  filtered_unprompted_rows: number;
  expired_checkout_rows: number;
  basket_filtered: boolean;
  basket_cleared_rows: number;
  data_source: "supabase_live_transition_dogs";
};

export type FastBoardTransitionLoadResult = FastCheckoutLoadResult & {
  checking_in: LiveDog[];
};

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));
}

function loadCachedGingrCheckoutDogs(now: Date) {
  const cachedBoard = getCachedBackOfHouseBoard(now.getTime(), true);
  if (!cachedBoard) return [];

  return enrichDogs(mapGingrBoardToLiveDogs(cachedBoard)).filter(
    (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
  );
}

function resolveGingrCheckoutBasketKeys(now: Date, gingrCheckouts: LiveDog[]) {
  if (gingrCheckouts.length) {
    return buildGingrCheckoutKeySet(gingrCheckouts);
  }
  return getCachedGingrBasketCheckoutKeys(now.getTime(), true);
}

function mergeVisibleCheckouts(now: Date, promptedCheckouts: LiveDog[]) {
  const gingrCheckouts = loadCachedGingrCheckoutDogs(now);
  const gingrCheckoutKeys = resolveGingrCheckoutBasketKeys(now, gingrCheckouts);
  let visibleCheckouts = mergeCheckoutDogs(gingrCheckouts, promptedCheckouts);
  let basketFiltered = false;

  if (gingrCheckoutKeys) {
    basketFiltered = true;
    // Keep webhook rows visible while Gingr basket cache catches up on add;
    // drop them immediately once the basket no longer includes the dog.
    visibleCheckouts = reconcileGingrSourcedCheckouts(visibleCheckouts, gingrCheckouts);
    const nowMs = now.getTime();
    visibleCheckouts = visibleCheckouts.filter(
      (dog) => dog.display_status !== "checking_out" || shouldShowCheckoutAgainstBasket(dog, gingrCheckoutKeys, nowMs)
    );
  }

  return { visibleCheckouts, basketFiltered };
}

function newestCheckoutTimestamp(dogs: LiveDog[]) {
  let newest: string | null = null;
  for (const dog of dogs) {
    const candidate = dog.status_started_at ?? dog.updated_at;
    if (!candidate) continue;
    if (!newest || new Date(candidate).getTime() > new Date(newest).getTime()) {
      newest = candidate;
    }
  }
  return newest;
}

/** Supabase/webhook only — never calls Gingr. Hard-timeout so board polls never hang. */
export async function loadFastPromptedCheckouts(
  supabase: SupabaseClient,
  now = new Date()
): Promise<FastCheckoutLoadResult> {
  const { data, error } = await withTimeoutOrThrow(
    Promise.resolve(
      supabase
        .from("live_transition_dogs")
        .select(
          "id, gingr_reservation_id, gingr_animal_id, animal_name, owner_name, photo_url, reservation_type, current_status, display_status, room, notes, flags, status_started_at, completed_at, display_until, last_seen_from_gingr_at, raw_payload, hidden, updated_at"
        )
        .eq("hidden", false)
        .eq("display_status", "checking_out")
        .order("status_started_at", { ascending: true })
        .limit(40)
    ),
    FAST_CHECKOUT_QUERY_TIMEOUT_MS,
    "fast-checkout live_transition_dogs"
  );

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]);
  const prompted = rows.filter(isPromptedCheckoutDog);
  const expiredCount = prompted.filter((dog) => shouldExpireCheckoutDog(dog, now)).length;
  const { visibleCheckouts: visible, basketFiltered } = mergeVisibleCheckouts(
    now,
    prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now))
  );

  let withPhotos = applyCachedBackOfHousePhotos(visible);
  try {
    withPhotos = applyCachedBackOfHousePhotos(
      await withTimeoutOrThrow(
        applyStoredAnimalPhotos(supabase, visible),
        FAST_CHECKOUT_PHOTO_TIMEOUT_MS,
        "fast-checkout photos"
      )
    );
  } catch {
    // Photos are optional — never fail the checkout list for photo store latency.
  }

  return {
    checking_out: sortCheckoutDogs(withPhotos),
    newest_checkout_at: newestCheckoutTimestamp(withPhotos),
    prompted_count: prompted.length,
    raw_checkout_rows: rows.length,
    filtered_unprompted_rows: rows.length - prompted.length,
    expired_checkout_rows: expiredCount,
    basket_filtered: basketFiltered,
    basket_cleared_rows: 0,
    data_source: "supabase_live_transition_dogs"
  };
}

/**
 * Staff board fast path: one Supabase query for both active check-ins and
 * prompted checkouts. This avoids waiting for the heavier Gingr-backed
 * /api/live-board request before a webhook-triggered dog can appear.
 */
export async function loadFastBoardTransitions(
  supabase: SupabaseClient,
  now = new Date()
): Promise<FastBoardTransitionLoadResult> {
  const { data, error } = await withTimeoutOrThrow(
    Promise.resolve(
      supabase
        .from("live_transition_dogs")
        .select(
          "id, gingr_reservation_id, gingr_animal_id, animal_name, owner_name, photo_url, reservation_type, current_status, display_status, room, notes, flags, status_started_at, completed_at, display_until, last_seen_from_gingr_at, raw_payload, hidden, updated_at"
        )
        .eq("hidden", false)
        .in("display_status", ["checking_in", "checking_out"])
        .order("status_started_at", { ascending: true })
        .limit(80)
    ),
    FAST_CHECKOUT_QUERY_TIMEOUT_MS,
    "fast-board live_transition_dogs"
  );

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]);
  const checkinRows = rows.filter(
    (dog) => dog.display_status === "checking_in" && dog.raw_payload?.source !== "gingr_back_of_house"
  );
  const visibleCheckins = checkinRows.filter((dog) => !shouldExpireCheckinDog(dog, now));

  const checkoutRows = rows.filter((dog) => dog.display_status === "checking_out");
  const prompted = checkoutRows.filter(isPromptedCheckoutDog);
  const expiredCount = prompted.filter((dog) => shouldExpireCheckoutDog(dog, now)).length;
  const { visibleCheckouts, basketFiltered } = mergeVisibleCheckouts(
    now,
    prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now))
  );

  let visible = applyCachedBackOfHousePhotos([...visibleCheckins, ...visibleCheckouts]);
  try {
    visible = applyCachedBackOfHousePhotos(
      await withTimeoutOrThrow(
        applyStoredAnimalPhotos(supabase, visible),
        FAST_CHECKOUT_PHOTO_TIMEOUT_MS,
        "fast-board photos"
      )
    );
  } catch {
    // Photos are optional — dog status should never wait for photo storage.
  }

  const checkingIn = visible.filter((dog) => dog.display_status === "checking_in");
  const checkingOut = visible.filter((dog) => dog.display_status === "checking_out");

  return {
    checking_in: checkingIn,
    checking_out: sortCheckoutDogs(checkingOut),
    newest_checkout_at: newestCheckoutTimestamp(checkingOut),
    prompted_count: prompted.length,
    raw_checkout_rows: checkoutRows.length,
    filtered_unprompted_rows: checkoutRows.length - prompted.length,
    expired_checkout_rows: expiredCount,
    basket_filtered: basketFiltered,
    basket_cleared_rows: 0,
    data_source: "supabase_live_transition_dogs"
  };
}

/** Hide Supabase checkout rows cleared from the cached Gingr basket (no live Gingr call). */
const BASKET_RECONCILE_DEBOUNCE_MS = 8_000;
let lastBasketReconcileAt = 0;

export async function reconcileCachedBasketClears(
  supabase: SupabaseClient,
  now = new Date()
) {
  const elapsed = Date.now() - lastBasketReconcileAt;
  if (elapsed < BASKET_RECONCILE_DEBOUNCE_MS) {
    return { hidden_count: 0, skipped: true as const };
  }
  lastBasketReconcileAt = Date.now();
  const gingrCheckoutKeys = resolveGingrCheckoutBasketKeys(now, loadCachedGingrCheckoutDogs(now));
  if (!gingrCheckoutKeys) return { hidden_count: 0 };
  return hideBasketClearedCheckoutRows(supabase, gingrCheckoutKeys, now);
}
