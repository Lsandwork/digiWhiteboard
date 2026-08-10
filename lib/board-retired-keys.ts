import { getTransitionMatchKeys } from "@/lib/board-checkout-merge";
import type { LiveDog } from "@/lib/types";

/**
 * Reservations the board already retired, mapped to when they were retired.
 *
 * Gingr keeps reporting a dog for the length of its display window, so without
 * this a manually hidden or already-expired dog would pop back onto the board.
 */
export type RetiredTransitionKeys = Map<string, number>;

export function buildRetiredTransitionKeys(rows: LiveDog[]): RetiredTransitionKeys {
  const retired: RetiredTransitionKeys = new Map();
  for (const row of rows) {
    const retiredAtMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
    if (!Number.isFinite(retiredAtMs)) continue;
    for (const key of getTransitionMatchKeys(row)) {
      retired.set(key, Math.max(retired.get(key) ?? 0, retiredAtMs));
    }
  }
  return retired;
}

let cachedRetiredKeys: RetiredTransitionKeys = new Map();

export function getCachedRetiredTransitionKeys() {
  return cachedRetiredKeys;
}

export function setCachedRetiredTransitionKeys(next: RetiredTransitionKeys) {
  cachedRetiredKeys = next;
}

/** Immediately suppress Gingr BOH re-injection after a hide/sweep — do not wait for refresh. */
export function markDogsRetired(
  dogs: Array<Pick<LiveDog, "gingr_reservation_id" | "gingr_animal_id" | "updated_at">>,
  retiredAtMs = Date.now()
) {
  for (const dog of dogs) {
    for (const key of getTransitionMatchKeys(dog as LiveDog)) {
      cachedRetiredKeys.set(key, Math.max(cachedRetiredKeys.get(key) ?? 0, retiredAtMs));
    }
  }
}

/** A Gingr row is stale only when we retired it *after* the event Gingr reports. */
export function isRetiredGingrDog(dog: LiveDog, retired: RetiredTransitionKeys = cachedRetiredKeys) {
  if (!retired.size) return false;
  const anchor = dog.status_started_at ?? dog.updated_at;
  const anchorMs = anchor ? new Date(anchor).getTime() : 0;
  return getTransitionMatchKeys(dog).some((key) => {
    const retiredAtMs = retired.get(key);
    return retiredAtMs != null && retiredAtMs >= anchorMs;
  });
}
