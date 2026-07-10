import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import {
  filterCheckoutsToGingrBasket,
  getCachedGingrBasketCheckoutKeys
} from "@/lib/basket-cleared-checkout";
import { applyCachedBackOfHousePhotos } from "@/lib/board-animal-photo-sources";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { sortCheckoutDogs } from "@/lib/board-checkout-merge";
import { withTimeoutOrThrow } from "@/lib/server-ttl-cache";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const FAST_CHECKOUT_QUERY_TIMEOUT_MS = 2500;
const FAST_CHECKOUT_PHOTO_TIMEOUT_MS = 1200;

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

function enrichDogs(dogs: LiveDog[]) {
  return dogs.map((dog) => ({
    ...dog,
    photo_url: dog.photo_url ?? resolveDogPhotoUrl(dog)
  }));
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
  let visible = prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now));
  let basketFiltered = false;

  const gingrCheckoutKeys = getCachedGingrBasketCheckoutKeys(now.getTime(), true);
  if (gingrCheckoutKeys) {
    basketFiltered = true;
    visible = filterCheckoutsToGingrBasket(visible, gingrCheckoutKeys);
  }

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
