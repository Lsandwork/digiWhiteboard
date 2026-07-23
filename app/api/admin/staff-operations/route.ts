import { NextResponse } from "next/server";
import { normalizeAdminUserId } from "@/lib/admin/users";
import {
  canAccessCrossoverCommunication,
  canCreateFrontDeskLog,
  canCreateTrainerEntry,
  canManageStaffDirectory,
  canManageStaffOperations,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { accessFromLegacyRole, hasAnyPermission, hasPermission } from "@/lib/admin/permissions";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { createAndPushStaffNotice } from "@/lib/staff/push-notices";
import {
  createActiveIssue,
  createCrossoverMessage,
  createStaffDirectoryMember,
  deleteCrossoverMessage,
  deleteStaffDirectoryMember,
  createOwnerFollowUp,
  listStaffOps,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  moveCrossoverMessages,
  bulkUpdateCrossoverMessages,
  replyToCrossoverMessage,
  updateActiveIssue,
  updateCrossoverMessage,
  updateStaffDirectoryMember,
  updateOwnerFollowUp
} from "@/lib/staff/admin-ops";
import { notificationReaderKey } from "@/lib/staff/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function crossoverForbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to access Crossover Communication." }, { status: 403 });
}

function staffOpsForbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage Staff Admin records." }, { status: 403 });
}

const CROSSOVER_ACTIONS = new Set([
  "create_crossover",
  "update_crossover",
  "reply_crossover",
  "delete_crossover",
  "move_crossover",
  "bulk_update_crossover"
]);
const NOTIFICATION_ACTIONS = new Set(["mark_notification_read", "mark_all_notifications_read"]);
const STAFF_OPS_VIEW_PERMISSIONS = ["view_front_desk_log", "view_owner_follow_up", "view_active_issues"] as const;

function canViewStaffOps(session: ReturnType<typeof getAdminSessionFromRequest>) {
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);
  return (
    hasAnyPermission(access, [...STAFF_OPS_VIEW_PERMISSIONS, "create_trainer_entry"]) ||
    canManageStaffOperations(session?.role)
  );
}

function canUseFrontDeskLog(session: ReturnType<typeof getAdminSessionFromRequest>) {
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);
  return hasPermission(access, "view_front_desk_log") || canAccessCrossoverCommunication(session?.role);
}

function canCreateShiftLogEntry(session: ReturnType<typeof getAdminSessionFromRequest>) {
  return canCreateFrontDeskLog(session?.role) || canCreateTrainerEntry(session?.role);
}

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin",
    actorAdminId: normalizeAdminUserId(session?.adminUserId)
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session } = actorFromRequest(request);
  if (!canViewStaffOps(session)) {
    return staffOpsForbiddenResponse();
  }

  try {
    const state = await listStaffOps(getServiceSupabase());
    return NextResponse.json({
      ...state,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? "owner_admin"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Staff Admin records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor, actorAdminId } = actorFromRequest(request);
  if (!canViewStaffOps(session)) {
    return staffOpsForbiddenResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = getServiceSupabase();

    if (action === "create_crossover" && !canCreateShiftLogEntry(session)) {
      return crossoverForbiddenResponse();
    }
    if (
      (action === "update_crossover" ||
        action === "reply_crossover" ||
        action === "delete_crossover" ||
        action === "move_crossover" ||
        action === "bulk_update_crossover") &&
      !canUseFrontDeskLog(session)
    ) {
      return crossoverForbiddenResponse();
    }
    if (NOTIFICATION_ACTIONS.has(action) && !canAccessCrossoverCommunication(session?.role) && !canManageStaffOperations(session?.role)) {
      return staffOpsForbiddenResponse();
    }
    if (
      !CROSSOVER_ACTIONS.has(action) &&
      !NOTIFICATION_ACTIONS.has(action) &&
      action !== "create_staff_member" &&
      action !== "update_staff_member" &&
      action !== "delete_staff_member" &&
      !canManageStaffOperations(session?.role)
    ) {
      return staffOpsForbiddenResponse();
    }

    let result: unknown;
    let auditAction = "staff.ops.action";

    if (action === "create_crossover") {
      result = await createCrossoverMessage(supabase, body, actor);
      auditAction = "staff.crossover.create";
    } else if (action === "update_crossover") {
      const id = String(body.id ?? "");
      result = await updateCrossoverMessage(supabase, id, body, actor);
      auditAction = "staff.crossover.update";
    } else if (action === "move_crossover") {
      const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id ?? "")) : [];
      const targetLog = String(body.target_log ?? "") as "crossover" | "open" | "archived";
      result = await moveCrossoverMessages(supabase, ids, targetLog, actor);
      auditAction = "staff.crossover.move";
    } else if (action === "bulk_update_crossover") {
      const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id ?? "")) : [];
      result = await bulkUpdateCrossoverMessages(supabase, ids, body, actor);
      auditAction = "staff.crossover.bulk_update";
    } else if (action === "delete_crossover") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
      result = await deleteCrossoverMessage(supabase, id, actor, {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? null
      });
      auditAction = "staff.crossover.delete";
    } else if (action === "reply_crossover") {
      const id = String(body.id ?? "");
      result = await replyToCrossoverMessage(supabase, id, body.message, actor, String(body.update_type ?? "Internal Note"));
      auditAction = "staff.shift_log.update";
    } else if (action === "create_follow_up") {
      result = await createOwnerFollowUp(supabase, body, actor);
      auditAction = "staff.follow_up.create";
    } else if (action === "update_follow_up") {
      const id = String(body.id ?? "");
      result = await updateOwnerFollowUp(supabase, id, body, actor);
      auditAction = "staff.follow_up.update";
    } else if (action === "create_issue") {
      result = await createActiveIssue(supabase, body, actor);
      auditAction = "staff.issue.create";
    } else if (action === "update_issue") {
      const id = String(body.id ?? "");
      result = await updateActiveIssue(supabase, id, body, actor);
      auditAction = "staff.issue.update";
    } else if (action === "create_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return staffOpsForbiddenResponse();
      result = await createStaffDirectoryMember(supabase, body, actor, actorAdminId);
      auditAction = "staff.directory.create";
    } else if (action === "update_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return staffOpsForbiddenResponse();
      const id = String(body.id ?? "");
      result = await updateStaffDirectoryMember(supabase, id, body, actor, actorAdminId);
      auditAction = "staff.directory.update";
    } else if (action === "delete_staff_member") {
      if (!canManageStaffDirectory(session?.role)) return staffOpsForbiddenResponse();
      const id = String(body.id ?? "");
      await deleteStaffDirectoryMember(supabase, id, actor);
      result = { id };
      auditAction = "staff.directory.delete";
    } else if (action === "push_to_whiteboard") {
      const title = String(body.title ?? "").trim();
      const message = String(body.message ?? "").trim();
      if (!title) return NextResponse.json({ error: "Title is required to push to whiteboard." }, { status: 400 });
      result = await createAndPushStaffNotice(
        supabase,
        {
          title,
          message,
          priority: body.priority === "Critical" || body.priority === "High" ? "urgent" : "important",
          display_mode: body.priority === "Critical" || body.priority === "High" ? "urgent" : "normal",
          display_duration_minutes: body.display_duration_minutes ?? 5
        },
        actor
      );
      auditAction = "staff.ops.push_to_whiteboard";
    } else if (action === "mark_notification_read") {
      const notificationId = String(body.notification_id ?? "");
      if (!notificationId) return NextResponse.json({ error: "notification_id is required." }, { status: 400 });
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      result = await markStaffNotificationRead(supabase, notificationId, readerKey);
      auditAction = "staff.notification.read";
    } else if (action === "mark_all_notifications_read") {
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      result = await markAllStaffNotificationsRead(supabase, readerKey, {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? null
      });
      auditAction = "staff.notification.read_all";
    } else {
      return NextResponse.json({ error: "Unsupported Staff Admin action." }, { status: 400 });
    }

    void writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: auditAction,
      targetType: "staff_operations",
      details: { action }
    }).catch((error) => {
      console.error("[staff-operations] audit log failed:", error instanceof Error ? error.message : error);
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save Staff Admin record.";
    if (message.includes("only delete Front Desk Log entries")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
