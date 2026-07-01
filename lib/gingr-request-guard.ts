export type GingrEndpoint = "back_of_house" | "reservation_types" | "animal_photo";

type CachedBackOfHouseRecord = {
  animal_id?: string | number;
  photo_url?: string | null;
  image?: string | null;
  image_url?: string | null;
  [key: string]: unknown;
};

const BACK_OF_HOUSE_COOLDOWN_MS = Number(process.env.GINGR_BACK_OF_HOUSE_COOLDOWN_MS ?? 9000);
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
  return process.env.GINGR_FETCH_ANIMAL_PHOTOS === "true";
}

export function canCallGingrEndpoint(endpoint: GingrEndpoint, now = Date.now()) {
  const lastEndpointCall = lastCallByEndpoint.get(endpoint) ?? 0;

  if (endpoint === "back_of_house" && now - lastEndpointCall < BACK_OF_HOUSE_COOLDOWN_MS) {
    return false;
  }

  if (now - lastGlobalCallAt < GLOBAL_MIN_INTERVAL_MS) {
    return false;
  }

  return true;
}

export function markGingrEndpointCalled(endpoint: GingrEndpoint, now = Date.now()) {
  lastCallByEndpoint.set(endpoint, now);
  lastGlobalCallAt = now;
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

export function canFetchAnimalPhoto(animalId: string, now = Date.now()) {
  if (!isGingrPhotoFetchEnabled()) return false;

  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return false;

  const lastFetch = perAnimalLastFetch.get(trimmedAnimalId) ?? 0;
  return now - lastFetch >= ANIMAL_PHOTO_COOLDOWN_MS;
}

export function markAnimalPhotoFetch(animalId: string, now = Date.now()) {
  const trimmedAnimalId = animalId.trim();
  if (!trimmedAnimalId) return;
  perAnimalLastFetch.set(trimmedAnimalId, now);
}
