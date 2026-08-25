import type { AdminBoardType } from "@/lib/admin/types";
import { HUNG_TABLES, isHungQueryError, isHungTableInCooldown, markHungTableTimeout } from "@/lib/hung-table-guard";

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
  display_content_revision: number;
  cast_hard_reload_nonce: number;
  /** HR Consult — company location & legal context for Gemini (not the API key). */
  hr_consult_enabled: boolean;
  hr_company_city: string;
  hr_company_region: string;
  hr_company_country: string;
  hr_company_situation: string;
  hr_consult_model: string;
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
  public_display_disabled: false,
  display_content_revision: 0,
  cast_hard_reload_nonce: 0,
  hr_consult_enabled: true,
  hr_company_city: "Santa Monica",
  hr_company_region: "California",
  hr_company_country: "United States",
  hr_company_situation:
    "Fitdog is a premium dog daycare, boarding, grooming, and training facility in Santa Monica, California. Dog Handlers (handlers) care for and monitor dogs on the yard, manage play groups, and walk dogs in/out of the building — they are not front-desk booking staff. Front Desk / Client Relations handle Gingr bookings, vaccines at check-in, and client communication. We operate with a team-oriented culture and follow California employment law. HR consult and PIP AI are for internal guidance on write-ups, complaints, and workplace issues — not a substitute for licensed legal counsel.",
  hr_consult_model: "gemini-3.5-flash"
};

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const ADMIN_SETTING_KEYS = Object.keys(DEFAULT_ADMIN_SETTINGS) as (keyof AdminGlobalSettings)[];

function adminSettingsSelectList() {
  return ADMIN_SETTING_KEYS.map((key) => `settings->${key}`).join(",");
}

function readAdminSettingsRow(data: Record<string, unknown> | null | undefined): Partial<AdminGlobalSettings> {
  if (!data) return {};
  const stored: Partial<AdminGlobalSettings> = {};
  for (const key of ADMIN_SETTING_KEYS) {
    if (key in data && data[key] !== undefined && data[key] !== null) {
      (stored as Record<string, AdminGlobalSettings[keyof AdminGlobalSettings]>)[key] = data[
        key
      ] as AdminGlobalSettings[typeof key];
    }
  }
  return stored;
}

export async function loadAdminSettings(supabase: SupabaseClient): Promise<AdminGlobalSettings> {
  if (isHungTableInCooldown(HUNG_TABLES.adminSettings)) return DEFAULT_ADMIN_SETTINGS;
  try {
    const { data, error } = await supabase
      .from("admin_settings")
      .select(adminSettingsSelectList())
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      if (isHungQueryError(error)) {
        markHungTableTimeout(HUNG_TABLES.adminSettings);
        return DEFAULT_ADMIN_SETTINGS;
      }
      if (error.code === "42P01") return DEFAULT_ADMIN_SETTINGS;
      throw error;
    }
    return { ...DEFAULT_ADMIN_SETTINGS, ...readAdminSettingsRow(data as Record<string, unknown> | null) };
  } catch (error) {
    if (isHungQueryError(error)) markHungTableTimeout(HUNG_TABLES.adminSettings);
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export async function updateAdminSettings(
  supabase: SupabaseClient,
  patch: Partial<AdminGlobalSettings>
): Promise<AdminGlobalSettings> {
  const current = await loadAdminSettings(supabase);
  const next = { ...current, ...patch };
  const { saveAdminSettingsJsonKey } = await import("@/lib/admin/settings-json-store");
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_ADMIN_SETTINGS)) continue;
    await saveAdminSettingsJsonKey(supabase, key, value);
  }
  try {
    const { invalidateBoardSettingsCaches } = await import("@/lib/board-settings-cache");
    invalidateBoardSettingsCaches();
  } catch {
    // Cache invalidation is best-effort.
  }
  return next;
}
