import { fetchGingrBackOfHouse } from "@/lib/gingr-board-sync";
import { canCallGingrEndpoint } from "@/lib/gingr-request-guard";

/**
 * Background refresh of the Gingr checkout basket cache.
 *
 * Board clients never wait on Gingr — this runs inside `after()` so the 1s fast
 * poll always answers from Supabase + the cached basket. Gingr traffic stays
 * bounded by three layers: this interval, the back_of_house cooldown, and the
 * Next data cache on the Gingr fetch itself.
 */
const BASKET_REFRESH_INTERVAL_MS = Number(process.env.GINGR_BASKET_REFRESH_MS ?? 5000);

let lastBasketRefreshAt = 0;
let basketRefreshInFlight: Promise<void> | null = null;

export function getGingrBasketRefreshIntervalMs() {
  return BASKET_REFRESH_INTERVAL_MS;
}

export async function refreshGingrBasketCache(now = Date.now()) {
  if (basketRefreshInFlight) return { refreshed: false, reason: "in_flight" as const };
  if (now - lastBasketRefreshAt < BASKET_REFRESH_INTERVAL_MS) {
    return { refreshed: false, reason: "interval" as const };
  }
  if (!canCallGingrEndpoint("back_of_house", now)) {
    return { refreshed: false, reason: "cooldown" as const };
  }

  lastBasketRefreshAt = now;
  basketRefreshInFlight = fetchGingrBackOfHouse({ allReservationTypes: true })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      basketRefreshInFlight = null;
    });

  await basketRefreshInFlight;
  return { refreshed: true, reason: null };
}
