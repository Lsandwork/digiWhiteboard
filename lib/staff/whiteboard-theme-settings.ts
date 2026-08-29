import {
  loadAdminSettingsJsonKey,
  saveAdminSettingsJsonKey
} from "@/lib/admin/settings-json-store";
import { getOrLoadTtlCache, getTtlCache, invalidateTtlCache, setTtlCache } from "@/lib/server-ttl-cache";
import { SETTINGS_CACHE_TTL_MS } from "@/lib/board-settings-cache";
import {
  DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  normalizeStaffWhiteboardThemeId,
  STAFF_WHITEBOARD_THEME_SETTING_KEY,
  type StaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-themes";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const THEME_CACHE_KEY = "settings:staff-whiteboard-theme";

/**
 * Load the selected staff whiteboard theme ID (process-cached).
 * Only the ID is stored — theme tokens stay in code.
 */
export async function loadStaffWhiteboardThemeId(
  supabase: SupabaseClient
): Promise<StaffWhiteboardThemeId> {
  return getOrLoadTtlCache(THEME_CACHE_KEY, SETTINGS_CACHE_TTL_MS, async () => {
    try {
      const value = await loadAdminSettingsJsonKey(
        supabase,
        STAFF_WHITEBOARD_THEME_SETTING_KEY,
        (raw) => normalizeStaffWhiteboardThemeId(raw),
        DEFAULT_STAFF_WHITEBOARD_THEME_ID
      );
      return normalizeStaffWhiteboardThemeId(value);
    } catch {
      return DEFAULT_STAFF_WHITEBOARD_THEME_ID;
    }
  });
}

export async function saveStaffWhiteboardThemeId(
  supabase: SupabaseClient,
  themeId: StaffWhiteboardThemeId
): Promise<StaffWhiteboardThemeId> {
  const next = normalizeStaffWhiteboardThemeId(themeId);
  await saveAdminSettingsJsonKey(supabase, STAFF_WHITEBOARD_THEME_SETTING_KEY, next);
  setTtlCache(THEME_CACHE_KEY, next, SETTINGS_CACHE_TTL_MS);
  try {
    const { invalidateBoardSettingsCaches } = await import("@/lib/board-settings-cache");
    invalidateBoardSettingsCaches();
  } catch {
    invalidateTtlCache(THEME_CACHE_KEY);
  }
  return next;
}

export function peekStaffWhiteboardThemeIdCache(): StaffWhiteboardThemeId | null {
  return getTtlCache<StaffWhiteboardThemeId>(THEME_CACHE_KEY);
}
