/**
 * Unified User Interactions — employee translation layer over Team Log,
 * Owner Follow Up, and Active Issues. Does not replace those records.
 */

import type {
  ActiveIssue,
  CrossoverMessage,
  CrossoverReply,
  OwnerFollowUp,
  StaffActivityLog,
  StaffOpsPriority,
  StaffOpsState,
  StaffOpsStatus
} from "@/lib/staff/admin-ops";
import { pacificDateKey, shiftLogDetails } from "@/lib/staff/front-desk-log";

export const USER_INTERACTIONS_TZ = "America/Los_Angeles";

export const DONE_STAFF_OPS_STATUSES: StaffOpsStatus[] = ["Resolved", "Completed", "Check Out", "Archived"];

export type UserInteractionKind = "note" | "follow_up" | "issue";
export type UserInteractionView = "open" | "my_items" | "overdue" | "archive";
export type EmployeeStatusLabel = "Open" | "In progress" | "Waiting" | "Done";
export type EmployeePriority = "Normal" | "High" | "Urgent";

export type UserInteractionActor = {
  email?: string | null;
  adminUserId?: string | null;
  name?: string | null;
  role?: string | null;
};

export type UserInteractionItem = {
  id: string;
  kind: UserInteractionKind;
  sourceTable: "crossover_messages" | "owner_follow_ups" | "active_issues";
  subject: string;
  details: string;
  status: StaffOpsStatus;
  employeeStatus: EmployeeStatusLabel;
  priority: StaffOpsPriority;
  employeePriority: EmployeePriority;
  urgent: boolean;
  assignedTo: string | null;
  submittedBy: string | null;
  ownerName: string | null;
  dogName: string | null;
  dueAt: string | null;
  dueLabel: string;
  createdAt: string;
  resolvedAt: string | null;
  archivedAt: string | null;
  historyLine: string | null;
  replies: Array<{ id: string; message: string; created_by: string | null; created_at: string }>;
};

export type UserInteractionCounts = {
  open: number;
  myItems: number;
  overdue: number;
  archive: number;
  completedToday: number;
};

export function isUnresolvedStaffOpsStatus(status: StaffOpsStatus | string | null | undefined) {
  return !DONE_STAFF_OPS_STATUSES.includes(status as StaffOpsStatus);
}

export function employeeStatusLabel(status: StaffOpsStatus | string | null | undefined): EmployeeStatusLabel {
  switch (status) {
    case "In Progress":
      return "In progress";
    case "Waiting on Owner":
    case "Waiting on Staff":
    case "Pending Review":
    case "Needs Management Review":
      return "Waiting";
    case "Resolved":
    case "Completed":
    case "Check Out":
    case "Archived":
      return "Done";
    default:
      return "Open";
  }
}

export function employeePriorityFromStaff(priority: StaffOpsPriority | string | null | undefined, urgent?: boolean): EmployeePriority {
  if (urgent || priority === "Urgent" || priority === "Critical") return "Urgent";
  if (priority === "High") return "High";
  return "Normal";
}

export function staffPriorityFromEmployee(priority: EmployeePriority | string | null | undefined): StaffOpsPriority {
  if (priority === "Urgent") return "Urgent";
  if (priority === "High") return "High";
  return "Normal";
}

export function addPacificCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, (month || 1) - 1, (day || 1) + days));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function pacificTodayKey(now = new Date()) {
  return pacificDateKey(now) ?? "1970-01-01";
}

export function pacificCalendarDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return pacificDateKey(trimmed);
}

export function dueLabelFor(dueAt: string | null | undefined, now = new Date()): string {
  const due = pacificCalendarDate(dueAt);
  if (!due) return "No due date";
  const today = pacificTodayKey(now);
  if (due === today) return "Due today";
  if (due === addPacificCalendarDays(today, 1)) return "Due tomorrow";
  if (due < today) {
    const days = pacificDayDiff(due, today);
    return days === 1 ? "Overdue (1 day)" : `Overdue (${days} days)`;
  }
  return `Due ${new Date(`${due}T12:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  })}`;
}

export function isOverdueDueAt(dueAt: string | null | undefined, now = new Date()) {
  const due = pacificCalendarDate(dueAt);
  if (!due) return false;
  return due < pacificTodayKey(now);
}

export function isCompletedToday(resolvedAt: string | null | undefined, now = new Date()) {
  const key = pacificCalendarDate(resolvedAt);
  return Boolean(key && key === pacificTodayKey(now));
}

function pacificDayDiff(fromKey: string, toKey: string) {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const to = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

function normalizeMatch(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function actorMatchKeys(actor: UserInteractionActor) {
  return [actor.name, actor.email, actor.adminUserId].map(normalizeMatch).filter(Boolean);
}

export function assignmentMatchesActor(item: { assignedTo: string | null; submittedBy: string | null }, actor: UserInteractionActor) {
  const keys = actorMatchKeys(actor);
  if (!keys.length) return false;
  const assigned = normalizeMatch(item.assignedTo);
  if (assigned) {
    return keys.some((key) => assigned === key || assigned.includes(key) || key.includes(assigned));
  }
  const created = normalizeMatch(item.submittedBy);
  return Boolean(created && keys.some((key) => created === key || created.includes(key) || key.includes(created)));
}

function latestHistoryLine(logs: StaffActivityLog[], sourceTable: string, sourceId: string) {
  const match = logs.find((log) => log.source_table === sourceTable && log.source_id === sourceId);
  if (!match) return null;
  if (/reopen/i.test(match.title) || /reopen/i.test(match.description ?? "")) {
    return match.description || match.title;
  }
  if (match.activity_type.endsWith(".updated") && /status:\s*open/i.test(match.description ?? "")) {
    return `Reopened by ${match.created_by || "Staff"}`;
  }
  return null;
}

function repliesFor(replies: CrossoverReply[], id: string) {
  return replies
    .filter((reply) => reply.crossover_message_id === id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((reply) => ({
      id: reply.id,
      message: reply.message,
      created_by: reply.created_by,
      created_at: reply.created_at
    }));
}

export function fromCrossoverMessage(
  row: CrossoverMessage,
  extras: { replies?: CrossoverReply[]; activityLogs?: StaffActivityLog[] } = {}
): UserInteractionItem {
  const details = shiftLogDetails(row);
  return {
    id: row.id,
    kind: "note",
    sourceTable: "crossover_messages",
    subject: row.subject,
    details,
    status: row.status,
    employeeStatus: employeeStatusLabel(row.status),
    priority: row.priority,
    employeePriority: employeePriorityFromStaff(row.priority, row.urgent),
    urgent: Boolean(row.urgent),
    assignedTo: row.assigned_to || row.assigned_team || null,
    submittedBy: row.submitted_by || row.created_by || null,
    ownerName: row.related_owner_name,
    dogName: row.related_dog_name,
    dueAt: row.due_at ?? null,
    dueLabel: dueLabelFor(row.due_at),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    archivedAt: row.archived_at ?? null,
    historyLine: latestHistoryLine(extras.activityLogs ?? [], "crossover_messages", row.id),
    replies: repliesFor(extras.replies ?? [], row.id)
  };
}

export function fromOwnerFollowUp(row: OwnerFollowUp, extras: { activityLogs?: StaffActivityLog[] } = {}): UserInteractionItem {
  return {
    id: row.id,
    kind: "follow_up",
    sourceTable: "owner_follow_ups",
    subject: row.subject,
    details: row.follow_up_notes ?? "",
    status: row.status,
    employeeStatus: employeeStatusLabel(row.status),
    priority: row.priority,
    employeePriority: employeePriorityFromStaff(row.priority, row.urgent),
    urgent: Boolean(row.urgent),
    assignedTo: row.assigned_to,
    submittedBy: row.logged_by,
    ownerName: row.owner_name,
    dogName: row.dog_name,
    dueAt: row.due_date,
    dueLabel: dueLabelFor(row.due_date),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    archivedAt: null,
    historyLine: latestHistoryLine(extras.activityLogs ?? [], "owner_follow_ups", row.id),
    replies: []
  };
}

export function fromActiveIssue(row: ActiveIssue, extras: { activityLogs?: StaffActivityLog[] } = {}): UserInteractionItem {
  return {
    id: row.id,
    kind: "issue",
    sourceTable: "active_issues",
    subject: row.title,
    details: row.notes ?? "",
    status: row.status,
    employeeStatus: employeeStatusLabel(row.status),
    priority: row.priority,
    employeePriority: employeePriorityFromStaff(row.priority),
    urgent: row.priority === "Urgent" || row.priority === "Critical",
    assignedTo: row.assigned_to,
    submittedBy: row.reported_by,
    ownerName: row.related_owner_name,
    dogName: row.related_dog_name,
    dueAt: row.due_at,
    dueLabel: dueLabelFor(row.due_at),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    archivedAt: null,
    historyLine: latestHistoryLine(extras.activityLogs ?? [], "active_issues", row.id),
    replies: []
  };
}

export function listUnifiedInteractions(state: StaffOpsState): UserInteractionItem[] {
  const extras = { replies: state.crossover_message_replies, activityLogs: state.activity_logs };
  const items = [
    ...state.crossover_messages.map((row) => fromCrossoverMessage(row, extras)),
    ...state.owner_follow_ups.map((row) => fromOwnerFollowUp(row, extras)),
    ...state.active_issues.map((row) => fromActiveIssue(row, extras))
  ];
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.sourceTable}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function isOpenInteraction(item: UserInteractionItem) {
  return isUnresolvedStaffOpsStatus(item.status);
}

export function filterOpenInteractions(items: UserInteractionItem[]) {
  return items.filter(isOpenInteraction);
}

export function filterMyItems(items: UserInteractionItem[], actor: UserInteractionActor) {
  return filterOpenInteractions(items).filter((item) => assignmentMatchesActor(item, actor));
}

export function filterOverdueInteractions(items: UserInteractionItem[], now = new Date()) {
  return filterOpenInteractions(items).filter((item) => isOverdueDueAt(item.dueAt, now));
}

export function filterArchiveInteractions(items: UserInteractionItem[]) {
  return items.filter((item) => !isOpenInteraction(item));
}

export function filterCompletedToday(items: UserInteractionItem[], now = new Date()) {
  return filterArchiveInteractions(items).filter((item) => isCompletedToday(item.resolvedAt, now));
}

export function searchInteractions(items: UserInteractionItem[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    [
      item.subject,
      item.details,
      item.ownerName,
      item.dogName,
      item.assignedTo,
      item.submittedBy,
      ...item.replies.map((reply) => reply.message)
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle)
  );
}

export function interactionCounts(items: UserInteractionItem[], actor: UserInteractionActor, now = new Date()): UserInteractionCounts {
  return {
    open: filterOpenInteractions(items).length,
    myItems: filterMyItems(items, actor).length,
    overdue: filterOverdueInteractions(items, now).length,
    archive: filterArchiveInteractions(items).length,
    completedToday: filterCompletedToday(items, now).length
  };
}

export function retainUnresolvedThenCapClosed<T extends { status: StaffOpsStatus; created_at: string }>(
  items: T[],
  maxTotal: number
): T[] {
  const unresolved = items.filter((item) => isUnresolvedStaffOpsStatus(item.status));
  const closed = [...items.filter((item) => !isUnresolvedStaffOpsStatus(item.status))].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const remaining = Math.max(0, maxTotal - unresolved.length);
  return [...unresolved, ...closed.slice(0, remaining)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function paginateInteractions(items: UserInteractionItem[], page: number, limit: number) {
  const safeLimit = Math.min(50, Math.max(1, limit));
  const maxPage = Math.max(1, Math.ceil(items.length / safeLimit));
  const safePage = Math.min(maxPage, Math.max(1, page));
  return {
    items: items.slice((safePage - 1) * safeLimit, safePage * safeLimit),
    page: safePage,
    limit: safeLimit,
    total: items.length,
    hasMore: safePage < maxPage
  };
}
