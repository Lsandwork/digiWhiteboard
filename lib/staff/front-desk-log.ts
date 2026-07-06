import type { CrossoverMessage, StaffOpsPriority, StaffOpsStatus } from "@/lib/staff/admin-ops";

/** Shift log types with badge tone keys for CSS. */
export const SHIFT_LOG_TYPES = [
  "Owner Complaint",
  "Owner Request",
  "Dog Update",
  "New Dog Assessment",
  "Grooming Note",
  "Training Note",
  "Transportation Note",
  "Daycare Note",
  "Boarding / Overnight Note",
  "Medical / Health Note",
  "Lost Belongings",
  "Facility Issue",
  "Staff Issue",
  "Payment / Billing Note",
  "Schedule / Reservation Issue",
  "General Shift Note",
  "Reminder",
  "Management Follow Up Needed"
] as const;

export type ShiftLogType = (typeof SHIFT_LOG_TYPES)[number];

export const SHIFT_LOG_TYPE_TONES: Record<ShiftLogType, string> = {
  "Owner Complaint": "complaint",
  "Owner Request": "request",
  "Dog Update": "dog",
  "New Dog Assessment": "assessment",
  "Grooming Note": "grooming",
  "Training Note": "training",
  "Transportation Note": "transport",
  "Daycare Note": "daycare",
  "Boarding / Overnight Note": "boarding",
  "Medical / Health Note": "medical",
  "Lost Belongings": "lost",
  "Facility Issue": "facility",
  "Staff Issue": "staff",
  "Payment / Billing Note": "billing",
  "Schedule / Reservation Issue": "schedule",
  "General Shift Note": "general",
  Reminder: "reminder",
  "Management Follow Up Needed": "management"
};

export const SHIFT_LOG_PRIORITIES = ["Low", "Normal", "Medium", "High", "Urgent", "Critical"] as const;

export const SHIFT_LOG_STATUSES = [
  "Open",
  "In Progress",
  "Waiting on Owner",
  "Waiting on Staff",
  "Needs Management Review",
  "Scheduled",
  "Completed",
  "Resolved",
  "Archived",
  "Active",
  "Pending Review"
] as const;

export const OPEN_SHIFT_LOG_STATUSES: StaffOpsStatus[] = [
  "Open",
  "Active",
  "In Progress",
  "Waiting on Owner",
  "Waiting on Staff",
  "Needs Management Review",
  "Scheduled",
  "Pending Review"
];

export const ASSIGNMENT_TEAMS = [
  "Front Desk Team",
  "Team Leaders",
  "Management",
  "Grooming Team",
  "Training Team",
  "Daycare Team",
  "Transportation Team",
  "Overnight Team",
  "Maintenance Team"
] as const;

export type ShiftLogTemplate = {
  title: string;
  log_type: ShiftLogType;
  subject: string;
  details: string;
  priority: StaffOpsPriority;
  status: StaffOpsStatus;
  assigned_to: string;
  needs_management_review: boolean;
  urgent: boolean;
};

export { SHIFT_LOG_TEMPLATES } from "@/lib/frontDeskLog/logTemplates";

export function shiftLogDetails(item: CrossoverMessage) {
  return item.details?.trim() || item.message?.trim() || "";
}

export function shiftLogType(item: CrossoverMessage): ShiftLogType | string {
  return item.log_type?.trim() || "General Shift Note";
}

export function shiftLogSubmittedBy(item: CrossoverMessage) {
  return item.submitted_by?.trim() || item.created_by?.trim() || "Staff";
}

export function shiftLogAssignedTo(item: CrossoverMessage) {
  return item.assigned_to?.trim() || item.assigned_team?.trim() || item.reported_to?.trim() || "Unassigned";
}

export function isOpenShiftLogStatus(status: StaffOpsStatus) {
  return OPEN_SHIFT_LOG_STATUSES.includes(status);
}

export function shouldAlertManagement(priority: StaffOpsPriority, urgent?: boolean, needsReview?: boolean) {
  if (needsReview) return true;
  if (urgent) return true;
  return priority === "High" || priority === "Urgent" || priority === "Critical";
}

export function priorityRank(priority: StaffOpsPriority) {
  const order: StaffOpsPriority[] = ["Low", "Normal", "Medium", "High", "Urgent", "Critical"];
  return order.indexOf(priority);
}

export function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export function isLoggedToday(value: string | null | undefined) {
  return isDueToday(value);
}

export function formatShiftLogDayLabel(date = new Date()) {
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function normalizeShiftLogRecord(item: CrossoverMessage): CrossoverMessage {
  return {
    ...item,
    log_type: item.log_type ?? "General Shift Note",
    details: item.details ?? item.message,
    message: item.details ?? item.message,
    submitted_by: item.submitted_by ?? item.created_by,
    created_by: item.submitted_by ?? item.created_by,
    status: item.status === "Active" && !item.log_type ? "Open" : item.status,
    needs_management_review: item.needs_management_review ?? item.status === "Needs Management Review"
  };
}
