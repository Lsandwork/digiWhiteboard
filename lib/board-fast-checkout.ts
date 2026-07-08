import { applyStoredAnimalPhotos } from "@/lib/animal-photo-store";
import {
  filterCheckoutsToGingrBasket,
  getCachedGingrBasketCheckoutKeys,
  hideBasketClearedCheckoutRows
} from "@/lib/basket-cleared-checkout";
import { resolveDogPhotoUrl } from "@/lib/board-utils";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { isPromptedCheckoutDog } from "@/lib/checkout-prompt";
import { sortCheckoutDogs } from "@/lib/board-checkout-merge";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

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

/** Supabase/webhook only — never calls Gingr. */
export async function loadFastPromptedCheckouts(
  supabase: SupabaseClient,
  now = new Date()
): Promise<FastCheckoutLoadResult> {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_out")
    .order("status_started_at", { ascending: true });

  if (error) throw error;

  const rows = enrichDogs((data ?? []) as LiveDog[]);
  const prompted = rows.filter(isPromptedCheckoutDog);
  const expiredCount = prompted.filter((dog) => shouldExpireCheckoutDog(dog, now)).length;
  let visible = prompted.filter((dog) => !shouldExpireCheckoutDog(dog, now));
  let basketFiltered = false;
  let basketClearedRows = 0;

  const gingrCheckoutKeys = getCachedGingrBasketCheckoutKeys(now.getTime());
  if (gingrCheckoutKeys) {
    basketFiltered = true;
    try {
      const hidden = await hideBasketClearedCheckoutRows(supabase, gingrCheckoutKeys, now);
      basketClearedRows = hidden.hidden_count;
    } catch {
      // Keep serving the last good board data when basket reconciliation fails.
    }
    visible = filterCheckoutsToGingrBasket(visible, gingrCheckoutKeys);
  }

  const withPhotos = await applyStoredAnimalPhotos(supabase, visible);

  return {
    checking_out: sortCheckoutDogs(withPhotos),
    newest_checkout_at: newestCheckoutTimestamp(withPhotos),
    prompted_count: prompted.length,
    raw_checkout_rows: rows.length,
    filtered_unprompted_rows: rows.length - prompted.length,
    expired_checkout_rows: expiredCount,
    basket_filtered: basketFiltered,
    basket_cleared_rows: basketClearedRows,
    data_source: "supabase_live_transition_dogs"
  };
}
