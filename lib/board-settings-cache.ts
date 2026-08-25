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
export const BOARD_OVERLAY_CACHE_TTL_MS = 5_000;
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
