import type { OpsAlertAccent, OpsAlertActionKind } from "@/lib/ops-alert/types";

export function resolveOpsAlertAccent(input: {
  priority?: string | null;
  displayMode?: string | null;
  status?: string | null;
  alertType?: string | null;
}): OpsAlertAccent {
  const status = (input.status ?? "").toLowerCase();
  if (status === "completed" || status === "resolved" || status === "cleared" || status === "done") {
    return "green";
  }

  const priority = (input.priority ?? "").toLowerCase();
  const displayMode = (input.displayMode ?? "").toLowerCase();
  if (priority === "urgent" || displayMode === "urgent" || status === "critical" || status === "emergency") {
    return "red";
  }
  if (priority === "important" || status === "attention" || status === "upcoming") {
    return "amber";
  }

  const alertType = (input.alertType ?? "").toLowerCase();
  if (alertType.includes("action") || alertType.includes("complaint") || alertType.includes("handler alert")) {
    return "orange";
  }

  // Daily reminders and standard notices stay on the approved electric-blue accent.
  return "blue";
}

export function resolveOpsAlertAction(input: {
  accent: OpsAlertAccent;
  actionRequired?: boolean | null;
  status?: string | null;
}): { action: OpsAlertActionKind; actionLabel: string | null } {
  const status = (input.status ?? "").toLowerCase();
  if (status === "completed" || status === "resolved" || status === "cleared" || status === "done") {
    return { action: "completed", actionLabel: "COMPLETED" };
  }
  if (input.accent === "red") {
    return { action: "urgent_action", actionLabel: "URGENT ACTION" };
  }
  if (input.actionRequired === false) {
    return { action: "none", actionLabel: null };
  }
  if (input.accent === "amber") {
    return { action: "action_required", actionLabel: "ACTION REQUIRED" };
  }
  // Blue/orange operational reminders still show the action bar — yard staff need the cue.
  return { action: "action_required", actionLabel: "ACTION REQUIRED" };
}

export function formatOpsAlertExpires(expiresAt: string | null | undefined) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
