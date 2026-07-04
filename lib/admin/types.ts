import type { LobbyScheduleDay } from "@/lib/lobby/class-schedule";
import type { LobbyPromotion, LobbySettings } from "@/lib/lobby/types";
import type { LiveDog, WebhookEvent } from "@/lib/types";

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

export type AdminTab = "overview" | "content" | "promotions" | "schedule" | "display" | "logs";
