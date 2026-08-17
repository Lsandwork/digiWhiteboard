export type GingrEndpoint =
  | "back_of_house"
  | "reservation_types"
  | "animal_photo"
  | "medication_info"
  | "medication_report_history";

type CachedBackOfHouseRecord = {
  animal_id?: string | number;
  photo_url?: string | null;
  image?: string | null;
  image_url?: string | null;
  [key: string]: unknown;
};

/**
 * Back-of-house is the only source for check-ins and basket adds that never sent a
 * webhook, so it drives how fast those dogs reach the board. One request per
 * interval is shared by every board, so this stays cheap for Gingr.
 */
const BACK_OF_HOUSE_COOLDOWN_MS = Number(process.env.GINGR_BACK_OF_HOUSE_COOLDOWN_MS ?? 4000);
const GLOBAL_MIN_INTERVAL_MS = Number(process.env.GINGR_GLOBAL_MIN_INTERVAL_MS ?? 2000);
const BACK_OF_HOUSE_STALE_MS = Number(process.env.GINGR_BACK_OF_HOUSE_STALE_MS ?? 60000);
export const ANIMAL_PHOTO_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const lastCallByEndpoint = new Map<GingrEndpoint, number>();
const perAnimalLastFetch = new Map<string, number>();
let lastGlobalCallAt = 0;

type CachedBackOfHouseBoard = {
  checking_in: CachedBackOfHouseRecord[];
  checking_out: CachedBackOfHouseRecord[];
  source: "gingr_back_of_house";
  cachedAt: number;
};

let cachedBackOfHouseBoard: CachedBackOfHouseBoard | null = null;

export function isGingrPhotoFetchEnabled() {
  const flag = process.env.GINGR_FETCH_ANIMAL_PHOTOS?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  // Opt-out: fetch photos when Gingr is configured unless explicitly disabled.
  return Boolean(process.env.GINGR_API_KEY?.trim() || process.env.TL_GINGR_KEY?.trim());
}

export function canCallGingrEndpoint(endpoint: GingrEndpoint, now = Date.now()) {
  const lastEndpointCall = lastCallByEndpoint.get(endpoint) ?? 0;

  if (endpoint === "back_of_house" && now - lastEndpointCall < BACK_OF_HOUSE_COOLDOWN_MS) {
    return false;
  }

  // Animal photos must not wait behind back-of-house polling or boards stay letter-only.
  if (endpoint === "animal_photo") {
    return now - lastEndpointCall >= 200;
  }

  // Per-animal medication pulls during TL Digi Board sync — light spacing only.
  if (endpoint === "medication_info" || endpoint === "medication_report_history") {
    return now - lastEndpointCall >= 100;
  }

  if (now - lastGlobalCallAt < GLOBAL_MIN_INTERVAL_MS) {
    return false;
  }

  return true;
}

export function markGingrEndpointCalled(endpoint: GingrEndpoint, now = Date.now()) {
  lastCallByEndpoint.set(endpoint, now);
  if (endpoint !== "animal_photo" && endpoint !== "medication_info" && endpoint !== "medication_report_history") {
    lastGlobalCallAt = now;
  }
}

export function getCachedBackOfHouseBoard(now = Date.now(), allowStale = false) {
  if (!cachedBackOfHouseBoard) return null;
  if (!allowStale && now - cachedBackOfHouseBoard.cachedAt > BACK_OF_HOUSE_STALE_MS) return null;

  return {
    checking_in: cachedBackOfHouseBoard.checking_in,
    checking_out: cachedBackOfHouseBoard.checking_out,
    source: cachedBackOfHouseBoard.source
  };
}

export function setCachedBackOfHouseBoard(board: {
  checking_in: CachedBackOfHouseRecord[];
  checking_out: CachedBackOfHouseRecord[];
  source: "gingr_back_of_house";
}) {
  cachedBackOfHouseBoard = {
    ...board,
    cachedAt: Date.now()
  };
}

export function canFetchAnimalPhoto(animalId: string, now = Date.now(), options?: { bypassFetchGate?: boolean }) {
  if (!options?.bypassFetchGate && !isGingrPhotoFetchEnabled()) return false;

  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return false;

  if (options?.bypassFetchGate) return true;

  const lastFetch = perAnimalLastFetch.get(trimmedAnimalId) ?? 0;
  return now - lastFetch >= ANIMAL_PHOTO_COOLDOWN_MS;
}

export function markAnimalPhotoFetch(animalId: string, now = Date.now()) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return;
  perAnimalLastFetch.set(trimmedAnimalId, now);
}
