import type { AdminBoardType } from "@/lib/admin/types";

export type AdminGlobalSettings = {
  default_board: AdminBoardType;
  default_refresh_interval_ms: number;
  timezone: string;
  business_display_name: string;
  support_help_link: string;
  session_timeout_hours: number;
  require_strong_passwords: boolean;
  force_password_change: boolean;
  allow_env_admin_login: boolean;
  login_lockout_attempts: number;
  login_lockout_minutes: number;
  default_tv_resolution: string;
  theme_mode: "fitdog_dark" | "fitdog_light";
  logo_size: "small" | "medium" | "large";
  text_size: "compact" | "comfortable" | "large";
  animation_intensity: "off" | "subtle" | "standard" | "high";
  show_sync_health_warnings: boolean;
  stale_data_warning_minutes: number;
  admin_alert_email: string;
  enable_publish_reminders: boolean;
  public_display_disabled: boolean;
};

export const DEFAULT_ADMIN_SETTINGS: AdminGlobalSettings = {
  default_board: "lobby",
  default_refresh_interval_ms: 3000,
  timezone: "America/Los_Angeles",
  business_display_name: "Fitdog",
  support_help_link: "https://www.fitdog.com",
  session_timeout_hours: 12,
  require_strong_passwords: true,
  force_password_change: false,
  allow_env_admin_login: true,
  login_lockout_attempts: 5,
  login_lockout_minutes: 15,
  default_tv_resolution: "1920x1080",
  theme_mode: "fitdog_dark",
  logo_size: "medium",
  text_size: "comfortable",
  animation_intensity: "subtle",
  show_sync_health_warnings: true,
  stale_data_warning_minutes: 5,
  admin_alert_email: "",
  enable_publish_reminders: true,
  public_display_disabled: false
};

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export async function loadAdminSettings(supabase: SupabaseClient): Promise<AdminGlobalSettings> {
  try {
    const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
    if (error) {
      if (error.code === "42P01") return DEFAULT_ADMIN_SETTINGS;
      throw error;
    }
    const stored = (data?.settings ?? {}) as Partial<AdminGlobalSettings>;
    return { ...DEFAULT_ADMIN_SETTINGS, ...stored };
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export async function updateAdminSettings(
  supabase: SupabaseClient,
  patch: Partial<AdminGlobalSettings>
): Promise<AdminGlobalSettings> {
  const current = await loadAdminSettings(supabase);
  const next = { ...current, ...patch };
  const { error } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  return next;
}
