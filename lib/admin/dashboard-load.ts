import type { AdminBoardType } from "@/lib/admin/types";

/** Staff tabs that fetch their own data — skip heavy board widgets on first paint. */
export function skipHeavyBoardWidgets(board: AdminBoardType, tab: string | null) {
  if (board !== "staff") return false;
  if (!tab) return false;
  return tab !== "overview" && tab !== "integrations" && tab !== "logs";
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
