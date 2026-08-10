import { fetchGingrBackOfHouse } from "@/lib/gingr-board-sync";
import { canCallGingrEndpoint } from "@/lib/gingr-request-guard";

/**
 * Background refresh of the cached Gingr back-of-house board.
 *
 * This is what makes a check-in or basket add that never sent a webhook reach the
 * board in seconds instead of waiting for the slow full poll. Board clients never
 * wait on it — callers run it inside `after()` so the 1s fast poll always answers
 * from Supabase plus the cached board. Gingr traffic stays bounded by three
 * layers: this interval, the back_of_house cooldown, and the Next data cache on
 * the Gingr fetch, so it is one shared request per interval no matter how many
 * boards, TVs, or tabs are polling.
 */
const BOARD_REFRESH_INTERVAL_MS = Number(process.env.GINGR_BASKET_REFRESH_MS ?? 4000);

let lastBoardRefreshAt = 0;
let boardRefreshInFlight: Promise<void> | null = null;

export function getGingrBoardRefreshIntervalMs() {
  return BOARD_REFRESH_INTERVAL_MS;
}

export async function refreshGingrBoardCache(now = Date.now()) {
  if (boardRefreshInFlight) return { refreshed: false, reason: "in_flight" as const };
  if (now - lastBoardRefreshAt < BOARD_REFRESH_INTERVAL_MS) {
    return { refreshed: false, reason: "interval" as const };
  }
  if (!canCallGingrEndpoint("back_of_house", now)) {
    return { refreshed: false, reason: "cooldown" as const };
  }

  lastBoardRefreshAt = now;
  boardRefreshInFlight = fetchGingrBackOfHouse({ allReservationTypes: true })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      boardRefreshInFlight = null;
    });

  await boardRefreshInFlight;
  return { refreshed: true, reason: null };
}
