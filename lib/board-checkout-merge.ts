import { shouldExpireCheckinDog } from "@/lib/checkin-display";
import { shouldExpireCheckoutDog } from "@/lib/checkout-display";
import { getCheckoutMergeKey } from "@/lib/board-sticky-checkout";
import type { LiveBoardResponse, LiveDog } from "@/lib/types";
import { getStableDogPhotoKey, rememberStableDogPhoto } from "@/lib/dog-photo-display-cache";

export const BOARD_CHECKOUT_POLL_MIN_MS = 1000;
export const BOARD_CHECKOUT_POLL_MAX_MS = 12_000;
/** Staff board fast poll — keep ≤1s so check-ins appear quickly when Realtime is down. */
export const BOARD_CHECKOUT_POLL_MS = 1000;
export const BOARD_FULL_SYNC_POLL_MS = 20_000;
/** Full board sync interval when Supabase Realtime is connected. */
export const BOARD_FULL_SYNC_POLL_LIVE_MS = 60_000;
export const BOARD_REALTIME_DEBOUNCE_MS = 0;
/**
 * Bridge multi-instance TTL lag after a webhook/realtime paint so a stale
 * poll cannot wipe the dog (appear → disappear → reappear flicker).
 */
export const WEBHOOK_CHECKIN_CACHE_GRACE_MS = 10_000;
/** Same hold for checkout rows while basket cache / other instances catch up. */
export const WEBHOOK_CHECKOUT_CACHE_GRACE_MS = 12_000;

/**
 * Once the whiteboard has recognized a dog, keep it visible for its full
 * display window even if a sibling Vercel instance briefly returns an empty list.
 * Explicit hide / expiry still removes the card.
 */
export function isRecognizedBoardDogSticky(dog: LiveDog, nowMs = Date.now()) {
  if (dog.hidden) return false;
  if (dog.display_status === "removed") return false;
  if (dog.display_status === "checking_in") {
    return !shouldExpireCheckinDog(dog, new Date(nowMs));
  }
  if (dog.display_status === "checking_out") {
    return !shouldExpireCheckoutDog(dog, new Date(nowMs));
  }
  return false;
}

export function clampCheckoutPollMs(intervalMs: number) {
  return Math.min(BOARD_CHECKOUT_POLL_MAX_MS, Math.max(BOARD_CHECKOUT_POLL_MIN_MS, intervalMs));
}
export const BOARD_SETTINGS_POLL_MS = 30_000;
export const BOARD_FETCH_TIMEOUT_MS = 10000;
export const BOARD_FAST_FETCH_TIMEOUT_MS = 4000;

/** Consecutive empty basket polls before clearing all checkout rows. */
export const EMPTY_BASKET_CONFIRM_POLLS = 2;

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

function transitionStartedMs(dog: LiveDog) {
  const started = dog.status_started_at ?? dog.updated_at;
  if (!started) return null;
  const startedMs = new Date(started).getTime();
  return Number.isFinite(startedMs) ? startedMs : null;
}

/** Keep a just-shown check-in visible while other Vercel instances still serve a stale empty cache. */
export function isWebhookCheckinWithinCacheGrace(dog: LiveDog, nowMs = Date.now()) {
  if (dog.hidden || dog.completed_at) return false;
  if (dog.display_status !== "checking_in") return false;
  if (dog.raw_payload?.source === "gingr_back_of_house") return false;
  if (shouldExpireCheckinDog(dog, new Date(nowMs))) return false;
  const startedMs = transitionStartedMs(dog);
  return startedMs != null && nowMs - startedMs <= WEBHOOK_CHECKIN_CACHE_GRACE_MS;
}

/**
 * Keep a just-shown checkout visible while basket cache / poll lag catches up.
 *
 * This is only a short bridge over a stale instance — the server holds the dog
 * for its full display window. Holding here for the whole window too would
 * resurrect dogs the server deliberately dropped (manual hide, column change).
 * `completed_at` is intentionally ignored: Gingr marks checkout complete while
 * the card still has time left on screen.
 */
export function isWebhookCheckoutWithinCacheGrace(dog: LiveDog, nowMs = Date.now()) {
  if (dog.hidden) return false;
  if (dog.display_status !== "checking_out") return false;
  if (dog.raw_payload?.source === "gingr_back_of_house") return false;
  if (shouldExpireCheckoutDog(dog, new Date(nowMs))) return false;
  const startedMs = transitionStartedMs(dog);
  return startedMs != null && nowMs - startedMs <= WEBHOOK_CHECKOUT_CACHE_GRACE_MS;
}

export function mergeCheckinListsForDisplay(
  serverCheckins: LiveDog[],
  previousCheckins: LiveDog[],
  nowMs = Date.now(),
  options: { suppressedKeys?: Set<string>; allowSticky?: boolean } = {}
) {
  const serverKeys = new Set(serverCheckins.flatMap((dog) => getTransitionMatchKeys(dog)));
  const stickyRows = previousCheckins.filter((dog) => {
    if (options.allowSticky === false) return isWebhookCheckinWithinCacheGrace(dog, nowMs);
    if (!isRecognizedBoardDogSticky(dog, nowMs) && !isWebhookCheckinWithinCacheGrace(dog, nowMs)) {
      return false;
    }
    const keys = getTransitionMatchKeys(dog);
    if (keys.some((key) => options.suppressedKeys?.has(key))) return false;
    // Keep recognized dogs missing from this poll so empty/stale instances cannot flicker them off.
    return keys.length ? !keys.some((key) => serverKeys.has(key)) : true;
  });
  return preserveDogPhotos(previousCheckins, mergeCheckoutDogs(serverCheckins, stickyRows));
}

export function mergeCheckoutListsForDisplay(
  serverCheckouts: LiveDog[],
  previousCheckouts: LiveDog[],
  options: {
    basketConfirmedEmpty?: boolean;
    nowMs?: number;
    suppressedKeys?: Set<string>;
    allowSticky?: boolean;
  } = {}
) {
  const nowMs = options.nowMs ?? Date.now();
  const serverKeys = new Set(serverCheckouts.flatMap((dog) => getTransitionMatchKeys(dog)));

  // Empty basket polls must not wipe dogs the whiteboard already recognized.
  // Only expiry / explicit hide / suppressed keys remove a painted card.
  if (options.basketConfirmedEmpty) {
    const hold = previousCheckouts.filter((dog) => {
      if (options.allowSticky === false) {
        return isWebhookCheckoutWithinAddGrace(dog, nowMs) || isWebhookCheckoutWithinCacheGrace(dog, nowMs);
      }
      return (
        isRecognizedBoardDogSticky(dog, nowMs) ||
        isWebhookCheckoutWithinAddGrace(dog, nowMs) ||
        isWebhookCheckoutWithinCacheGrace(dog, nowMs)
      );
    });
    return preserveDogPhotos(previousCheckouts, mergeCheckoutDogs(serverCheckouts, hold));
  }

  const stickyRows = previousCheckouts.filter((dog) => {
    if (options.allowSticky === false) return isWebhookCheckoutWithinCacheGrace(dog, nowMs);
    if (!isRecognizedBoardDogSticky(dog, nowMs) && !isWebhookCheckoutWithinCacheGrace(dog, nowMs)) {
      return false;
    }
    const keys = getTransitionMatchKeys(dog);
    if (keys.some((key) => options.suppressedKeys?.has(key))) return false;
    return keys.length ? !keys.some((key) => serverKeys.has(key)) : true;
  });

  return preserveDogPhotos(previousCheckouts, mergeCheckoutDogs(serverCheckouts, stickyRows));
}

export function mergeBoardResponse(
  previous: LiveBoardResponse,
  next: LiveBoardResponse,
  options: { suppressedKeys?: Set<string>; basketConfirmedEmpty?: boolean } = {}
): LiveBoardResponse {
  // Soft/stale/empty payloads must not wipe dogs that realtime just painted.
  const suspiciousEmpty =
    !next.checking_in.length &&
    !next.checking_out.length &&
    (previous.checking_in.length > 0 || previous.checking_out.length > 0);
  if ((next.stale || suspiciousEmpty) && suspiciousEmpty) {
    // Keep previous paint; a later healthy poll will reconcile expiry/hides.
    if (next.stale || next.error) return previous;
  }

  const checkingIn = mergeCheckinListsForDisplay(next.checking_in, previous.checking_in, Date.now(), {
    suppressedKeys: options.suppressedKeys
  });
  // Never invent "confirmed empty" from a single basket_filtered poll — that caused
  // appear→disappear→reappear when a sibling instance briefly returned an empty basket.
  const checkingOut = mergeCheckoutListsForDisplay(next.checking_out, previous.checking_out, {
    basketConfirmedEmpty: Boolean(options.basketConfirmedEmpty),
    suppressedKeys: options.suppressedKeys
  });

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
    checking_out: checkingOut,
    counts: {
      checking_in: checkingIn.length,
      checking_out: checkingOut.length,
      total: checkingIn.length + checkingOut.length
    }
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

/** Identity keys used to match the same dog across Gingr rows and Supabase rows. */
export function getTransitionMatchKeys(dog: LiveDog) {
  return checkoutKeysForDog(dog);
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

/** Show when in basket, or for the full checkout display window while basket cache catches up. */
export function shouldShowCheckoutAgainstBasket(dog: LiveDog, gingrCheckoutKeys: Set<string>, nowMs = Date.now()) {
  if (isDogInGingrCheckoutBasket(dog, gingrCheckoutKeys)) return true;
  if (!shouldExpireCheckoutDog(dog, new Date(nowMs))) return true;
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
