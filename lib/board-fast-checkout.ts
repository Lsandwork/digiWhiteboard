import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import { getCachedGingrBasketCheckoutKeys } from "@/lib/basket-cleared-checkout";
import { applyCachedBackOfHousePhotos } from "@/lib/board-animal-photo-sources";
import {
  isDogInGingrCheckoutBasket,
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts,
  shouldShowCheckoutAgainstBasket,
  sortCheckoutDogs
} from "@/lib/board-checkout-merge";
import { hideBasketClearedCheckoutRows } from "@/lib/basket-cleared-checkout";
import {
  buildRetiredTransitionKeys,
  getCachedRetiredTransitionKeys,
  isRetiredGingrDog,
  markDogsRetired,
  setCachedRetiredTransitionKeys
} from "@/lib/board-retired-keys";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { mapGingrBoardToLiveDogs } from "@/lib/gingr-board-sync";
import { getCachedBackOfHouseBoard } from "@/lib/gingr-request-guard";
import {
  isLiveTransitionQueryInCooldown,
  markLiveTransitionQueryTimeout
} from "@/lib/live-transition-query-guard";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import type { LiveDog } from "@/lib/types";

export {
  isLiveTransitionQueryInCooldown,
  markLiveTransitionQueryTimeout,
  __resetLiveTransitionQueryCooldownForTests
} from "@/lib/live-transition-query-guard";

export { markDogsRetired } from "@/lib/board-retired-keys";
export type { RetiredTransitionKeys } from "@/lib/board-retired-keys";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const FAST_CHECKOUT_QUERY_TIMEOUT_MS = 1500;
export const FAST_CHECKOUT_PHOTO_TIMEOUT_MS = 250;
export const FAST_BOARD_ROW_LIMIT = 80;

export type FastCheckoutLoadResult = {
  checking_out: LiveDog[];
  newest_checkout_at: string | null;
  prompted_count: number;
  raw_checkout_rows: number;
  filtered_unprompted_rows: number;
  expired_checkout_rows: number;
  basket_filtered: boolean;
  basket_cleared_rows: number;
  data_source: "supabase_live_transition_dogs" | "gingr_back_of_house_cache";
  supabase_timed_out?: boolean;
};

export type FastBoardTransitionLoadResult = FastCheckoutLoadResult & {
  checking_in: LiveDog[];
  supabase_timed_out?: boolean;
};

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));
}

function loadCachedGingrBoardDogs(now: Date) {
  const cachedBoard = getCachedBackOfHouseBoard(now.getTime(), true);
  if (!cachedBoard) return [];
  return enrichDogs(mapGingrBoardToLiveDogs(cachedBoard));
}

function loadCachedGingrCheckoutDogs(now: Date, gingrBoardDogs = loadCachedGingrBoardDogs(now)) {
  return gingrBoardDogs.filter(
    (dog) => dog.display_status === "checking_out" && !shouldExpireCheckoutDog(dog, now)
  );
}

/**
 * Gingr's back-of-house feed is the only signal for a check-in that never sent a
 * webhook. Without it the dog waited for the 20-60s full board poll.
 */
function loadCachedGingrCheckinDogs(now: Date, gingrBoardDogs = loadCachedGingrBoardDogs(now)) {
  return gingrBoardDogs.filter(
    (dog) => dog.display_status === "checking_in" && !shouldExpireCheckinDog(dog, now)
  );
}

/**
 * Refreshed in the background, never on the hot path: suppression only needs to be
 * seconds-accurate, and the board must not pay a query to learn what it retired.
 */
const RETIRED_LOOKBACK_MS = 15 * 60 * 1000;
/** Keep multi-instance hide lag short so Gingr BOH cannot re-inject a retired dog for long. */
const RETIRED_REFRESH_MS = 2_000;
const RETIRED_SCAN_LIMIT = 200;

let lastRetiredRefreshAt = 0;

export async function refreshRetiredTransitionKeys(supabase: SupabaseClient, now = new Date()) {
  const cachedRetiredKeys = getCachedRetiredTransitionKeys();
  if (isLiveTransitionQueryInCooldown()) {
    return { skipped: true as const, size: cachedRetiredKeys.size };
  }
  if (Date.now() - lastRetiredRefreshAt < RETIRED_REFRESH_MS) {
    return { skipped: true as const, size: cachedRetiredKeys.size };
  }
  lastRetiredRefreshAt = Date.now();

  try {
    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select("gingr_reservation_id, gingr_animal_id, updated_at")
      .eq("hidden", true)
      .gte("updated_at", new Date(now.getTime() - RETIRED_LOOKBACK_MS).toISOString())
      .order("updated_at", { ascending: false })
      .limit(RETIRED_SCAN_LIMIT);

    if (error) throw error;

    // Merge DB scan with any inline marks so a hide cannot race a stale refresh wipe.
    const fromDb = buildRetiredTransitionKeys((data ?? []) as LiveDog[]);
    for (const [key, retiredAtMs] of cachedRetiredKeys) {
      fromDb.set(key, Math.max(fromDb.get(key) ?? 0, retiredAtMs));
    }
    setCachedRetiredTransitionKeys(fromDb);
    return { skipped: false as const, size: fromDb.size };
  } catch {
    markLiveTransitionQueryTimeout();
    return { skipped: true as const, size: cachedRetiredKeys.size };
  }
}

/**
 * Basket membership comes from the raw cached Gingr payload rather than the
 * expiry-filtered dog list, so a dog waiting in the basket is never mistaken
 * for one the front desk already cleared.
 */
export function resolveGingrCheckoutBasketKeys(now: Date) {
  return (
    getCachedGingrBasketCheckoutKeys(now.getTime(), false) ??
    getCachedGingrBasketCheckoutKeys(now.getTime(), true)
  );
}

function mergeVisibleCheckouts(now: Date, promptedCheckouts: LiveDog[], gingrCheckoutDogs?: LiveDog[]) {
  const gingrCheckouts = gingrCheckoutDogs ?? loadCachedGingrCheckoutDogs(now);
  const gingrCheckoutKeys = resolveGingrCheckoutBasketKeys(now);
  let visibleCheckouts = mergeCheckoutDogs(gingrCheckouts, promptedCheckouts);
  let basketFiltered = false;

  if (gingrCheckoutKeys) {
    basketFiltered = true;
    // Drop Gingr-sourced rows the basket no longer lists; webhook rows keep their window.
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

const VISIBLE_TRANSITION_SELECT =
  "id, gingr_reservation_id, gingr_animal_id, animal_name, owner_name, photo_url, reservation_type, current_status, display_status, room, notes, flags, status_started_at, completed_at, display_until, last_seen_from_gingr_at, raw_payload, hidden, updated_at";

let visibleTransitionQueryInFlight: Promise<{ rows: LiveDog[]; timedOut: boolean }> | null = null;

/**
 * One shared `live_transition_dogs` read for lobby + staff. Concurrent polls
 * share the in-flight request. After a timeout, later polls skip the hung
 * table until the cooldown lifts.
 */
export async function queryVisibleLiveTransitionDogs(
  supabase: SupabaseClient
): Promise<{ rows: LiveDog[]; timedOut: boolean }> {
  if (isLiveTransitionQueryInCooldown()) {
    return { rows: [], timedOut: true };
  }
  if (visibleTransitionQueryInFlight) {
    return visibleTransitionQueryInFlight;
  }

  visibleTransitionQueryInFlight = (async () => {
    try {
      const { data, error } = await withTimeoutOrThrow(
        Promise.resolve(
          supabase
            .from("live_transition_dogs")
            .select(VISIBLE_TRANSITION_SELECT)
            .eq("hidden", false)
            .in("display_status", ["checking_in", "checking_out"])
            .order("status_started_at", { ascending: false, nullsFirst: false })
            .limit(FAST_BOARD_ROW_LIMIT)
        ),
        FAST_CHECKOUT_QUERY_TIMEOUT_MS,
        "fast-checkout live_transition_dogs"
      );
      if (error) throw error;
      return { rows: enrichDogs((data ?? []) as LiveDog[]), timedOut: false };
    } catch {
      markLiveTransitionQueryTimeout();
      return { rows: [], timedOut: true };
    }
  })().finally(() => {
    visibleTransitionQueryInFlight = null;
  });

  return visibleTransitionQueryInFlight;
}

/**
 * Lobby/admin checkout list. Delegates to the staff fast path so a hung
 * `live_transition_dogs` query still paints cached Gingr basket dogs.
 */
export async function loadFastPromptedCheckouts(
  supabase: SupabaseClient,
  now = new Date()
): Promise<FastCheckoutLoadResult> {
  const result = await loadFastBoardTransitions(supabase, now);
  return {
    checking_out: result.checking_out,
    newest_checkout_at: result.newest_checkout_at,
    prompted_count: result.prompted_count,
    raw_checkout_rows: result.raw_checkout_rows,
    filtered_unprompted_rows: result.filtered_unprompted_rows,
    expired_checkout_rows: result.expired_checkout_rows,
    basket_filtered: result.basket_filtered,
    basket_cleared_rows: result.basket_cleared_rows,
    data_source: result.data_source,
    supabase_timed_out: result.supabase_timed_out
  };
}

/**
 * Staff board fast path: one Supabase query for both active check-ins and
 * prompted checkouts, then merge the cached Gingr basket. A Supabase timeout
 * must still return those cached basket dogs — otherwise a hung REST call
 * hides a dog that is already in Gingr.
 */
export async function loadFastBoardTransitions(
  supabase: SupabaseClient,
  now = new Date()
): Promise<FastBoardTransitionLoadResult> {
  const { rows, timedOut: supabaseTimedOut } = await queryVisibleLiveTransitionDogs(supabase);

  const gingrBoardDogs = loadCachedGingrBoardDogs(now).filter((dog) => !isRetiredGingrDog(dog));

  const checkinRows = rows.filter((dog) => dog.display_status === "checking_in");
  const visibleCheckins = mergeCheckoutDogs(
    loadCachedGingrCheckinDogs(now, gingrBoardDogs),
    checkinRows.filter((dog) => !shouldExpireCheckinDog(dog, now))
  );

  const checkoutRows = rows.filter((dog) => dog.display_status === "checking_out");
  const prompted = checkoutRows.filter(isPromptedCheckoutDog);
  const expiredCount = prompted.filter((dog) => shouldExpireCheckoutDog(dog, now)).length;
  const { visibleCheckouts, basketFiltered } = mergeVisibleCheckouts(
    now,
    prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now)),
    loadCachedGingrCheckoutDogs(now, gingrBoardDogs)
  );

  let visible = applyCachedBackOfHousePhotos([...visibleCheckins, ...visibleCheckouts]);
  if (!supabaseTimedOut) {
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
    data_source: supabaseTimedOut ? "gingr_back_of_house_cache" : "supabase_live_transition_dogs",
    supabase_timed_out: supabaseTimedOut
  };
}

/** Hide Supabase checkout rows cleared from the cached Gingr basket (no live Gingr call). */
const BASKET_RECONCILE_DEBOUNCE_MS = 8_000;
let lastBasketReconcileAt = 0;

export async function reconcileCachedBasketClears(
  supabase: SupabaseClient,
  now = new Date()
) {
  if (isLiveTransitionQueryInCooldown()) {
    return { hidden_count: 0, skipped: true as const };
  }
  const elapsed = Date.now() - lastBasketReconcileAt;
  if (elapsed < BASKET_RECONCILE_DEBOUNCE_MS) {
    return { hidden_count: 0, skipped: true as const };
  }
  lastBasketReconcileAt = Date.now();
  const gingrCheckoutKeys = resolveGingrCheckoutBasketKeys(now);
  if (!gingrCheckoutKeys?.size) {
    return { hidden_count: 0, skipped: true as const };
  }
  return hideBasketClearedCheckoutRows(supabase, gingrCheckoutKeys, now);
}

/**
 * Retire transition rows whose display window already closed.
 *
 * Checkout completion intentionally leaves rows visible until `display_until`,
 * so without this sweep the active-row set grows all day and the newest dog can
 * fall outside the fast query's row limit. Runs unconditionally (a basket
 * snapshot is not required) and only ever touches already-expired rows.
 */
const EXPIRED_SWEEP_DEBOUNCE_MS = 15_000;
const EXPIRED_SWEEP_SCAN_LIMIT = 200;
let lastExpiredSweepAt = 0;

export async function sweepExpiredTransitionRows(supabase: SupabaseClient, now = new Date()) {
  if (isLiveTransitionQueryInCooldown()) {
    return { hidden_count: 0, skipped: true as const };
  }
  if (Date.now() - lastExpiredSweepAt < EXPIRED_SWEEP_DEBOUNCE_MS) {
    return { hidden_count: 0, skipped: true as const };
  }
  lastExpiredSweepAt = Date.now();

  try {
    const { data, error } = await supabase
      .from("live_transition_dogs")
      .select("id, gingr_reservation_id, gingr_animal_id, display_status, status_started_at, display_until, updated_at")
      .eq("hidden", false)
      .in("display_status", ["checking_in", "checking_out"])
      .order("status_started_at", { ascending: true })
      .limit(EXPIRED_SWEEP_SCAN_LIMIT);

    if (error) throw error;

    const rows = (data ?? []) as LiveDog[];
    const gingrCheckoutKeys = resolveGingrCheckoutBasketKeys(now);
    const expiredIds = rows
      .filter((row) => {
        if (row.display_status === "checking_in") return shouldExpireCheckinDog(row, now);
        // A dog still sitting in the Gingr basket is never swept.
        if (gingrCheckoutKeys?.size && isDogInGingrCheckoutBasket(row, gingrCheckoutKeys)) return false;
        return shouldExpireCheckoutDog(row, now);
      })
      .map((row) => row.id);

    if (!expiredIds.length) {
      return { hidden_count: 0 };
    }

    const nowIso = now.toISOString();
    const expiredRows = rows.filter((row) => expiredIds.includes(row.id));
    markDogsRetired(expiredRows, now.getTime());

    const { error: updateError } = await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        completed_at: nowIso,
        updated_at: nowIso
      })
      .in("id", expiredIds);

    if (updateError) throw updateError;

    return { hidden_count: expiredIds.length };
  } catch {
    markLiveTransitionQueryTimeout();
    return { hidden_count: 0, skipped: true as const };
  }
}
