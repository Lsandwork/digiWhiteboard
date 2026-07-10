import type { StaffBoardSettings } from "@/lib/admin/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const defaultStaffSettings: StaffBoardSettings = {
  refresh_interval_ms: 2000,
  team_reminder: "Remember: greet every pup by name and confirm checkout prompts.",
  important_notice: "Front desk stays synced with Gingr — no manual board edits needed.",
  show_team_reminders: true,
  footer_message: null,
  published_version: "v1.0.0",
  published_at: null,
  published_by: null
};

export async function loadStaffBoardSettings(supabase: SupabaseClient): Promise<StaffBoardSettings> {
  try {
    const { data, error } = await supabase.from("staff_board_settings").select("*").eq("id", "default").maybeSingle();
    if (error) {
      if (error.code === "42P01") return defaultStaffSettings;
      throw error;
    }
    if (!data) return defaultStaffSettings;

    return {
      refresh_interval_ms: Math.min(12_000, Math.max(4000, Number(data.refresh_interval_ms ?? 5000))),
      team_reminder: data.team_reminder ?? defaultStaffSettings.team_reminder,
      important_notice: data.important_notice ?? defaultStaffSettings.important_notice,
      show_team_reminders: Boolean(data.show_team_reminders ?? true),
      footer_message: data.footer_message ?? null,
      published_version: data.published_version ?? "v1.0.0",
      published_at: data.published_at ?? null,
      published_by: data.published_by ?? null
    };
  } catch {
    return defaultStaffSettings;
  }
}

export async function updateStaffBoardSettings(
  supabase: SupabaseClient,
  patch: Partial<StaffBoardSettings>
) {
  const { data, error } = await supabase
    .from("staff_board_settings")
    .upsert({
      id: "default",
      ...patch,
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
  return data;
}

export { defaultStaffSettings };
