import { getOrLoadTtlCache, invalidateTtlCache } from "@/lib/server-ttl-cache";
import { loadAdminSettings, updateAdminSettings, type AdminGlobalSettings } from "@/lib/admin/settings";
import { loadLobbySettings } from "@/lib/lobby/settings";
import { loadStaffBoardSettings } from "@/lib/staff/settings";
import type { LobbySettings } from "@/lib/lobby/types";
import type { StaffBoardSettings } from "@/lib/admin/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Short TTLs cut Supabase REST storms from board polling without going stale for staff. */
export const SETTINGS_CACHE_TTL_MS = 8_000;
export const BOARD_OVERLAY_CACHE_TTL_MS = 5_000;
export const FAST_CHECKOUT_CACHE_TTL_MS = 500;
export const LIVE_BOARD_CACHE_TTL_MS = 2_000;
export const WHITEBOARD_STATE_CACHE_TTL_MS = 2_000;
export const DISPLAY_SYNC_CACHE_TTL_MS = 5_000;

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
  invalidateTtlCache("settings:admin");
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
