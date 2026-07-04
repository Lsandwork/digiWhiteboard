import type { LiveDog } from "@/lib/types";

export const BOARD_CHECKOUT_POLL_MIN_MS = 2000;
export const BOARD_CHECKOUT_POLL_MAX_MS = 5000;
export const BOARD_CHECKOUT_POLL_MS = 2000;
export const BOARD_FULL_SYNC_POLL_MS = 8000;
export const BOARD_REALTIME_DEBOUNCE_MS = 250;

export function clampCheckoutPollMs(intervalMs: number) {
  return Math.min(BOARD_CHECKOUT_POLL_MAX_MS, Math.max(BOARD_CHECKOUT_POLL_MIN_MS, intervalMs));
}
export const BOARD_SETTINGS_POLL_MS = 15000;
export const BOARD_FETCH_TIMEOUT_MS = 10000;
export const BOARD_FAST_FETCH_TIMEOUT_MS = 4000;

export function sortCheckoutDogs(dogs: LiveDog[]) {
  return [...dogs].sort(
    (a, b) => new Date(a.status_started_at ?? a.updated_at).getTime() - new Date(b.status_started_at ?? b.updated_at).getTime()
  );
}

export function mergeCheckoutDogs(primary: LiveDog[], secondary: LiveDog[]) {
  const dogsByKey = new Map<string, LiveDog>();

  for (const dog of [...primary, ...secondary]) {
    const key = dog.gingr_reservation_id ?? dog.gingr_animal_id ?? dog.id;
    if (!dogsByKey.has(key)) dogsByKey.set(key, dog);
  }

  return [...dogsByKey.values()];
}

function checkoutKeysForDog(dog: LiveDog) {
  const keys: string[] = [];
  if (dog.gingr_reservation_id) keys.push(`res:${dog.gingr_reservation_id}`);
  if (dog.gingr_animal_id) keys.push(`animal:${dog.gingr_animal_id}`);
  return keys;
}

export function buildGingrCheckoutKeySet(dogs: LiveDog[]) {
  const keys = new Set<string>();
  for (const dog of dogs) {
    for (const key of checkoutKeysForDog(dog)) {
      keys.add(key);
    }
  }
  return keys;
}

export function isDogInGingrCheckoutBasket(dog: LiveDog, gingrCheckoutKeys: Set<string>) {
  return checkoutKeysForDog(dog).some((key) => gingrCheckoutKeys.has(key));
}

/** Drop Gingr-sourced rows cleared from the checkout basket; keep webhook rows for fast display. */
export function reconcileGingrSourcedCheckouts(merged: LiveDog[], gingrCheckoutDogs: LiveDog[]) {
  const gingrKeys = buildGingrCheckoutKeySet(gingrCheckoutDogs);
  return merged.filter((dog) => {
    if (dog.raw_payload?.source !== "gingr_back_of_house") return true;
    return isDogInGingrCheckoutBasket(dog, gingrKeys);
  });
}
