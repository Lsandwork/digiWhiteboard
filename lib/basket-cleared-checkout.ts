import {
  isDogInGingrCheckoutBasket
} from "@/lib/board-checkout-merge";
import type { fetchGingrBackOfHouse } from "@/lib/gingr-board-sync";
import { getCachedBackOfHouseBoard } from "@/lib/gingr-request-guard";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

type GingrBasketBoard = Pick<Awaited<ReturnType<typeof fetchGingrBackOfHouse>>, "checking_out" | "source">;

export function buildGingrBasketCheckoutKeys(board: GingrBasketBoard) {
  const keys = new Set<string>();
  for (const record of board.checking_out) {
    if (record.id != null) keys.add(`res:${String(record.id)}`);
    if (record.animal_id != null) keys.add(`animal:${String(record.animal_id)}`);
  }
  return keys;
}

export function getCachedGingrBasketCheckoutKeys(now = Date.now(), allowStale = false) {
  const cached = getCachedBackOfHouseBoard(now, allowStale);
  if (!cached) return null;
  return buildGingrBasketCheckoutKeys(cached);
}

/** Fresh Gingr basket keys for display filtering — avoids stale-cache flicker during active checkouts. */
export function getFreshGingrBasketCheckoutKeys(now = Date.now()) {
  return getCachedGingrBasketCheckoutKeys(now, false);
}

export function filterCheckoutsToGingrBasket(dogs: LiveDog[], gingrCheckoutKeys: Set<string>) {
  return dogs.filter((dog) => isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys));
}

export async function hideBasketClearedCheckoutRows(
  supabase: SupabaseClient,
  gingrCheckoutKeys: Set<string>,
  now = new Date()
) {
  const { data, error } = await supabase
    .from("live_transition_dogs")
    .select("id, gingr_reservation_id, gingr_animal_id")
    .eq("hidden", false)
    .eq("display_status", "checking_out");

  if (error) throw error;

  const rows = (data ?? []) as Pick<LiveDog, "id" | "gingr_reservation_id" | "gingr_animal_id">[];
  const clearedIds = rows
    .filter((row) => !isDogInGingrCheckoutBasket(row as LiveDog, gingrCheckoutKeys))
    .map((row) => row.id);

  if (!clearedIds.length) {
    return { hidden_count: 0 };
  }

  const nowIso = now.toISOString();
  const { error: updateError } = await supabase
    .from("live_transition_dogs")
    .update({
      hidden: true,
      display_status: "removed",
      current_status: "basket_cleared",
      completed_at: nowIso,
      updated_at: nowIso
    })
    .in("id", clearedIds);

  if (updateError) throw updateError;

  return { hidden_count: clearedIds.length };
}
