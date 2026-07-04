import type { AdminUserRole } from "@/lib/admin/users";
import { isFullAdminRole, isStaffOpsLimitedRole } from "@/lib/admin/users";
import type { StaffDirectoryMember, StaffOpsPriority, StaffOpsState } from "@/lib/staff/admin-ops";

export type StaffNotificationType = "assignment" | "mention" | "update" | "reply" | "escalation" | "auto_issue";

export type StaffNotificationTarget =
  | { kind: "staff_name"; name: string }
  | { kind: "staff_email"; email: string }
  | { kind: "coordinator_pool" }
  | { kind: "admin_pool" };

export type StaffNotificationSourceTab =
  | "crossover_communication"
  | "owner_follow_up"
  | "active_issues"
  | "push_notices"
  | "notifications";

export type StaffNotification = {
  id: string;
  type: StaffNotificationType;
  title: string;
  body: string | null;
  priority: StaffOpsPriority;
  target: StaffNotificationTarget;
  source_table: string;
  source_id: string;
  source_tab: StaffNotificationSourceTab;
  read_by: string[];
  created_by: string | null;
  created_at: string;
};

export type StaffOpsNotificationEvent = {
  eventType: "created" | "updated" | "reply" | "auto_issue";
  sourceTable: string;
  sourceId: string;
  sourceTab: StaffNotificationSourceTab;
  title: string;
  body: string | null;
  priority: StaffOpsPriority;
  urgent?: boolean;
  assignedTo?: string | null;
  mentionText?: string | null;
  actor: string | null;
};

const MAX_NOTIFICATIONS = 400;
const COORDINATOR_ROLES: AdminUserRole[] = ["front_desk_coordinator", "team_leader"];
const ADMIN_ROLES: AdminUserRole[] = ["owner_admin", "manager_admin"];

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `staff-notif-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function notificationReaderKey(email?: string | null, adminUserId?: string | null) {
  return (email?.trim().toLowerCase() || adminUserId || "anonymous").toLowerCase();
}

export function isHighOrUrgentPriority(priority: StaffOpsPriority, urgent?: boolean) {
  return urgent === true || priority === "High" || priority === "Critical";
}

export function extractAtMentions(text: string, staffNames: string[]) {
  if (!text.trim()) return [];
  const found = new Set<string>();
  const sorted = [...staffNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (text.includes(`@${name}`)) found.add(name);
  }
  return [...found];
}

function findMemberByName(directory: StaffDirectoryMember[], name: string) {
  return directory.find((member) => member.name === name) ?? null;
}

function findMemberForSession(directory: StaffDirectoryMember[], email?: string | null, adminUserId?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();
  return (
    directory.find((member) => member.admin_user_id === adminUserId) ??
    directory.find((member) => member.email?.trim().toLowerCase() === normalizedEmail) ??
    null
  );
}

function matchesStaffNameTarget(
  target: Extract<StaffNotificationTarget, { kind: "staff_name" }>,
  directory: StaffDirectoryMember[],
  email?: string | null,
  adminUserId?: string | null
) {
  const member = findMemberForSession(directory, email, adminUserId);
  if (member?.name === target.name) return true;
  const named = findMemberByName(directory, target.name);
  if (!named) return false;
  if (adminUserId && named.admin_user_id === adminUserId) return true;
  if (email && named.email?.trim().toLowerCase() === email.trim().toLowerCase()) return true;
  return false;
}

export function notificationVisibleToUser(
  notification: StaffNotification,
  directory: StaffDirectoryMember[],
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  switch (notification.target.kind) {
    case "staff_email":
      return notification.target.email.trim().toLowerCase() === session.email?.trim().toLowerCase();
    case "staff_name":
      return matchesStaffNameTarget(notification.target, directory, session.email, session.adminUserId);
    case "coordinator_pool":
      return isStaffOpsLimitedRole(session.role);
    case "admin_pool":
      return isFullAdminRole(session.role);
    default:
      return false;
  }
}

export function filterNotificationsForUser(
  state: StaffOpsState,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  return (state.notifications ?? []).filter((notification) =>
    notificationVisibleToUser(notification, state.staff_directory, session)
  );
}

export function countUnreadNotifications(
  state: StaffOpsState,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  const readerKey = notificationReaderKey(session.email, session.adminUserId);
  return filterNotificationsForUser(state, session).filter((notification) => !notification.read_by.includes(readerKey)).length;
}

function buildNotification(event: StaffOpsNotificationEvent, target: StaffNotificationTarget, type: StaffNotificationType): StaffNotification {
  return {
    id: newId(),
    type,
    title: event.title,
    body: event.body,
    priority: event.priority,
    target,
    source_table: event.sourceTable,
    source_id: event.sourceId,
    source_tab: event.sourceTab,
    read_by: [],
    created_by: event.actor,
    created_at: nowIso()
  };
}

export function dispatchStaffOpsNotifications(state: StaffOpsState, event: StaffOpsNotificationEvent): StaffOpsState {
  const staffNames = state.staff_directory.filter((member) => member.status === "Active").map((member) => member.name);
  const created: StaffNotification[] = [];

  const baseType: StaffNotificationType =
    event.eventType === "reply" ? "reply" : event.eventType === "auto_issue" ? "auto_issue" : event.eventType === "created" ? "update" : "update";

  created.push(
    buildNotification(event, { kind: "coordinator_pool" }, baseType)
  );

  if (event.assignedTo) {
    created.push(
      buildNotification(event, { kind: "staff_name", name: event.assignedTo }, "assignment")
    );
  }

  for (const name of extractAtMentions(event.mentionText ?? "", staffNames)) {
    if (name === event.assignedTo) continue;
    created.push(
      buildNotification(event, { kind: "staff_name", name }, "mention")
    );
  }

  if (isHighOrUrgentPriority(event.priority, event.urgent)) {
    created.push(
      buildNotification(event, { kind: "admin_pool" }, event.eventType === "auto_issue" ? "auto_issue" : "escalation")
    );
  }

  const existing = state.notifications ?? [];
  return {
    ...state,
    notifications: [...created, ...existing].slice(0, MAX_NOTIFICATIONS)
  };
}

export function markNotificationRead(state: StaffOpsState, notificationId: string, readerKey: string) {
  return {
    ...state,
    notifications: (state.notifications ?? []).map((notification) =>
      notification.id === notificationId && !notification.read_by.includes(readerKey)
        ? { ...notification, read_by: [...notification.read_by, readerKey] }
        : notification
    )
  };
}

export function markAllNotificationsRead(
  state: StaffOpsState,
  readerKey: string,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  const visibleIds = new Set(filterNotificationsForUser(state, session).map((notification) => notification.id));
  return {
    ...state,
    notifications: (state.notifications ?? []).map((notification) =>
      visibleIds.has(notification.id) && !notification.read_by.includes(readerKey)
        ? { ...notification, read_by: [...notification.read_by, readerKey] }
        : notification
    )
  };
}

export function coordinatorRolesInDirectory(directory: StaffDirectoryMember[]) {
  return directory.filter(
    (member) => member.status === "Active" && member.dashboard_role && COORDINATOR_ROLES.includes(member.dashboard_role)
  );
}

export function adminRolesInDirectory(directory: StaffDirectoryMember[]) {
  return directory.filter(
    (member) => member.status === "Active" && member.dashboard_role && ADMIN_ROLES.includes(member.dashboard_role)
  );
}
