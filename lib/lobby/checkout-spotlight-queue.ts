/**
 * Pure checkout spotlight queue / window logic for the lobby TV.
 * No I/O — safe to unit test.
 */

import { getLobbyCheckoutMergeKey } from "@/lib/lobby-display-stable";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";

export const SPOTLIGHT_DURATION_SHORT_MS = 2 * 60_000;
export const SPOTLIGHT_DURATION_LONG_MS = 5 * 60_000;
export const SPOTLIGHT_MAX_VISIBLE = 2;

export type CheckoutSpotlightEntry = {
  /** Stable identity for this checkout event (dedupe key). */
  key: string;
  dog: LobbyCheckoutDog;
  enqueuedAt: number;
  promptedAtMs: number;
};

export type CheckoutSpotlightWindow = {
  keys: string[];
  startedAt: number;
  durationMs: number;
};

export type CheckoutSpotlightState = {
  queue: CheckoutSpotlightEntry[];
  /** Identities that already finished a spotlight window for this event. */
  completedKeys: string[];
  window: CheckoutSpotlightWindow | null;
};

export function getCheckoutSpotlightEventKey(dog: LobbyCheckoutDog): string {
  const base = getLobbyCheckoutMergeKey(dog);
  const prompted = String(dog.prompted_at || dog.display_until || dog.id || "").trim();
  return `${base}:${prompted || "unknown"}`;
}

export function emptyCheckoutSpotlightState(): CheckoutSpotlightState {
  return { queue: [], completedKeys: [], window: null };
}

function promptedMs(dog: LobbyCheckoutDog) {
  const raw = dog.prompted_at || dog.display_until;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

export function sortCheckoutDogsChronologically(dogs: LobbyCheckoutDog[]) {
  return [...dogs].sort((a, b) => {
    const diff = promptedMs(a) - promptedMs(b);
    if (diff !== 0) return diff;
    return getCheckoutSpotlightEventKey(a).localeCompare(getCheckoutSpotlightEventKey(b));
  });
}

export function spotlightDurationMs(
  queueLengthAtWindowStart: number,
  options?: { fast?: boolean }
) {
  if (options?.fast) {
    return queueLengthAtWindowStart > SPOTLIGHT_MAX_VISIBLE ? 4_000 : 8_000;
  }
  return queueLengthAtWindowStart > SPOTLIGHT_MAX_VISIBLE
    ? SPOTLIGHT_DURATION_SHORT_MS
    : SPOTLIGHT_DURATION_LONG_MS;
}

/**
 * Merge live checkout dogs into the spotlight queue without resetting timers.
 * - Adds new checkout events in chronological order
 * - Skips identities already completed or already queued
 * - Does not remove queued dogs solely because polling briefly dropped them
 */
export function syncCheckoutSpotlightQueue(
  state: CheckoutSpotlightState,
  dogs: LobbyCheckoutDog[],
  nowMs = Date.now()
): CheckoutSpotlightState {
  const completed = new Set(state.completedKeys);
  const queuedKeys = new Set(state.queue.map((entry) => entry.key));
  const nextQueue = [...state.queue];

  for (const dog of sortCheckoutDogsChronologically(dogs)) {
    const key = getCheckoutSpotlightEventKey(dog);
    if (completed.has(key) || queuedKeys.has(key)) {
      // Refresh dog snapshot for photo/name updates without changing queue position/timer.
      const idx = nextQueue.findIndex((entry) => entry.key === key);
      if (idx >= 0) {
        nextQueue[idx] = { ...nextQueue[idx]!, dog };
      }
      continue;
    }
    queuedKeys.add(key);
    nextQueue.push({
      key,
      dog,
      enqueuedAt: nowMs,
      promptedAtMs: promptedMs(dog)
    });
  }

  nextQueue.sort((a, b) => {
    const diff = a.promptedAtMs - b.promptedAtMs;
    if (diff !== 0) return diff;
    return a.enqueuedAt - b.enqueuedAt;
  });

  return {
    ...state,
    queue: nextQueue,
    completedKeys: [...completed]
  };
}

export function getActiveSpotlightDogs(state: CheckoutSpotlightState): LobbyCheckoutDog[] {
  if (!state.window) return [];
  const byKey = new Map(state.queue.map((entry) => [entry.key, entry.dog] as const));
  return state.window.keys.map((key) => byKey.get(key)).filter(Boolean) as LobbyCheckoutDog[];
}

export function isSpotlightWindowExpired(state: CheckoutSpotlightState, nowMs = Date.now()) {
  if (!state.window) return false;
  return nowMs - state.window.startedAt >= state.window.durationMs;
}

export function spotlightRemainingMs(state: CheckoutSpotlightState, nowMs = Date.now()) {
  if (!state.window) return 0;
  return Math.max(0, state.window.durationMs - (nowMs - state.window.startedAt));
}

/**
 * Advance expired windows and open the next 1–2 dog window when needed.
 * Returns a new state object only when something changes.
 */
export function advanceCheckoutSpotlightState(
  state: CheckoutSpotlightState,
  nowMs = Date.now(),
  options?: { fast?: boolean }
): CheckoutSpotlightState {
  let next = state;

  if (next.window && isSpotlightWindowExpired(next, nowMs)) {
    const completed = new Set(next.completedKeys);
    for (const key of next.window.keys) completed.add(key);
    const remaining = next.queue.filter((entry) => !completed.has(entry.key));
    next = {
      queue: remaining,
      completedKeys: [...completed],
      window: null
    };
  }

  if (!next.window && next.queue.length > 0) {
    const take = Math.min(SPOTLIGHT_MAX_VISIBLE, next.queue.length);
    const keys = next.queue.slice(0, take).map((entry) => entry.key);
    next = {
      ...next,
      window: {
        keys,
        startedAt: nowMs,
        durationMs: spotlightDurationMs(next.queue.length, options)
      }
    };
  }

  return next;
}

export function checkoutSpotlightIsActive(state: CheckoutSpotlightState) {
  return Boolean(state.window && state.window.keys.length > 0);
}
