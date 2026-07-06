import { canReviewManagementSupport, isFullAdminRole, isStaffOpsLimitedRole } from "@/lib/admin/users";
import type { CrossoverMessage, CrossoverReply, OwnerFollowUp, StaffOpsState } from "@/lib/staff/admin-ops";
import type { ManagementReport, SupportAdminStatus } from "@/lib/staff/management-reports";
import {
  filterPersonalNotificationsForUser,
  notificationReaderKey,
  notificationsForSession,
  type StaffNotification,
  type StaffNotificationType
} from "@/lib/staff/notifications";

export type NotificationSidebarFilter =
  | "all"
  | "unread"
  | "requests"
  | "complaints"
  | "write_ups"
  | "owner_issues"
  | "follow_ups"
  | "mentions"
  | "resolved"
  | "archived";

export type NotificationTopFilter = "all" | "requests" | "complaints" | "responses" | "needs_reply" | "closed";

export type NotificationSort = "newest" | "oldest" | "priority";

export type NotificationDisplayType =
  | "general"
  | "request"
  | "complaint"
  | "response"
  | "write_up"
  | "owner_alert"
  | "follow_up"
  | "mention"
  | "system"
  | "write_up_review";

export type NotificationDisplayStatus =
  | "Open"
  | "In Review"
  | "Waiting on Response"
  | "Responded"
  | "Resolved"
  | "Closed";

export type NotificationSession = {
  email?: string | null;
  adminUserId?: string | null;
  role?: string | null;
};

export type EnrichedNotification = StaffNotification & {
  displayType: NotificationDisplayType;
  displayStatus: NotificationDisplayStatus;
  preview: string;
  isUnread: boolean;
  needsReply: boolean;
  linkedReport?: ManagementReport | null;
  linkedCrossover?: CrossoverMessage | null;
  linkedFollowUp?: OwnerFollowUp | null;
};

const PRIORITY_RANK: Record<string, number> = {
  Critical: 5,
  Urgent: 4,
  High: 3,
  Medium: 2,
  Normal: 1,
  Low: 0
};

const QUICK_REPLIES = [
  "I'm reviewing this now.",
  "Can you add more details?",
  "This has been updated.",
  "This has been resolved.",
  "I'll follow up with the team.",
  "Please check the latest update."
] as const;

export { QUICK_REPLIES };

export function linkedEntityId(notification: StaffNotification) {
  return notification.linked_entity_id ?? notification.source_id;
}

export function linkedEntityTable(notification: StaffNotification) {
  return notification.linked_entity_type ?? notification.source_table;
}

function titleIncludes(notification: StaffNotification, ...needles: string[]) {
  const hay = `${notification.title} ${notification.body ?? ""}`.toLowerCase();
  return needles.some((needle) => hay.includes(needle.toLowerCase()));
}

export function inferDisplayType(notification: StaffNotification): NotificationDisplayType {
  if (notification.type === "mention") return "mention";
  if (notification.type === "reply") return "response";
  if (notification.type === "auto_issue") {
    if (titleIncludes(notification, "write-up", "write up", "warning notice")) return "write_up";
    if (titleIncludes(notification, "owner complaint")) return "owner_alert";
    if (titleIncludes(notification, "request")) return "request";
    if (titleIncludes(notification, "complaint")) return "complaint";
    return "system";
  }
  if (notification.source_tab === "owner_follow_up") return "follow_up";
  if (titleIncludes(notification, "management response", "replied", "response on your")) return "response";
  if (titleIncludes(notification, "write-up", "write up")) return "write_up_review";
  if (titleIncludes(notification, "owner complaint")) return "owner_alert";
  if (titleIncludes(notification, "request")) return "request";
  if (titleIncludes(notification, "complaint")) return "complaint";
  if (notification.type === "escalation") return "system";
  return "general";
}

export function mapSupportStatusToDisplay(status?: SupportAdminStatus | null): NotificationDisplayStatus {
  switch (status) {
    case "Submitted":
      return "Open";
    case "In Review":
      return "In Review";
    case "Needs More Info":
      return "Waiting on Response";
    case "Resolved":
      return "Resolved";
    case "Closed":
      return "Closed";
    default:
      return "Open";
  }
}

export function mapCrossoverStatusToDisplay(status?: string | null): NotificationDisplayStatus {
  if (!status) return "Open";
  if (status === "Resolved" || status === "Closed") return "Resolved";
  if (status === "In Progress" || status === "Needs Review") return "In Review";
  return "Open";
}

export function inferDisplayStatus(
  notification: StaffNotification,
  report?: ManagementReport | null,
  crossover?: CrossoverMessage | null
): NotificationDisplayStatus {
  if (notification.thread_status) {
    const map: Record<string, NotificationDisplayStatus> = {
      open: "Open",
      in_review: "In Review",
      waiting_on_response: "Waiting on Response",
      responded: "Responded",
      resolved: "Resolved",
      closed: "Closed"
    };
    return map[notification.thread_status] ?? "Open";
  }
  if (report?.admin_status) {
    const base = mapSupportStatusToDisplay(report.admin_status);
    if (base === "In Review" && report.management_response) return "Responded";
    return base;
  }
  if (crossover) return mapCrossoverStatusToDisplay(crossover.status);
  if (titleIncludes(notification, "closed")) return "Closed";
  if (titleIncludes(notification, "resolved", "reviewed")) return "Resolved";
  if (titleIncludes(notification, "management response", "replied")) return "Responded";
  if (titleIncludes(notification, "needs more info", "waiting")) return "Waiting on Response";
  if (titleIncludes(notification, "in review")) return "In Review";
  return "Open";
}

export function notificationMatchesSidebar(
  notification: EnrichedNotification,
  filter: NotificationSidebarFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return notification.isUnread;
  if (filter === "mentions") return notification.displayType === "mention" || notification.displayType === "response";
  if (filter === "requests") return notification.displayType === "request";
  if (filter === "complaints") return notification.displayType === "complaint";
  if (filter === "write_ups") return notification.displayType === "write_up" || notification.displayType === "write_up_review";
  if (filter === "owner_issues") return notification.displayType === "owner_alert";
  if (filter === "follow_ups") return notification.displayType === "follow_up";
  if (filter === "resolved") {
    return notification.displayStatus === "Resolved" || notification.displayStatus === "Closed";
  }
  if (filter === "archived") return notification.displayStatus === "Closed";
  return true;
}

export function notificationMatchesTopFilter(notification: EnrichedNotification, filter: NotificationTopFilter): boolean {
  if (filter === "all") return true;
  if (filter === "requests") return notification.displayType === "request";
  if (filter === "complaints") return notification.displayType === "complaint";
  if (filter === "responses") return notification.displayType === "response";
  if (filter === "needs_reply") return notification.needsReply;
  if (filter === "closed") return notification.displayStatus === "Closed" || notification.displayStatus === "Resolved";
  return true;
}

function reportNeedsReply(report: ManagementReport, session: NotificationSession, canReview: boolean): boolean {
  const status = report.admin_status ?? "Submitted";
  if (status === "Closed" || status === "Resolved") return false;
  const isSubmitter = report.created_by?.trim().toLowerCase() === session.email?.trim().toLowerCase();
  const visibleComments = (report.comments ?? []).filter((c) => c.visibility === "visible_to_submitter");
  const lastVisible = visibleComments.at(-1);
  if (canReview) {
    if (status === "Submitted") return true;
    if (lastVisible && lastVisible.user_role !== "admin" && lastVisible.user_role !== "management") return true;
    return status === "Needs More Info";
  }
  if (isSubmitter) {
    if (!report.management_response && visibleComments.length === 0) return false;
    if (status === "Needs More Info") return true;
    if (lastVisible && (lastVisible.user_role === "admin" || lastVisible.user_role === "management")) return true;
    if (report.management_response && !lastVisible) return true;
  }
  return false;
}

export function enrichNotifications(
  state: StaffOpsState,
  session: NotificationSession,
  reportsById: Map<string, ManagementReport>,
  options?: { personalOnly?: boolean }
): EnrichedNotification[] {
  const readerKey = notificationReaderKey(session.email, session.adminUserId);
  const canReview = canReviewManagementSupport(session.role);
  const base = options?.personalOnly
    ? filterPersonalNotificationsForUser(state, session)
    : notificationsForSession(state, session);

  return base.map((notification) => {
    const entityId = linkedEntityId(notification);
    const entityTable = linkedEntityTable(notification);
    const linkedReport = entityTable === "management_reports" ? reportsById.get(entityId) ?? null : null;
    const linkedCrossover =
      entityTable === "crossover_messages"
        ? state.crossover_messages.find((item) => item.id === entityId) ?? null
        : null;
    const linkedFollowUp =
      notification.source_tab === "owner_follow_up" || entityTable === "owner_follow_ups"
        ? state.owner_follow_ups.find((item) => item.id === entityId) ?? null
        : null;
    const displayType = inferDisplayType(notification);
    const displayStatus = inferDisplayStatus(notification, linkedReport, linkedCrossover);
    const isUnread = !notification.read_by.includes(readerKey);
    const needsReply = linkedReport ? reportNeedsReply(linkedReport, session, canReview) : false;
    const preview = (notification.body ?? linkedReport?.summary ?? linkedCrossover?.message ?? "").slice(0, 160);

    return {
      ...notification,
      displayType,
      displayStatus,
      preview,
      isUnread,
      needsReply,
      linkedReport,
      linkedCrossover,
      linkedFollowUp
    };
  });
}

export function sortNotifications(items: EnrichedNotification[], sort: NotificationSort) {
  const copy = [...items];
  if (sort === "oldest") {
    return copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  if (sort === "priority") {
    return copy.sort((a, b) => {
      const pr = (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      if (pr !== 0) return pr;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
  return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function filterNotificationsList(
  items: EnrichedNotification[],
  options: {
    sidebar: NotificationSidebarFilter;
    top: NotificationTopFilter;
    query: string;
    status?: NotificationDisplayStatus | "all";
    assignedTo?: string;
    sort: NotificationSort;
  }
) {
  const q = options.query.trim().toLowerCase();
  let filtered = items.filter(
    (item) =>
      notificationMatchesSidebar(item, options.sidebar) && notificationMatchesTopFilter(item, options.top)
  );
  if (options.status && options.status !== "all") {
    filtered = filtered.filter((item) => item.displayStatus === options.status);
  }
  if (options.assignedTo) {
    filtered = filtered.filter(
      (item) =>
        item.assigned_to === options.assignedTo ||
        item.linkedReport?.assigned_to === options.assignedTo
    );
  }
  if (q) {
    filtered = filtered.filter((item) => {
      const hay = `${item.title} ${item.preview} ${item.created_by ?? ""} ${item.linkedReport?.related_dog_name ?? ""} ${item.linkedReport?.related_owner_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return sortNotifications(filtered, options.sort);
}

export function countUnreadByCategory(items: EnrichedNotification[]) {
  const unread = items.filter((item) => item.isUnread);
  return {
    all: unread.length,
    requests: unread.filter((item) => item.displayType === "request").length,
    complaints: unread.filter((item) => item.displayType === "complaint").length,
    responses: unread.filter((item) => item.displayType === "response").length,
    mentions: unread.filter((item) => item.displayType === "mention").length
  };
}

export function crossoverRepliesForMessage(state: StaffOpsState, messageId: string): CrossoverReply[] {
  return (state.crossover_message_replies ?? [])
    .filter((reply) => reply.crossover_message_id === messageId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function canViewManagementReport(report: ManagementReport, session: NotificationSession): boolean {
  if (canReviewManagementSupport(session.role)) return true;
  const email = session.email?.trim().toLowerCase();
  if (email && report.created_by?.trim().toLowerCase() === email) return true;
  return false;
}

export function canReplyToManagementReport(report: ManagementReport, session: NotificationSession): boolean {
  if (canReviewManagementSupport(session.role)) return true;
  const email = session.email?.trim().toLowerCase();
  if (!email) return false;
  return report.created_by?.trim().toLowerCase() === email;
}

export function canUseInternalNotes(session: NotificationSession): boolean {
  return canReviewManagementSupport(session.role);
}

export function canManageSupportStatus(session: NotificationSession): boolean {
  return canReviewManagementSupport(session.role);
}

export function canReplyToCrossover(session: NotificationSession): boolean {
  return isFullAdminRole(session.role) || isStaffOpsLimitedRole(session.role);
}

export function displayTypeLabel(type: NotificationDisplayType) {
  const labels: Record<NotificationDisplayType, string> = {
    general: "General",
    request: "Request",
    complaint: "Complaint",
    response: "Response",
    write_up: "Write-Up",
    write_up_review: "Write-Up",
    owner_alert: "Owner Issue",
    follow_up: "Follow-Up",
    mention: "Mention",
    system: "System"
  };
  return labels[type];
}

export function typeIconName(type: NotificationDisplayType): StaffNotificationType {
  if (type === "mention") return "mention";
  if (type === "response") return "reply";
  if (type === "complaint" || type === "owner_alert") return "auto_issue";
  if (type === "request") return "assignment";
  return "update";
}
