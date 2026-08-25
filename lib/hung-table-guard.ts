/**
 * Circuit breaker for PostgREST tables that hang in production.
 *
 * Confirmed hang class: `live_transition_dogs`, `gingr_webhook_events`,
 * `admin_settings`. Promise.race / withTimeoutFallback does **not** cancel the
 * underlying fetch. Abandoned REST calls keep occupying Postgres backends until
 * `getServiceSupabase` aborts them — 8s by default. Interactive polls then
 * stack those backends, which is why System Health, Overview, My Shift, and
 * the boards time out together.
 *
 * After a timeout/abort, skip that table for a few seconds. Queries of hung
 * tables must use `getHungTableSupabase()` so the fetch is actually aborted at
 * 1.2s instead of racing an 8s client.
 */

import { getServiceSupabase } from "@/lib/supabase/server";

export const HUNG_TABLE_QUERY_COOLDOWN_MS = 8_000;
export const HUNG_TABLE_ABORT_MS = 1_200;

export const HUNG_TABLES = {
  liveTransitionDogs: "live_transition_dogs",
  gingrWebhookEvents: "gingr_webhook_events",
  adminSettings: "admin_settings"
} as const;

export type HungTableName = (typeof HUNG_TABLES)[keyof typeof HUNG_TABLES];

const skipUntilMs = new Map<string, number>();

export function isHungTableInCooldown(table: string, now = Date.now()) {
  return now < (skipUntilMs.get(table) ?? 0);
}

export function markHungTableTimeout(table: string, now = Date.now()) {
  skipUntilMs.set(table, now + HUNG_TABLE_QUERY_COOLDOWN_MS);
}

export function anyHungTableInCooldown(now = Date.now()) {
  for (const until of skipUntilMs.values()) {
    if (now < until) return true;
  }
  return false;
}

export function isHungQueryError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object" && error !== null && "name" in error) {
    if (String((error as { name?: string }).name) === "AbortError") return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error);
  return /aborted|abort|timed out|timeout/i.test(message);
}

/** Dedicated client whose fetch is aborted at the hung-table budget — not 8s. */
export function getHungTableSupabase(timeoutMs = HUNG_TABLE_ABORT_MS) {
  return getServiceSupabase({ timeoutMs });
}

export async function skipOrQueryHungTable<T>(
  table: string,
  work: () => Promise<T>,
  fallback: T,
  now = Date.now()
): Promise<{ value: T; timedOut: boolean; skipped: boolean }> {
  if (isHungTableInCooldown(table, now)) {
    return { value: fallback, timedOut: true, skipped: true };
  }
  try {
    const value = await work();
    return { value, timedOut: false, skipped: false };
  } catch (error) {
    if (isHungQueryError(error)) {
      markHungTableTimeout(table, now);
      return { value: fallback, timedOut: true, skipped: false };
    }
    throw error;
  }
}

export function isLiveTransitionQueryInCooldown(now = Date.now()) {
  return isHungTableInCooldown(HUNG_TABLES.liveTransitionDogs, now);
}

export function markLiveTransitionQueryTimeout(now = Date.now()) {
  markHungTableTimeout(HUNG_TABLES.liveTransitionDogs, now);
}

export function __resetHungTableCooldownsForTests() {
  skipUntilMs.clear();
}

export const __resetLiveTransitionQueryCooldownForTests = __resetHungTableCooldownsForTests;
