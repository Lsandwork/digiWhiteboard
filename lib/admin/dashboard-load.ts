import type { AdminBoardType } from "@/lib/admin/types";

/** Tabs that fetch their own data — skip promotions / live dogs / webhook dumps on first paint. */
export function skipHeavyBoardWidgets(board: AdminBoardType, tab: string | null) {
  if (!tab) return false;
  if (board === "marketing") {
    return tab === "cast_tv" || tab === "sa_apps_hub" || tab === "bulk_photo_upload";
  }
  if (board !== "staff") return false;
  return tab !== "integrations" && tab !== "logs";
}

/**
 * `live_transition_dogs` and `gingr_webhook_events` hang under SELECT *.
 * Only Integrations / Logs (and the lobby board) actually render those rows.
 * Background hydrate omits `tab`, so this must stay true for staff/marketing.
 */
export function skipHungBoardSnapshots(board: AdminBoardType, tab: string | null) {
  if (tab === "integrations" || tab === "logs") return false;
  if (board === "lobby") return false;
  return true;
}

/**
 * Commissions / My Shift / Walks etc. must not wait on the settings blob.
 * Omitting `tab` means a full payload (background hydrate / legacy clients).
 */
export function skipSettingsAndAccess(tab: string | null) {
  if (!tab) return false;
  return (
    tab !== "overview" &&
    tab !== "content" &&
    tab !== "display" &&
    tab !== "promotions" &&
    tab !== "schedule" &&
    tab !== "settings" &&
    tab !== "integrations" &&
    tab !== "logs" &&
    tab !== "whiteboard_preview" &&
    tab !== "analytics"
  );
}

/** Tabs with their own data APIs — do not fan out a second full dashboard GET. */
export function skipDashboardBackgroundHydrate(board: AdminBoardType, tab: string | null) {
  if (!tab) return false;
  if (
    tab === "overview" ||
    tab === "ops_system_health" ||
    tab === "package_commissions" ||
    tab === "route_generator" ||
    tab === "live_fleet" ||
    tab === "ops_command_center" ||
    tab === "fitdog_alerts" ||
    tab === "track_incidents" ||
    tab === "vet_visits" ||
    tab === "vip_auto_book" ||
    tab === "walks_board" ||
    tab === "package_group_walks" ||
    tab === "tl_digi_board" ||
    tab === "reports" ||
    tab === "analytics"
  ) {
    return true;
  }
  if (board === "marketing") return skipHeavyBoardWidgets(board, tab);
  return false;
}
