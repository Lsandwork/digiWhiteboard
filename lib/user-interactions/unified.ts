import type {
  ActiveIssue,
  CrossoverMessage,
  OwnerFollowUp,
  StaffDirectoryMember,
  StaffOpsState
} from "@/lib/staff/admin-ops";
import { shiftLogDetails, shiftLogSubmittedBy } from "@/lib/staff/front-desk-log";
import {
  employeeStatusLabel,
  isStaffOpsStatusClosed,
  isStaffOpsStatusOpen,
  mapBackendPriorityForEmployee
} from "@/lib/user-interactions/lifecycle";
import {
  isDueTodayPacific,
  isOverduePacificDueDate,
  isPacificToday,
  pacificTodayKey
} from "@/lib/user-interactions/pacific";

export type UnifiedInteractionKind = "note" | "follow_up" | "issue";

export type UnifiedInteraction = {
  /** Stable key for React lists — one backend row only once. */
  id: string;
  kind: UnifiedInteractionKind;
  sourceTable: "crossover_messages" | "owner_follow_ups" | "active_issues";
  sourceId: string;
  subject: string;
  details: string;
  status: string;
  employeeStatus: ReturnType<typeof employeeStatusLabel>;
  priority: "Normal" | "High" | "Urgent";
  urgent: boolean;
  assignedTo: string | null;
  submittedBy: string | null;
  ownerName: string | null;
  dogName: string | null;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  logType?: string | null;
};

export type UserInteractionsActor = {
  email: string | null;
  adminUserId: string | null;
  displayName: string | null;
};

export type UserInteractionsFilter = "open" | "mine" | "overdue" | "archive" | "completed_today";

function noteRow(message: CrossoverMessage): UnifiedInteraction {
  return {
    id: `note:${message.id}`,
    kind: "note",
    sourceTable: "crossover_messages",
    sourceId: message.id,
    subject: message.subject,
    details: shiftLogDetails(message),
    status: message.status,
    employeeStatus: employeeStatusLabel(message.status),
    priority: mapBackendPriorityForEmployee(message.priority),
    urgent: message.urgent,
    assignedTo: message.assigned_to ?? message.assigned_team ?? null,
    submittedBy: message.submitted_by ?? message.created_by ?? null,
    ownerName: message.related_owner_name,
    dogName: message.related_dog_name,
    dueAt: message.due_at ?? message.reminder_at ?? null,
    createdAt: message.created_at,
    resolvedAt: message.resolved_at,
    archivedAt: message.archived_at ?? null,
    updatedAt: message.updated_at,
    logType: message.log_type ?? null
  };
}

function followUpRow(row: OwnerFollowUp): UnifiedInteraction {
  return {
    id: `follow_up:${row.id}`,
    kind: "follow_up",
    sourceTable: "owner_follow_ups",
    sourceId: row.id,
    subject: row.subject,
    details: row.follow_up_notes ?? "",
    status: row.status,
    employeeStatus: employeeStatusLabel(row.status),
    priority: mapBackendPriorityForEmployee(row.priority),
    urgent: row.urgent,
    assignedTo: row.assigned_to,
    submittedBy: row.logged_by,
    ownerName: row.owner_name,
    dogName: row.dog_name,
    dueAt: row.due_date,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    archivedAt: null,
    updatedAt: row.updated_at
  };
}

function issueRow(row: ActiveIssue): UnifiedInteraction {
  return {
    id: `issue:${row.id}`,
    kind: "issue",
    sourceTable: "active_issues",
    sourceId: row.id,
    subject: row.title,
    details: row.notes ?? "",
    status: row.status,
    employeeStatus: employeeStatusLabel(row.status),
    priority: mapBackendPriorityForEmployee(row.priority),
    urgent: false,
    assignedTo: row.assigned_to,
    submittedBy: row.reported_by,
    ownerName: row.related_owner_name,
    dogName: row.related_dog_name,
    dueAt: row.due_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    archivedAt: null,
    updatedAt: row.updated_at
  };
}

export function buildAllUnifiedInteractions(state: StaffOpsState): UnifiedInteraction[] {
  const notes = state.crossover_messages.map(noteRow);
  const followUps = state.owner_follow_ups.map(followUpRow);
  const issues = state.active_issues.map(issueRow);
  return [...notes, ...followUps, ...issues].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function filterOpenInteractions(rows: UnifiedInteraction[]): UnifiedInteraction[] {
  return rows.filter((row) => isStaffOpsStatusOpen(row.status));
}

export function filterArchiveInteractions(rows: UnifiedInteraction[]): UnifiedInteraction[] {
  return rows.filter((row) => isStaffOpsStatusClosed(row.status));
}

function normalizeToken(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function directoryNames(directory: StaffDirectoryMember[], actor: UserInteractionsActor): string[] {
  const tokens = new Set<string>();
  for (const key of [actor.displayName, actor.email, actor.adminUserId]) {
    const n = normalizeToken(key);
    if (n) tokens.add(n);
  }
  const member =
    directory.find((m) => m.admin_user_id && m.admin_user_id === actor.adminUserId) ??
    directory.find((m) => normalizeToken(m.email) === normalizeToken(actor.email));
  if (member?.name) tokens.add(normalizeToken(member.name));
  return [...tokens];
}

export function matchesMyItems(row: UnifiedInteraction, actor: UserInteractionsActor, directory: StaffDirectoryMember[]): boolean {
  const keys = directoryNames(directory, actor);
  if (!keys.length) return false;
  const assigned = normalizeToken(row.assignedTo);
  if (assigned && keys.some((k) => assigned.includes(k) || k.includes(assigned))) return true;
  if (!assigned || assigned === "unassigned") {
    const creator = normalizeToken(row.submittedBy);
    if (creator && keys.some((k) => creator.includes(k) || k.includes(creator))) return true;
  }
  return false;
}

export function matchesOverdue(row: UnifiedInteraction, now = new Date()): boolean {
  if (!isStaffOpsStatusOpen(row.status)) return false;
  return isOverduePacificDueDate(row.dueAt, now);
}

export function matchesCompletedToday(row: UnifiedInteraction, now = new Date()): boolean {
  if (!isStaffOpsStatusClosed(row.status)) return false;
  const resolved = row.resolvedAt ?? row.archivedAt ?? row.updatedAt;
  return isPacificToday(resolved, now);
}

export function matchesSearch(row: UnifiedInteraction, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.subject,
    row.details,
    row.ownerName,
    row.dogName,
    row.assignedTo,
    row.submittedBy
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function applyUserInteractionFilter(
  rows: UnifiedInteraction[],
  filter: UserInteractionsFilter,
  actor: UserInteractionsActor,
  directory: StaffDirectoryMember[],
  options?: { search?: string; now?: Date }
): UnifiedInteraction[] {
  const now = options?.now ?? new Date();
  let out = rows;
  if (filter === "open") out = filterOpenInteractions(out);
  else if (filter === "archive") out = filterArchiveInteractions(out);
  else if (filter === "mine") out = filterOpenInteractions(out).filter((r) => matchesMyItems(r, actor, directory));
  else if (filter === "overdue") out = filterOpenInteractions(out).filter((r) => matchesOverdue(r, now));
  else if (filter === "completed_today") out = filterArchiveInteractions(out).filter((r) => matchesCompletedToday(r, now));

  const search = options?.search?.trim();
  if (search) out = out.filter((r) => matchesSearch(r, search));
  return out;
}

export function userInteractionCounts(
  rows: UnifiedInteraction[],
  actor: UserInteractionsActor,
  directory: StaffDirectoryMember[],
  now = new Date()
) {
  const open = filterOpenInteractions(rows);
  return {
    open: open.length,
    mine: open.filter((r) => matchesMyItems(r, actor, directory)).length,
    overdue: open.filter((r) => matchesOverdue(r, now)).length,
    archive: filterArchiveInteractions(rows).length
  };
}

export function paginateInteractions<T>(items: T[], page: number, pageSize: number) {
  const maxPage = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), maxPage);
  return {
    page: safePage,
    maxPage,
    pageSize,
    total: items.length,
    rows: items.slice((safePage - 1) * pageSize, safePage * pageSize)
  };
}

export function parseUnifiedInteractionId(id: string): { sourceTable: UnifiedInteraction["sourceTable"]; sourceId: string } | null {
  if (id.startsWith("note:")) return { sourceTable: "crossover_messages", sourceId: id.slice(5) };
  if (id.startsWith("follow_up:")) return { sourceTable: "owner_follow_ups", sourceId: id.slice(10) };
  if (id.startsWith("issue:")) return { sourceTable: "active_issues", sourceId: id.slice(6) };
  return null;
}

/** Storage/API cap helper — always retain open rows, then newest closed up to limit. */
export function capRecordsPreservingOpen<T extends { status: StaffOpsStatus | string; created_at: string }>(
  items: T[],
  limit: number,
  isOpen: (status: StaffOpsStatus | string) => boolean = isStaffOpsStatusOpen
): T[] {
  const sorted = [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const openRows = sorted.filter((item) => isOpen(item.status));
  const closedRows = sorted.filter((item) => !isOpen(item.status));
  const closedBudget = Math.max(0, limit - openRows.length);
  const keptClosed = closedRows.slice(0, closedBudget);
  return [...openRows, ...keptClosed].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export { isDueTodayPacific, pacificTodayKey };
