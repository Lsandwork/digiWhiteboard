/** Inner My Shift / OCC reads — abort hung REST so Vercel can respond. */
export const OPS_SNAPSHOT_TIMEOUT_MS = 6_000;

/**
 * Outer snapshot budget. Must stay under the My Shift client abort (8s) and
 * above the inner query timeout so a finished fallback is not discarded.
 */
export const OPS_SNAPSHOT_BUILD_TIMEOUT_MS = 7_000;

/** Keep a last-good My Shift payload across cold starts on the same instance. */
export const OPS_SNAPSHOT_LAST_GOOD_TTL_MS = 180_000;

/**
 * Positive warm TTL for a successful My Shift snapshot (per user).
 * Serves instant repeats while tab-switching without rebuilding every time.
 */
export const OPS_SNAPSHOT_POSITIVE_TTL_MS = 20_000;

/** Shared with /api/admin/staff-operations so My Shift reuses Team Log's warm list. */
export const STAFF_OPS_LIST_CACHE_KEY = "staff-ops:list";
export const STAFF_OPS_LIST_CACHE_TTL_MS = 20_000;

export const OPS_SNAPSHOT_CACHE_KEY = "ops-command-center:snapshot";
export const OPS_SNAPSHOT_LAST_GOOD_KEY = "ops-command-center:snapshot:last-good";
