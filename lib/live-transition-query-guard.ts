/**
 * In-memory brake for `live_transition_dogs` when PostgREST hangs.
 *
 * Lobby and staff boards poll about once a second. A 1500ms timeout on every
 * poll stacks hung connections and still returns no dogs. After a timeout,
 * skip the table for a few seconds and paint from the cached Gingr basket
 * instead — no extra Gingr QPS, no extra Supabase spend.
 */
export const LIVE_TRANSITION_QUERY_COOLDOWN_MS = 8_000;

let skipUntilMs = 0;

export function isLiveTransitionQueryInCooldown(now = Date.now()) {
  return now < skipUntilMs;
}

export function markLiveTransitionQueryTimeout(now = Date.now()) {
  skipUntilMs = now + LIVE_TRANSITION_QUERY_COOLDOWN_MS;
}

export function __resetLiveTransitionQueryCooldownForTests() {
  skipUntilMs = 0;
}
