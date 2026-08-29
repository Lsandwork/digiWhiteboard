import type { StaffBoardSettings } from "@/lib/admin/types";
import {
  loadStaffWhiteboardThemeId,
  saveStaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-theme-settings";
import {
  DEFAULT_STAFF_WHITEBOARD_THEME_ID,
  normalizeStaffWhiteboardThemeId,
  type StaffWhiteboardThemeId
} from "@/lib/staff/whiteboard-themes";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const defaultStaffSettings: StaffBoardSettings = {
  refresh_interval_ms: 2000,
  team_reminder: "Remember: greet every pup by name and confirm checkout prompts.",
  important_notice: "Front desk stays synced with Gingr — no manual board edits needed.",
  show_team_reminders: true,
  footer_message: null,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null,
  whiteboard_theme: DEFAULT_STAFF_WHITEBOARD_THEME_ID
};

export async function loadStaffBoardSettings(supabase: SupabaseClient): Promise<StaffBoardSettings> {
  try {
    const [{ data, error }, whiteboardTheme] = await Promise.all([
      supabase.from("staff_board_settings").select("*").eq("id", "default").maybeSingle(),
      loadStaffWhiteboardThemeId(supabase)
    ]);
    if (error) {
      if (error.code === "42P01") {
        return { ...defaultStaffSettings, whiteboard_theme: whiteboardTheme };
      }
      throw error;
    }
    if (!data) {
      return { ...defaultStaffSettings, whiteboard_theme: whiteboardTheme };
    }

    return {
      refresh_interval_ms: Math.min(12_000, Math.max(4000, Number(data.refresh_interval_ms ?? 5000))),
      team_reminder: data.team_reminder ?? defaultStaffSettings.team_reminder,
      important_notice: data.important_notice ?? defaultStaffSettings.important_notice,
      show_team_reminders: Boolean(data.show_team_reminders ?? true),
      footer_message: data.footer_message ?? null,
      published_version: data.published_version ?? "v1.0.0",
      published_at: data.published_at ?? null,
      published_by: data.published_by ?? null,
      whiteboard_theme: whiteboardTheme
    };
  } catch {
    return defaultStaffSettings;
  }
}

export async function updateStaffBoardSettings(
  supabase: SupabaseClient,
  patch: Partial<StaffBoardSettings>
) {
  const { whiteboard_theme: themePatch, ...rowPatch } = patch;
  let whiteboardTheme: StaffWhiteboardThemeId | undefined;

  if (themePatch != null) {
    whiteboardTheme = await saveStaffWhiteboardThemeId(
      supabase,
      normalizeStaffWhiteboardThemeId(themePatch)
    );
  }

  const hasRowPatch = Object.values(rowPatch).some((value) => value !== undefined);
  if (!hasRowPatch) {
    const settings = await loadStaffBoardSettings(supabase);
    return {
      ...settings,
      ...(whiteboardTheme ? { whiteboard_theme: whiteboardTheme } : {})
    };
  }

  const { data, error } = await supabase
    .from("staff_board_settings")
    .upsert({
      id: "default",
      ...rowPatch,
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;
  try {
    const { invalidateBoardSettingsCaches } = await import("@/lib/board-settings-cache");
    invalidateBoardSettingsCaches();
  } catch {
    // Cache invalidation is best-effort.
  }

  const theme =
    whiteboardTheme ??
    (await loadStaffWhiteboardThemeId(supabase).catch(() => DEFAULT_STAFF_WHITEBOARD_THEME_ID));

  return {
    refresh_interval_ms: Math.min(12_000, Math.max(4000, Number(data.refresh_interval_ms ?? 5000))),
    team_reminder: data.team_reminder ?? defaultStaffSettings.team_reminder,
    important_notice: data.important_notice ?? defaultStaffSettings.important_notice,
    show_team_reminders: Boolean(data.show_team_reminders ?? true),
    footer_message: data.footer_message ?? null,
    published_version: data.published_version ?? "v1.0.0",
    published_at: data.published_at ?? null,
    published_by: data.published_by ?? null,
    whiteboard_theme: theme
  } satisfies StaffBoardSettings;
}

export { defaultStaffSettings };
