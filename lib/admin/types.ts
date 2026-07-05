import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";
import type { LobbyPromotion, LobbySettings } from "@/lib/lobby/types";
import type { LiveDog, WebhookEvent } from "@/lib/types";
import type { AdminGlobalSettings } from "@/lib/admin/settings";
import type { AdminUserPublic } from "@/lib/admin/users";
import type { AdminSession } from "@/lib/admin/session";

export type AdminBoardType = "lobby" | "staff";

export type StaffBoardSettings = {
  refresh_interval_ms: number;
  team_reminder: string | null;
  important_notice: string | null;
  show_team_reminders: boolean;
  footer_message: string | null;
  published_version: string;
  published_at: string | null;
  published_by: string | null;
};

export type LobbyBoardSettings = LobbySettings & {
  class_schedule: LobbyScheduleDay[];
  published_version: string;
  published_at: string | null;
  published_by: string | null;
};

export type AdminDashboardData = {
  board: AdminBoardType;
  lobby_settings: LobbyBoardSettings;
  staff_settings: StaffBoardSettings;
  promotions: LobbyPromotion[];
  active_checkouts: number;
  sync_status: "healthy" | "degraded" | "offline";
  last_synced_at: string | null;
  data_source: string;
  webhook_url: string;
  events: WebhookEvent[];
  failed_events: WebhookEvent[];
  staff_dogs: LiveDog[];
  lobby_checkouts_count: number;
};

export type AdminTab =
  | "overview"
  | "content"
  | "promotions"
  | "schedule"
  | "display"
  | "push_notices"
  | "grooming_push"
  | "crossover_communication"
  | "owner_follow_up"
  | "active_issues"
  | "whiteboard_preview"
  | "yard_links"
  | "analytics"
  | "templates"
  | "notifications"
  | "staff_directory"
  | "users"
  | "settings"
  | "logs"
  | "integrations"
  | "help";

export const ADMIN_TABS: AdminTab[] = [
  "overview",
  "content",
  "promotions",
  "schedule",
  "display",
  "push_notices",
  "grooming_push",
  "crossover_communication",
  "owner_follow_up",
  "active_issues",
  "whiteboard_preview",
  "yard_links",
  "analytics",
  "templates",
  "notifications",
  "staff_directory",
  "users",
  "settings",
  "logs",
  "integrations",
  "help"
];

export function parseAdminTab(value: string | null): AdminTab {
  if (value && ADMIN_TABS.includes(value as AdminTab)) return value as AdminTab;
  return "overview";
}

export type PublishLogEntry = {
  id: string;
  board_type: "lobby" | "staff";
  version: string;
  published_by: string | null;
  published_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_admin_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type AdminUsersPayload = {
  users: AdminUserPublic[];
  currentUser: {
    email: string | null;
    adminUserId: string | null;
    role: string;
  };
};

export type AdminSettingsPayload = {
  settings: AdminGlobalSettings;
};

export type DashboardPayload = AdminDashboardData & {
  username: string;
  session?: AdminSession | null;
  admin_settings?: AdminGlobalSettings;
};
