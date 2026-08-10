/**
 * Canonical view-model for every RuffOps push alert and daily reminder.
 * All board surfaces render through this shape so new alert types inherit
 * the approved operations-board design automatically.
 */

export type OpsAlertAccent = "blue" | "amber" | "orange" | "red" | "green";

export type OpsAlertActionKind =
  | "action_required"
  | "urgent_action"
  | "completed"
  | "acknowledge"
  | "done"
  | "snooze"
  | "none";

export type OpsAlertMetaRow = {
  label: string;
  value: string;
  icon?: "clock" | "users" | "user" | "tag" | "dog" | "map";
};

export type OpsAlertViewModel = {
  id: string;
  /** Small uppercase label above the title, e.g. "DAILY REMINDER". */
  alertType: string;
  title: string;
  subtitle?: string | null;
  scheduledTime?: string | null;
  audience?: string | null;
  message?: string | null;
  checklistItems: string[];
  metaRows: OpsAlertMetaRow[];
  accent: OpsAlertAccent;
  action: OpsAlertActionKind;
  actionLabel?: string | null;
  expirationTime?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  /** Optional note under the checklist (e.g. sent early by…). */
  note?: string | null;
  /** Optional brand/management footer inside the card. */
  footer?: string | null;
  /** Optional media (grooming dog photo, etc.). */
  mediaUrl?: string | null;
  mediaAlt?: string | null;
};
