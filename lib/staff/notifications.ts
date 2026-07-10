import type { AdminUserRole } from "@/lib/admin/users";
import {
  canAccessCrossoverCommunication,
  isCrossoverStaffRole,
  isFullAdminRole,
  isGroomerRole,
  isTrainerRole,
  isStaffOpsLimitedRole,
  isTeamLeaderRole
} from "@/lib/admin/users";
import type { StaffDirectoryMember, StaffOpsPriority, StaffOpsState } from "@/lib/staff/admin-ops";

export type StaffNotificationType = "assignment" | "mention" | "update" | "reply" | "escalation" | "auto_issue";

export type StaffNotificationTarget =
  | { kind: "staff_name"; name: string }
  | { kind: "staff_email"; email: string }
  | { kind: "coordinator_pool" }
  | { kind: "admin_pool" }
  | { kind: "department_pool"; department: string };

export type StaffNotificationSourceTab =
  | "crossover_communication"
  | "owner_follow_up"
  | "active_issues"
  | "push_notices"
  | "notifications"
  | "walks_board";

export type NotificationThreadStatus =
  | "open"
  | "in_review"
  | "waiting_on_response"
  | "responded"
  | "resolved"
  | "closed";

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
  /** Optional extended metadata for thread hub (backward compatible). */
  linked_entity_type?: string | null;
  linked_entity_id?: string | null;
  thread_status?: NotificationThreadStatus | null;
  assigned_to?: string | null;
  category?: string | null;
  updated_at?: string | null;
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
  needsManagementReview?: boolean;
  assignedTo?: string | null;
  toDepartment?: string | null;
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

export function isHighOrUrgentPriority(priority: StaffOpsPriority, urgent?: boolean, needsReview?: boolean) {
  if (needsReview) return true;
  return urgent === true || priority === "High" || priority === "Urgent" || priority === "Critical";
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

function homeDepartmentForRole(role?: string | null) {
  if (role === "team_leader") return "Team Lead";
  if (role === "front_desk_coordinator") return "Front Desk";
  if (role === "groomer") return "Grooming";
  if (role === "trainer") return "Training";
  return null;
}

function matchesDepartmentTarget(
  target: Extract<StaffNotificationTarget, { kind: "department_pool" }>,
  directory: StaffDirectoryMember[],
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  const member = findMemberForSession(directory, session.email, session.adminUserId);
  if (member?.department === target.department) return true;
  const homeDepartment = homeDepartmentForRole(session.role);
  if (homeDepartment === target.department) return true;
  return isFullAdminRole(session.role) || isStaffOpsLimitedRole(session.role);
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
    case "department_pool":
      return matchesDepartmentTarget(notification.target, directory, session);
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

/** Team leads and groomers only see notifications directly assigned to them. */
export function filterPersonalNotificationsForUser(
  state: StaffOpsState,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  return filterNotificationsForUser(state, session).filter((notification) => {
    if (notification.target.kind === "staff_email" || notification.target.kind === "staff_name") return true;
    if (notification.target.kind === "admin_pool" && isFullAdminRole(session.role)) return true;
    return false;
  });
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
  const isCrossover = event.sourceTab === "crossover_communication";
  const shouldAlert = isHighOrUrgentPriority(event.priority, event.urgent, event.needsManagementReview);

  if (isCrossover && (event.eventType === "created" || event.eventType === "updated") && !shouldAlert) {
    return state;
  }

  const baseType: StaffNotificationType =
    event.eventType === "reply" ? "reply" : event.eventType === "auto_issue" ? "auto_issue" : event.eventType === "created" ? "update" : "update";

  if (shouldAlert) {
    created.push(buildNotification(event, { kind: "admin_pool" }, event.eventType === "auto_issue" ? "auto_issue" : "escalation"));
  }

  if (event.assignedTo) {
    created.push(buildNotification(event, { kind: "staff_name", name: event.assignedTo }, "assignment"));
  }

  for (const name of extractAtMentions(event.mentionText ?? "", staffNames)) {
    if (name === event.assignedTo) continue;
    created.push(buildNotification(event, { kind: "staff_name", name }, "mention"));
  }

  if (!isCrossover || shouldAlert) {
    created.push(buildNotification(event, { kind: "coordinator_pool" }, shouldAlert ? "escalation" : baseType));
  }

  if (shouldAlert && event.toDepartment) {
    created.push(buildNotification(event, { kind: "department_pool", department: event.toDepartment }, "escalation"));
  }

  const existing = state.notifications ?? [];
  return {
    ...state,
    notifications: [...created, ...existing].slice(0, MAX_NOTIFICATIONS)
  };
}

export function appendStaffEmailNotification(
  state: StaffOpsState,
  event: StaffOpsNotificationEvent,
  email: string
): StaffOpsState {
  const notification = buildNotification(event, { kind: "staff_email", email: email.trim().toLowerCase() }, "update");
  return {
    ...state,
    notifications: [notification, ...(state.notifications ?? [])].slice(0, MAX_NOTIFICATIONS)
  };
}

export function notificationsForSession(
  state: StaffOpsState,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  if (isTeamLeaderRole(session.role) || isGroomerRole(session.role) || isTrainerRole(session.role)) {
    return filterPersonalNotificationsForUser(state, session);
  }
  return filterNotificationsForUser(state, session);
}

export function countUnreadNotifications(
  state: StaffOpsState,
  session: { email?: string | null; adminUserId?: string | null; role?: string | null }
) {
  const readerKey = notificationReaderKey(session.email, session.adminUserId);
  return notificationsForSession(state, session).filter((notification) => !notification.read_by.includes(readerKey)).length;
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

export function crossoverAccessRolesInDirectory(directory: StaffDirectoryMember[]) {
  return directory.filter(
    (member) =>
      member.status === "Active" &&
      member.dashboard_role &&
      (canAccessCrossoverCommunication(member.dashboard_role) || isCrossoverStaffRole(member.dashboard_role))
  );
}
