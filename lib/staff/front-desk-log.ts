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
  "Check Out",
  "Archived",
  "Active",
  "Pending Review"
] as const;

const FITDOG_TIMEZONE = "America/Los_Angeles";

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

/** Display label for who submitted a shift log — resolves emails via staff directory when provided. */
export function shiftLogSubmittedByLabel(
  item: CrossoverMessage,
  directory?: Array<{ name: string; email?: string | null; admin_user_id?: string | null }> | null
) {
  const raw = shiftLogSubmittedBy(item);
  if (!directory?.length) return raw;
  const needle = raw.trim().toLowerCase();
  const member =
    directory.find((entry) => entry.email?.trim().toLowerCase() === needle) ??
    directory.find((entry) => entry.admin_user_id?.trim().toLowerCase() === needle);
  if (member?.name?.trim()) return member.name.trim();
  // If the stored value looks like an email and we couldn't map it, show local-part — not the full email.
  if (raw.includes("@")) {
    const local = raw.split("@")[0]?.replace(/[._]+/g, " ").trim();
    if (local) {
      return local
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
  return raw;
}

export function shiftLogAssignedTo(item: CrossoverMessage) {
  return item.assigned_to?.trim() || item.assigned_team?.trim() || item.reported_to?.trim() || "Unassigned";
}

export function isOpenShiftLogStatus(status: StaffOpsStatus) {
  return OPEN_SHIFT_LOG_STATUSES.includes(status);
}

/** Closed history shown in the Front Desk Archived Log (includes imported past Resolved rows). */
export function isClosedShiftLogStatus(status: StaffOpsStatus) {
  return status === "Resolved" || status === "Archived" || status === "Completed" || status === "Check Out";
}

export function pacificDateKey(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FITDOG_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function isPacificToday(value: string | null | undefined) {
  const key = pacificDateKey(value);
  return key != null && key === pacificDateKey(new Date());
}

/** Assessment / new-dog assessment entries resolve to Check Out instead of Resolved. */
export function isAssessmentDogLog(item: Pick<CrossoverMessage, "subject" | "message" | "details" | "log_type"> & { template_title?: string | null }) {
  const type = shiftLogType(item as CrossoverMessage).toLowerCase();
  if (type.includes("assessment")) return true;
  const haystack = [item.subject, shiftLogDetails(item as CrossoverMessage), item.template_title ?? ""].join(" ").toLowerCase();
  return /\bassessment\b/.test(haystack);
}

export function resolveStatusForShiftLog(item: Parameters<typeof isAssessmentDogLog>[0]): StaffOpsStatus {
  return isAssessmentDogLog(item) ? "Check Out" : "Resolved";
}

/**
 * Crossover Log — every entry logged today (Pacific), for same-day AM/PM handoff.
 * Resolved / Check Out / In Progress / edits all stay here.
 * Only an explicit Archive click removes a same-day row.
 * Past-dated rows never appear here.
 */
export function belongsInCrossoverLog(item: CrossoverMessage) {
  if (item.status === "Archived") return false;
  return isPacificToday(item.created_at);
}

/**
 * Open Log — unresolved / in-flight statuses logged today (Pacific).
 * Previous-day notes leave Open at midnight and roll into Archived Log.
 */
export function belongsInOpenLog(item: CrossoverMessage) {
  return isOpenShiftLogStatus(item.status) && isPacificToday(item.created_at);
}

/**
 * Archived Log:
 * - Explicit Archived (any date)
 * - Any previous Pacific calendar day (handoff notes archive at midnight)
 */
export function belongsInArchivedLog(item: CrossoverMessage) {
  if (belongsInCrossoverLog(item)) return false;
  if (item.status === "Archived") return true;
  return !isPacificToday(item.created_at);
}

/**
 * Previous-day crossover notes (including New Dog Assessment / Check Out) receive
 * status Archived at 12:00 AM Pacific. Same-day assessments stay on Crossover Log.
 */
export function shouldAutoArchivePreviousDayCrossover(item: Pick<CrossoverMessage, "status" | "created_at">) {
  if (item.status === "Archived") return false;
  return !isPacificToday(item.created_at);
}

/** True during the first Pacific hour after midnight (00:00–00:59 America/Los_Angeles). */
export function isPacificMidnightHour(now: Date = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FITDOG_TIMEZONE,
      hour: "numeric",
      hourCycle: "h23"
    }).format(now)
  );
  return hour === 0;
}

export type FrontDeskLogBucket = "crossover" | "open" | "archived";

export const FRONT_DESK_LOG_BUCKET_LABELS: Record<FrontDeskLogBucket, string> = {
  crossover: "Crossover Log",
  open: "Open Log",
  archived: "Archived Log"
};

/** Pacific timestamp for “yesterday afternoon” so a row leaves today’s Crossover Log immediately. */
export function pacificYesterdayIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FITDOG_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  // Yesterday 17:00 Pacific ≈ UTC hour 1 next calendar day in summer; use stable hour+8 pattern.
  return new Date(Date.UTC(year, month - 1, day - 1, 17 + 8, 0, 0)).toISOString();
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

/** Super Admin / Admin (and RBAC equivalents) see past + current-day Front Desk Log history. */
export function canViewFullFrontDeskLogHistory(role?: string | null) {
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "super_admin" ||
    role === "admin" ||
    !role
  );
}

function normalizeActorKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

/** Super Admin, Admin, and Management may delete any Front Desk Log entry. */
export function canDeleteAnyFrontDeskLog(role?: string | null) {
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "assistant_manager" ||
    role === "super_admin" ||
    role === "admin" ||
    role === "management" ||
    !role
  );
}

/**
 * Creators can delete their own entries.
 * Super Admin / Admin / Management can delete any entry.
 */
export function canDeleteFrontDeskLogEntry(
  item: Pick<CrossoverMessage, "created_by" | "submitted_by">,
  actor: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  if (canDeleteAnyFrontDeskLog(actor.role)) return true;
  const actorKeys = [actor.email, actor.adminUserId].map(normalizeActorKey).filter(Boolean);
  if (!actorKeys.length) return false;
  const creators = [item.created_by, item.submitted_by].map(normalizeActorKey).filter(Boolean);
  return creators.some((creator) => actorKeys.includes(creator));
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
    // Prefer submitted_by for display; keep created_by as the ownership identity (email/id).
    submitted_by: item.submitted_by ?? item.created_by ?? null,
    created_by: item.created_by ?? item.submitted_by ?? null,
    status: item.status === "Active" && !item.log_type ? "Open" : item.status,
    needs_management_review: item.needs_management_review ?? item.status === "Needs Management Review"
  };
}
