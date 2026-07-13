import statusMap from "@/lib/marketing/status-map.json";
import type { MarketingRequestStatus } from "@/lib/marketing/constants";

export type StatusDisplay = { label: string; color: string; bg: string };

const map = statusMap as Record<MarketingRequestStatus, StatusDisplay>;

export function marketingStatusDisplay(status: string): StatusDisplay {
  return map[status as MarketingRequestStatus] ?? { label: status, color: "#64748B", bg: "#F1F5F9" };
}

export const TERMINAL_STATUSES = new Set<MarketingRequestStatus>(["completed", "unavailable", "canceled"]);

export const STAFF_ACTION_TO_STATUS: Record<string, MarketingRequestStatus> = {
  acknowledge: "handler_acknowledged",
  dog_being_retrieved: "dog_being_retrieved",
  dog_ready: "dog_ready",
  delay_5_minutes: "delayed",
  dog_unavailable: "unavailable",
  contact_marketing: "handler_acknowledged"
};

export const VALID_TRANSITIONS: Record<MarketingRequestStatus, MarketingRequestStatus[]> = {
  awaiting_handler: ["handler_acknowledged", "dog_being_retrieved", "dog_ready", "delayed", "unavailable", "canceled", "in_session"],
  handler_acknowledged: ["dog_being_retrieved", "dog_ready", "delayed", "unavailable", "canceled", "in_session"],
  dog_being_retrieved: ["dog_ready", "delayed", "unavailable", "canceled", "in_session"],
  dog_ready: ["in_session", "completed", "delayed", "unavailable", "canceled"],
  in_session: ["completed", "delayed", "unavailable", "canceled"],
  delayed: ["handler_acknowledged", "dog_being_retrieved", "dog_ready", "unavailable", "canceled", "in_session"],
  completed: [],
  unavailable: [],
  canceled: []
};

export function canTransition(from: MarketingRequestStatus, to: MarketingRequestStatus, allowAdminReopen = false) {
  if (from === to) return true;
  if (TERMINAL_STATUSES.has(from) && !allowAdminReopen) return false;
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}
