import { getCheckoutMergeKey } from "@/lib/board-sticky-checkout";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";
import { getStableDogPhotoKey, rememberStableDogPhoto } from "@/lib/dog-photo-display-cache";

export const BOARD_CHECKOUT_POLL_MIN_MS = 1500;
export const BOARD_CHECKOUT_POLL_MAX_MS = 12_000;
export const BOARD_CHECKOUT_POLL_MS = 1500;
export const BOARD_FULL_SYNC_POLL_MS = 20_000;
export const BOARD_REALTIME_DEBOUNCE_MS = 0;

export function clampCheckoutPollMs(intervalMs: number) {
  return Math.min(BOARD_CHECKOUT_POLL_MAX_MS, Math.max(BOARD_CHECKOUT_POLL_MIN_MS, intervalMs));
}
export const BOARD_SETTINGS_POLL_MS = 30_000;
export const BOARD_FETCH_TIMEOUT_MS = 10000;
export const BOARD_FAST_FETCH_TIMEOUT_MS = 4000;

/** Consecutive empty basket polls before clearing all checkout rows (1 = immediate). */
export const EMPTY_BASKET_CONFIRM_POLLS = 1;

/** Webhook checkouts may show briefly before the Gingr basket cache includes them. */
export const WEBHOOK_BASKET_ADD_GRACE_MS = 12_000;

export function sortCheckoutDogs(dogs: LiveDog[]) {
  return [...dogs].sort(
    (a, b) => new Date(a.status_started_at ?? a.updated_at).getTime() - new Date(b.status_started_at ?? b.updated_at).getTime()
  );
}

export function preserveDogPhotos(previousDogs: LiveDog[], nextDogs: LiveDog[]) {
  if (!previousDogs.length) return nextDogs;

  const previousByKey = new Map(previousDogs.map((dog) => [getStableDogPhotoKey(dog), dog]));
  return nextDogs.map((dog) => {
    const previous = previousByKey.get(getStableDogPhotoKey(dog));
    const photoUrl = dog.photo_url?.trim() || previous?.photo_url?.trim() || null;
    if (!photoUrl) return dog;
    rememberStableDogPhoto(getStableDogPhotoKey(dog), photoUrl);
    if (dog.photo_url?.trim()) return dog;
    return { ...dog, photo_url: photoUrl };
  });
}

export function mergeBoardResponse(previous: LiveBoardResponse, next: LiveBoardResponse): LiveBoardResponse {
  const checkingIn = preserveDogPhotos(previous.checking_in, next.checking_in);
  const checkingOut = preserveDogPhotos(previous.checking_out, next.checking_out);

  if (
    areCheckoutListsEquivalent(previous.checking_in, checkingIn) &&
    areCheckoutListsEquivalent(previous.checking_out, checkingOut) &&
    previous.last_updated === next.last_updated
  ) {
    return previous;
  }

  return {
    ...next,
    checking_in: checkingIn,
    checking_out: checkingOut
  };
}

export function areCheckoutListsEquivalent(previous: LiveDog[], next: LiveDog[]) {
  if (previous.length !== next.length) return false;

  const previousByKey = new Map(previous.map((dog) => [getCheckoutMergeKey(dog), dog]));
  for (const dog of next) {
    const existing = previousByKey.get(getCheckoutMergeKey(dog));
    if (!existing) return false;
    if (existing.hidden !== dog.hidden) return false;
    if (existing.display_status !== dog.display_status) return false;
    if (existing.animal_name !== dog.animal_name) return false;
    if ((existing.photo_url ?? null) !== (dog.photo_url ?? null)) return false;
    if ((existing.display_until ?? null) !== (dog.display_until ?? null)) return false;
    if ((existing.status_started_at ?? null) !== (dog.status_started_at ?? null)) return false;
  }

  return true;
}

export function mergeCheckoutDogs(primary: LiveDog[], secondary: LiveDog[]) {
  const dogsByKey = new Map<string, LiveDog>();

  for (const dog of [...primary, ...secondary]) {
    const key = dog.gingr_reservation_id ?? dog.gingr_animal_id ?? dog.id;
    const existing = dogsByKey.get(key);
    if (!existing) {
      dogsByKey.set(key, dog);
      continue;
    }

    dogsByKey.set(key, {
      ...existing,
      ...dog,
      photo_url: dog.photo_url ?? existing.photo_url
    });
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

export function isFastWebhookTransition(dog: LiveDog) {
  return dog.raw_payload?.source === "gingr_webhook";
}

export function isWebhookCheckoutWithinAddGrace(dog: LiveDog, nowMs = Date.now()) {
  if (!isFastWebhookTransition(dog) || dog.display_status !== "checking_out") return false;
  const started = dog.status_started_at ?? dog.updated_at;
  if (!started) return false;
  const startedMs = new Date(started).getTime();
  return Number.isFinite(startedMs) && nowMs - startedMs <= WEBHOOK_BASKET_ADD_GRACE_MS;
}

/** Show when in basket, or briefly after webhook prompt while basket cache catches up. */
export function shouldShowCheckoutAgainstBasket(dog: LiveDog, gingrCheckoutKeys: Set<string>, nowMs = Date.now()) {
  if (isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)) return true;
  return isWebhookCheckoutWithinAddGrace(dog, nowMs);
}

/** Webhook rows appear immediately on prompt; drop once cleared from basket. */
export function includePromptedCheckoutInBoard(dog: LiveDog, gingrCheckoutKeys: Set<string>, nowMs = Date.now()) {
  return shouldShowCheckoutAgainstBasket(dog, gingrCheckoutKeys, nowMs);
}

/** Drop Gingr-sourced rows cleared from the checkout basket; keep webhook rows for fast display. */
export function reconcileGingrSourcedCheckouts(merged: LiveDog[], gingrCheckoutDogs: LiveDog[]) {
  const gingrKeys = buildGingrCheckoutKeySet(gingrCheckoutDogs);
  return merged.filter((dog) => {
    if (dog.raw_payload?.source !== "gingr_back_of_house") return true;
    return isDogInGingrCheckoutBasket(dog, gingrKeys);
  });
}
