import { NextResponse } from "next/server";
import { resolveSessionDisplayName } from "@/lib/admin/actor-display";
import { normalizeAdminUserId } from "@/lib/admin/users";
import {
  canAccessCrossoverCommunication,
  canCreateFrontDeskLog,
  canCreateTrainerEntry,
  canEditFrontDeskLog,
  canManageStaffDirectory,
  canManageStaffOperations,
  getEffectiveAdminRole,
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
  createCrossoverMessages,
  applyStaffDirectoryReconciliation,
  createStaffDirectoryMember,
  previewStaffDirectoryReconciliation,
  deleteCrossoverMessage,
  deleteStaffDirectoryMember,
  createOwnerFollowUp,
  capStaffOpsListPayload,
  listStaffOps,
  clearStaffInboxNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
  moveCrossoverMessages,
  bulkUpdateCrossoverMessages,
  reopenCrossoverMessage,
  replyToCrossoverMessage,
  updateActiveIssue,
  updateCrossoverMessage,
  updateStaffDirectoryMember,
  updateOwnerFollowUp
} from "@/lib/staff/admin-ops";
import {
  accessForStaffOpsSession,
  assertStaffOpsPostAuthorized,
  buildUserInteractionsCapabilities,
  StaffOpsAuthorizationError,
  StaffOpsAtomicSaveUnavailableError,
  StaffOpsConflictError,
  parseStaffOpsRevision
} from "@/lib/user-interactions/staff-ops-auth";
import { notificationReaderKey, notificationsForSession } from "@/lib/staff/notifications";
import { StaffDirectoryValidationError } from "@/lib/staff/directory-reconciliation";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getOrLoadTtlCache, invalidateTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import {
  STAFF_OPS_LIST_CACHE_KEY,
  STAFF_OPS_LIST_CACHE_TTL_MS
} from "@/lib/ops-command-center/constants";
import {
  buildUserInteractionsViewPayload,
  parseUserInteractionsViewParam
} from "@/lib/user-interactions/api-view";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const STAFF_OPS_LOAD_TIMEOUT_MS = 8_000;

function crossoverForbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to access Crossover Communication." }, { status: 403 });
}

function staffOpsForbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage Staff Admin records." }, { status: 403 });
}

const CROSSOVER_ACTIONS = new Set([
  "create_crossover",
  "create_crossover_bulk",
  "update_crossover",
  "reply_crossover",
  "delete_crossover",
  "move_crossover",
  "bulk_update_crossover"
]);
const NOTIFICATION_ACTIONS = new Set([
  "mark_notification_read",
  "mark_all_notifications_read",
  "clear_inbox_notifications"
]);
const STAFF_OPS_VIEW_PERMISSIONS = ["view_front_desk_log", "view_owner_follow_up", "view_active_issues"] as const;

function canViewStaffOps(role: string | null, session: ReturnType<typeof getAdminSessionFromRequest>) {
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, role);
  return (
    hasAnyPermission(access, [...STAFF_OPS_VIEW_PERMISSIONS, "create_trainer_entry"]) ||
    canManageStaffOperations(role)
  );
}

function canUseFrontDeskLog(role: string | null, session: ReturnType<typeof getAdminSessionFromRequest>) {
  const access = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, role);
  return hasPermission(access, "view_front_desk_log") || canAccessCrossoverCommunication(role);
}

function canCreateShiftLogEntry(role: string | null) {
  return canCreateFrontDeskLog(role) || canCreateTrainerEntry(role);
}

function canMutateFrontDeskLog(role: string | null) {
  return canEditFrontDeskLog(role) || canManageStaffOperations(role);
}

/** Any staff who can post to Team Log can also add shared updates/comments. */
function canReplyToShiftLog(role: string | null) {
  return canCreateShiftLogEntry(role) || canMutateFrontDeskLog(role);
}

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const role = getEffectiveAdminRole(request);
  return {
    session,
    role,
    actor: session?.email ?? session?.adminUserId ?? (role ? "admin" : "admin"),
    actorAdminId: normalizeAdminUserId(session?.adminUserId)
  };
}

async function actorContext(request: Request) {
  const base = actorFromRequest(request);
  const supabase = getServiceSupabase();
  const actorDisplayName = (await resolveSessionDisplayName(supabase, base.session)) ?? base.actor;
  return { ...base, supabase, actorDisplayName };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, role } = actorFromRequest(request);
  if (!canViewStaffOps(role, session)) {
    return staffOpsForbiddenResponse();
  }

  try {
    const state = await withTimeoutFallback(
      getOrLoadTtlCache(STAFF_OPS_LIST_CACHE_KEY, STAFF_OPS_LIST_CACHE_TTL_MS, () =>
        listStaffOps(getServiceSupabase({ timeoutMs: STAFF_OPS_LOAD_TIMEOUT_MS }))
      ),
      STAFF_OPS_LOAD_TIMEOUT_MS,
      null
    );
    if (!state) {
      return NextResponse.json(
        { error: "Team Log is taking too long to load. Retry in a moment." },
        { status: 503 }
      );
    }
    const readerSession = {
      email: session?.email ?? null,
      adminUserId: session?.adminUserId ?? null,
      role: role ?? null
    };
    const url = new URL(request.url);
    const uiView = parseUserInteractionsViewParam(url.searchParams.get("view"));
    if (uiView) {
      const actorDisplayName =
        (await resolveSessionDisplayName(getServiceSupabase(), session)) ?? session?.email ?? null;
      return NextResponse.json(
        buildUserInteractionsViewPayload(state, {
          view: uiView,
          search: url.searchParams.get("q") ?? undefined,
          page: Number(url.searchParams.get("page") ?? "1") || 1,
          pageSize: Number(url.searchParams.get("pageSize") ?? "") || undefined,
          actor: {
            email: readerSession.email,
            adminUserId: readerSession.adminUserId,
            displayName: actorDisplayName,
            role: readerSession.role
          },
          permissions: buildUserInteractionsCapabilities(
            accessForStaffOpsSession(readerSession.adminUserId, readerSession.email, role),
            role
          ),
          staffOpsRevision: state._revision ?? 0
        })
      );
    }
    return NextResponse.json({
      ...capStaffOpsListPayload(state),
      staff_ops_revision: state._revision ?? 0,
      // Never expose other users' notifications in the payload.
      notifications: notificationsForSession(state, readerSession),
      currentUser: {
        email: readerSession.email,
        adminUserId: readerSession.adminUserId,
        role: readerSession.role
      },
      permissions: {
        canCreate: canCreateShiftLogEntry(role),
        canEdit: canMutateFrontDeskLog(role),
        canView: canUseFrontDeskLog(role, session)
      }
    });
  } catch (error) {
    const timedOut = error instanceof Error && /timed out/i.test(error.message);
    return NextResponse.json(
      { error: timedOut ? "Team Log is taking too long to load. Retry in a moment." : error instanceof Error ? error.message : "Unable to load Staff Admin records." },
      { status: timedOut ? 503 : 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, role, actor, actorAdminId, supabase, actorDisplayName } = await actorContext(request);
  if (!canViewStaffOps(role, session)) {
    return staffOpsForbiddenResponse();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if ((action === "create_crossover" || action === "create_crossover_bulk") && !canCreateShiftLogEntry(role)) {
      return crossoverForbiddenResponse();
    }
    if (action === "reply_crossover" && !canReplyToShiftLog(role)) {
      return crossoverForbiddenResponse();
    }
    if (
      (action === "update_crossover" ||
        action === "delete_crossover" ||
        action === "move_crossover" ||
        action === "bulk_update_crossover") &&
      !canMutateFrontDeskLog(role)
    ) {
      return crossoverForbiddenResponse();
    }
    if (NOTIFICATION_ACTIONS.has(action) && !canAccessCrossoverCommunication(role) && !canManageStaffOperations(role)) {
      return staffOpsForbiddenResponse();
    }
    if (action === "push_to_whiteboard" && !canManageStaffOperations(role)) {
      return staffOpsForbiddenResponse();
    }

    const staffOpsAccess = accessForStaffOpsSession(session?.adminUserId, session?.email, role);
    try {
      assertStaffOpsPostAuthorized(staffOpsAccess, role, action, body);
    } catch (error) {
      if (error instanceof StaffOpsAuthorizationError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    let result: unknown;
    let auditAction = "staff.ops.action";
    const staffOpsRevision = parseStaffOpsRevision(body);
    const writeOpts = staffOpsRevision !== undefined ? { expectedRevision: staffOpsRevision } : undefined;

    if (action === "create_crossover") {
      result = await createCrossoverMessage(supabase, body, actor, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.create";
    } else if (action === "create_crossover_bulk") {
      const entries = Array.isArray(body.entries) ? (body.entries as Record<string, unknown>[]) : [];
      result = await createCrossoverMessages(supabase, entries, actor, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.create_bulk";
    } else if (action === "update_crossover") {
      const id = String(body.id ?? "");
      result = await updateCrossoverMessage(supabase, id, body, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.update";
    } else if (action === "move_crossover") {
      const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id ?? "")) : [];
      const targetLog = String(body.target_log ?? "") as "crossover" | "open" | "archived";
      result = await moveCrossoverMessages(supabase, ids, targetLog, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.move";
    } else if (action === "bulk_update_crossover") {
      const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id ?? "")) : [];
      result = await bulkUpdateCrossoverMessages(supabase, ids, body, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.bulk_update";
    } else if (action === "delete_crossover") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
      result = await deleteCrossoverMessage(
        supabase,
        id,
        actorDisplayName,
        {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role: role ?? null
        },
        writeOpts
      );
      auditAction = "staff.crossover.delete";
    } else if (action === "reply_crossover") {
      const id = String(body.id ?? "");
      result = await replyToCrossoverMessage(
        supabase,
        id,
        body.message,
        actor,
        String(body.update_type ?? "Internal Note"),
        actorDisplayName,
        writeOpts
      );
      auditAction = "staff.shift_log.update";
    } else if (action === "reopen_crossover") {
      const id = String(body.id ?? "");
      result = await reopenCrossoverMessage(supabase, id, actor, actorDisplayName, writeOpts);
      auditAction = "staff.crossover.reopen";
    } else if (action === "create_follow_up") {
      result = await createOwnerFollowUp(supabase, body, actorDisplayName, writeOpts);
      auditAction = "staff.follow_up.create";
    } else if (action === "update_follow_up") {
      const id = String(body.id ?? "");
      result = await updateOwnerFollowUp(supabase, id, body, actorDisplayName, writeOpts);
      auditAction = "staff.follow_up.update";
    } else if (action === "create_issue") {
      result = await createActiveIssue(supabase, body, actorDisplayName, writeOpts);
      auditAction = "staff.issue.create";
    } else if (action === "update_issue") {
      const id = String(body.id ?? "");
      result = await updateActiveIssue(supabase, id, body, actorDisplayName, writeOpts);
      auditAction = "staff.issue.update";
    } else if (action === "create_staff_member") {
      if (!canManageStaffDirectory(role)) return staffOpsForbiddenResponse();
      result = await createStaffDirectoryMember(supabase, body, actorDisplayName, actorAdminId, writeOpts);
      auditAction = "staff.directory.create";
    } else if (action === "update_staff_member") {
      if (!canManageStaffDirectory(role)) return staffOpsForbiddenResponse();
      const id = String(body.id ?? "");
      result = await updateStaffDirectoryMember(supabase, id, body, actorDisplayName, actorAdminId, writeOpts);
      auditAction = "staff.directory.update";
    } else if (action === "delete_staff_member") {
      if (!canManageStaffDirectory(role)) return staffOpsForbiddenResponse();
      const id = String(body.id ?? "");
      await deleteStaffDirectoryMember(supabase, id, actorDisplayName, writeOpts);
      result = { id };
      auditAction = "staff.directory.delete";
    } else if (action === "preview_staff_directory_reconciliation") {
      if (!canManageStaffDirectory(role)) return staffOpsForbiddenResponse();
      result = await previewStaffDirectoryReconciliation(supabase);
      auditAction = "staff.directory.reconciliation_preview";
    } else if (action === "apply_staff_directory_reconciliation") {
      if (!canManageStaffDirectory(role)) return staffOpsForbiddenResponse();
      if (body.confirm !== true) {
        return NextResponse.json({ error: "Reconciliation apply requires explicit confirmation." }, { status: 400 });
      }
      const approvedAccountIds = Array.isArray(body.approved_account_ids)
        ? body.approved_account_ids.map((id: unknown) => String(id ?? "")).filter(Boolean)
        : null;
      result = await applyStaffDirectoryReconciliation(supabase, actorDisplayName, {
        ...writeOpts,
        approvedAccountIds
      });
      auditAction = "staff.directory.reconciliation_apply";
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
        actorDisplayName
      );
      auditAction = "staff.ops.push_to_whiteboard";
    } else if (action === "mark_notification_read") {
      const notificationId = String(body.notification_id ?? "");
      if (!notificationId) return NextResponse.json({ error: "notification_id is required." }, { status: 400 });
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      const readerSession = {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null
      };
      result = await markStaffNotificationRead(supabase, notificationId, readerKey, readerSession, writeOpts);
      auditAction = "staff.notification.read";
    } else if (action === "mark_all_notifications_read") {
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      const readerSession = {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null
      };
      const nextState = await markAllStaffNotificationsRead(supabase, readerKey, readerSession, writeOpts);
      // Return only this user's visible notifications after mark-all.
      result = {
        ...nextState,
        notifications: notificationsForSession(nextState, readerSession)
      };
      auditAction = "staff.notification.read_all";
    } else if (action === "clear_inbox_notifications") {
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      const readerSession = {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null
      };
      const nextState = await clearStaffInboxNotifications(supabase, readerKey, readerSession, writeOpts);
      result = {
        ...nextState,
        notifications: notificationsForSession(nextState, readerSession)
      };
      auditAction = "staff.notification.clear_inbox";
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

    invalidateTtlCache("staff-ops:");

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof StaffOpsConflictError) {
      return NextResponse.json({ error: error.message, code: "staff_ops_conflict" }, { status: 409 });
    }
    if (error instanceof StaffOpsAtomicSaveUnavailableError) {
      return NextResponse.json(
        { error: error.message, code: "staff_ops_atomic_unavailable" },
        { status: 503 }
      );
    }
    if (error instanceof StaffDirectoryValidationError) {
      return NextResponse.json({ error: error.message, code: "staff_directory_validation" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Unable to save Staff Admin record.";
    if (message.includes("only delete Team Log entries")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("resolution note is required")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
