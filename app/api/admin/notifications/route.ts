import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canAccessManagementReports, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { canReviewManagementSupport } from "@/lib/admin/users";
import {
  applySubmitterSupportReply,
  applySupportItemAction
} from "@/lib/staff/management-support-admin";
import { canViewManagementReport } from "@/lib/staff/notification-hub";
import { getManagementReportById } from "@/lib/staff/management-reports";
import { markStaffNotificationRead, replyToCrossoverMessage } from "@/lib/staff/admin-ops";
import { notificationReaderKey } from "@/lib/staff/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin",
    role: session?.role ?? null
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session } = actorFromRequest(request);
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("report_id");

  if (!reportId) {
    return NextResponse.json({ error: "report_id is required." }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const report = await getManagementReportById(supabase, reportId);
    if (!report) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const sessionUser = {
      email: session?.email ?? null,
      adminUserId: session?.adminUserId ?? null,
      role: session?.role ?? null
    };
    const isSubmitter = report.created_by?.trim().toLowerCase() === session?.email?.trim().toLowerCase();
    const canAccess =
      canReviewManagementSupport(session?.role) ||
      isSubmitter ||
      canViewManagementReport(report, sessionUser);
    if (!canAccess) {
      return NextResponse.json({ error: "You do not have permission to view this item." }, { status: 403 });
    }

    return NextResponse.json({
      report,
      canReview: canReviewManagementSupport(session?.role),
      canReply:
        canReviewManagementSupport(session?.role) ||
        report.created_by?.trim().toLowerCase() === session?.email?.trim().toLowerCase()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load notification detail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor, role } = actorFromRequest(request);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const supabase = getServiceSupabase();

    if (action === "mark_notification_read") {
      const notificationId = String(body.notification_id ?? "");
      if (!notificationId) return NextResponse.json({ error: "notification_id is required." }, { status: 400 });
      const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
      await markStaffNotificationRead(supabase, notificationId, readerKey);
      return NextResponse.json({ ok: true });
    }

    if (action === "reply_support") {
      const reportId = String(body.report_id ?? "");
      const message = String(body.message ?? "").trim();
      const isInternal = Boolean(body.internal_note);
      const markResolved = Boolean(body.mark_resolved);
      if (!reportId || !message) {
        return NextResponse.json({ error: "report_id and message are required." }, { status: 400 });
      }

      const report = await getManagementReportById(supabase, reportId);
      if (!report) return NextResponse.json({ error: "Not found." }, { status: 404 });

      let updated;
      if (canReviewManagementSupport(role)) {
        const supportAction = isInternal ? "add_internal_note" : "add_response";
        updated = await applySupportItemAction(supabase, reportId, supportAction, {
          body: message,
          user_role: role ?? "admin",
          mark_resolved: markResolved
        }, actor);
      } else if (report.created_by?.trim().toLowerCase() === session?.email?.trim().toLowerCase()) {
        updated = await applySubmitterSupportReply(supabase, reportId, message, actor, role ?? "staff");
      } else {
        return NextResponse.json({ error: "You do not have permission to reply." }, { status: 403 });
      }

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: isInternal ? "staff.notification.internal_note" : "staff.notification.reply",
        targetType: "management_report",
        targetId: updated.id,
        details: { status: updated.admin_status }
      });

      return NextResponse.json({ ok: true, report: updated });
    }

    if (action === "update_support_status") {
      if (!canReviewManagementSupport(role)) {
        return NextResponse.json({ error: "You do not have permission to update status." }, { status: 403 });
      }
      const reportId = String(body.report_id ?? "");
      const status = String(body.status ?? "");
      if (!reportId || !status) {
        return NextResponse.json({ error: "report_id and status are required." }, { status: 400 });
      }
      const updated = await applySupportItemAction(supabase, reportId, "change_status", { status }, actor);
      return NextResponse.json({ ok: true, report: updated });
    }

    if (action === "assign_support") {
      if (!canReviewManagementSupport(role)) {
        return NextResponse.json({ error: "You do not have permission to assign." }, { status: 403 });
      }
      const reportId = String(body.report_id ?? "");
      const assignedTo = String(body.assigned_to ?? "");
      if (!reportId) return NextResponse.json({ error: "report_id is required." }, { status: 400 });
      const updated = await applySupportItemAction(supabase, reportId, "assign", { assigned_to: assignedTo }, actor);
      return NextResponse.json({ ok: true, report: updated });
    }

    if (action === "support_action") {
      if (!canReviewManagementSupport(role)) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const reportId = String(body.report_id ?? "");
      const supportAction = String(body.support_action ?? "");
      if (!reportId || !supportAction) {
        return NextResponse.json({ error: "report_id and support_action are required." }, { status: 400 });
      }
      const updated = await applySupportItemAction(supabase, reportId, supportAction, body, actor);
      return NextResponse.json({ ok: true, report: updated });
    }

    if (action === "reply_crossover") {
      const crossoverId = String(body.crossover_id ?? "");
      const message = String(body.message ?? "").trim();
      if (!crossoverId || !message) {
        return NextResponse.json({ error: "crossover_id and message are required." }, { status: 400 });
      }
      const reply = await replyToCrossoverMessage(supabase, crossoverId, message, actor, "Reply");
      return NextResponse.json({ ok: true, reply });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process notification action.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
