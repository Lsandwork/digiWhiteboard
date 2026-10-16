import { getOrLoadTtlCache, invalidateTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { loadAdminSettings, updateAdminSettings, type AdminGlobalSettings } from "@/lib/admin/settings";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import type { LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Short TTLs cut Supabase REST storms from board polling without going stale for staff. */
export const SETTINGS_CACHE_TTL_MS = 30_000;
export const ADMIN_SETTINGS_KEY_CACHE_TTL_MS = 30_000;
/** Shared process cache for staff board overlays — screens share one load per TTL. */
export const BOARD_OVERLAY_CACHE_TTL_MS = 15_000;
export const FAST_CHECKOUT_CACHE_TTL_MS = 150;
/** When the board is empty, cache longer so 2s polls do not hit Postgres every tick. */
export const EMPTY_FAST_CHECKOUT_CACHE_TTL_MS = 2_500;
export const LIVE_BOARD_CACHE_TTL_MS = 500;
export const EMPTY_LIVE_BOARD_CACHE_TTL_MS = 2_500;
export const WHITEBOARD_STATE_CACHE_TTL_MS = 800;
export const DISPLAY_SYNC_CACHE_TTL_MS = 5_000;

export function fastCheckoutCacheTtlMs(checkingIn: number, checkingOut: number) {
  return checkingIn + checkingOut === 0 ? EMPTY_FAST_CHECKOUT_CACHE_TTL_MS : FAST_CHECKOUT_CACHE_TTL_MS;
}

export function liveBoardCacheTtlMs(totalDogs: number) {
  return totalDogs === 0 ? EMPTY_LIVE_BOARD_CACHE_TTL_MS : LIVE_BOARD_CACHE_TTL_MS;
}

export function lobbyCheckoutCacheTtlMs(activeCount: number, queueLength: number) {
  return activeCount + queueLength === 0 ? EMPTY_FAST_CHECKOUT_CACHE_TTL_MS : FAST_CHECKOUT_CACHE_TTL_MS;
}

type FastCheckoutCounts = { checking_in: unknown[]; checking_out: unknown[] };

/** Deduped prompted-checkout load (admin dashboard widget — checkouts only). */
export async function getOrLoadPromptedCheckoutCache<T extends { checking_out: unknown[] }>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  return getOrLoadTtlCache(key, FAST_CHECKOUT_CACHE_TTL_MS, loader).then((result) => {
    setTtlCache(key, result, fastCheckoutCacheTtlMs(0, result.checking_out.length));
    return result;
  });
}

/** Deduped fast-checkout load with longer TTL when the board is empty. */
export async function getOrLoadFastCheckoutCache<T extends FastCheckoutCounts>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  return getOrLoadTtlCache(key, FAST_CHECKOUT_CACHE_TTL_MS, loader).then((result) => {
    setTtlCache(key, result, fastCheckoutCacheTtlMs(result.checking_in.length, result.checking_out.length));
    return result;
  });
}

/** Deduped lobby checkout load with longer TTL when the queue is empty. */
export async function getOrLoadLobbyCheckoutCache<T extends { activeCount: number; queue: unknown[] }>(
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  return getOrLoadTtlCache(key, FAST_CHECKOUT_CACHE_TTL_MS, loader).then((result) => {
    setTtlCache(key, result, lobbyCheckoutCacheTtlMs(result.activeCount, result.queue.length));
    return result;
  });
}

export function cachedLoadAdminSettings(supabase: SupabaseClient) {
  return getOrLoadTtlCache("settings:admin", SETTINGS_CACHE_TTL_MS, () => loadAdminSettings(supabase));
}

export function cachedLoadLobbySettings(supabase: SupabaseClient) {
  return getOrLoadTtlCache("settings:lobby", SETTINGS_CACHE_TTL_MS, () => loadLobbySettings(supabase));
}

export function cachedLoadStaffBoardSettings(supabase: SupabaseClient) {
  return getOrLoadTtlCache("settings:staff", SETTINGS_CACHE_TTL_MS, () => loadStaffBoardSettings(supabase));
}

export async function cachedUpdateAdminSettings(
  supabase: SupabaseClient,
  patch: Partial<AdminGlobalSettings>
): Promise<AdminGlobalSettings> {
  const next = await updateAdminSettings(supabase, patch);
  invalidateTtlCache("settings:");
  invalidateTtlCache("display-sync");
  return next;
}

export function invalidateBoardSettingsCaches() {
  invalidateTtlCache("settings:");
  invalidateTtlCache("display-sync");
  invalidateTtlCache("board-overlays:");
  invalidateTtlCache("whiteboard-state:");
}

/**
 * Per-instance freshness for event-driven overlay fetches. A board that
 * receives a change broadcast asks for `fresh=1`; whichever serverless
 * instance serves that request drops its overlay + admin-settings key
 * caches first, so no instance can serve pre-change overlay data on the
 * event path. Ordinary polls keep their TTL protection.
 */
export function invalidateBoardOverlayCaches() {
  invalidateTtlCache("board-overlays:");
  invalidateTtlCache("admin-settings:key:");
}

const FRESH_OVERLAY_MIN_INTERVAL_MS = 2_000;
let lastFreshOverlayClaimAtMs = 0;

/**
 * Server-side bound on cache-bypassing overlay loads: at most one fresh
 * (uncached) load per instance per window, no matter who asks. This keeps
 * the public board endpoint's TTL cost protection intact against repeated
 * `fresh=1` requests while matching the boards' own broadcast coalescing;
 * anything coalesced is recovered by the normal poll.
 */
export function claimFreshOverlayLoad(nowMs = Date.now()) {
  if (nowMs - lastFreshOverlayClaimAtMs < FRESH_OVERLAY_MIN_INTERVAL_MS) return false;
  lastFreshOverlayClaimAtMs = nowMs;
  return true;
}

/** Drop in-memory board snapshots after a live_transition_dogs webhook write. */
export function invalidateBoardTransitionCaches() {
  invalidateTtlCache("board-checkouts:");
  invalidateTtlCache("live-board:");
  invalidateTtlCache("lobby-checkouts:");
  invalidateTtlCache("whiteboard-state:");
}

export type CachedSettingsBundle = {
  admin: AdminGlobalSettings;
  lobby: LobbySettings;
  staff: StaffBoardSettings;
};

export function cachedLoadSettingsBundle(supabase: SupabaseClient): Promise<CachedSettingsBundle> {
  return getOrLoadTtlCache("settings:bundle", SETTINGS_CACHE_TTL_MS, async () => {
    const [admin, lobby, staff] = await Promise.all([
      loadAdminSettings(supabase),
      loadLobbySettings(supabase),
      loadStaffBoardSettings(supabase)
    ]);
    return { admin, lobby, staff };
  });
}
