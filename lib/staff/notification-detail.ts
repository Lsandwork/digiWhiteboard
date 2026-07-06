type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import type { CrossoverReply } from "@/lib/staff/admin-ops";
import { listStaffOps } from "@/lib/staff/admin-ops";
import type { ManagementReport } from "@/lib/staff/management-reports";
import { getManagementReportById } from "@/lib/staff/management-reports";
import {
  canReplyToCrossover,
  canReplyToManagementReport,
  canUseInternalNotes,
  canViewManagementReport,
  crossoverRepliesForMessage,
  enrichNotifications,
  linkedEntityId,
  linkedEntityTable,
  type EnrichedNotification,
  type NotificationSession
} from "@/lib/staff/notification-hub";
import { canReviewManagementSupport } from "@/lib/admin/users";
import { notificationVisibleToUser, type StaffNotification } from "@/lib/staff/notifications";

export type NotificationDetailPayload = {
  notification: EnrichedNotification;
  report: ManagementReport | null;
  crossoverReplies: CrossoverReply[];
  permissions: {
    canReply: boolean;
    canInternalNote: boolean;
    canManageStatus: boolean;
    canAssign: boolean;
    canReplyCrossover: boolean;
  };
  currentUser: NotificationSession;
};

export async function loadNotificationDetail(
  supabase: SupabaseClient,
  notificationId: string,
  session: NotificationSession
): Promise<NotificationDetailPayload | null> {
  const state = await listStaffOps(supabase);
  const raw = (state.notifications ?? []).find((item) => item.id === notificationId);
  if (!raw) return null;

  if (!notificationVisibleToUser(raw, state.staff_directory, session)) {
    return null;
  }

  const reportsById = new Map<string, ManagementReport>();
  const entityTable = linkedEntityTable(raw);
  const entityId = linkedEntityId(raw);

  if (entityTable === "management_reports") {
    const report = await getManagementReportById(supabase, entityId);
    if (report && canViewManagementReport(report, session)) {
      reportsById.set(entityId, report);
    }
  }

  const enriched = enrichNotifications(state, session, reportsById).find((item) => item.id === notificationId);
  if (!enriched) return null;

  const report = reportsById.get(entityId) ?? enriched.linkedReport ?? null;
  const crossoverReplies =
    enriched.linkedCrossover ? crossoverRepliesForMessage(state, enriched.linkedCrossover.id) : [];

  const canManage = canReviewManagementSupport(session.role);
  const canReplySupport = report ? canReplyToManagementReport(report, session) : false;
  const canReplyCrossover = enriched.linkedCrossover ? canReplyToCrossover(session) : false;

  return {
    notification: enriched,
    report,
    crossoverReplies,
    permissions: {
      canReply: canReplySupport || canReplyCrossover,
      canInternalNote: canUseInternalNotes(session),
      canManageStatus: canManage,
      canAssign: canManage,
      canReplyCrossover
    },
    currentUser: session
  };
}

export function findNotificationById(
  notifications: StaffNotification[],
  id: string
): StaffNotification | null {
  return notifications.find((item) => item.id === id) ?? null;
}
