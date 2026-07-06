import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { canReviewManagementSupport } from "@/lib/admin/users";
import { applySupportItemAction } from "@/lib/staff/management-support-admin";
import { loadNotificationDetail } from "@/lib/staff/notification-detail";
import { markStaffNotificationRead } from "@/lib/staff/admin-ops";
import { notificationReaderKey } from "@/lib/staff/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function sessionFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin",
    role: session?.role ?? null,
    user: {
      email: session?.email ?? null,
      adminUserId: session?.adminUserId ?? null,
      role: session?.role ?? null
    }
  };
}

export async function GET(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { user } = sessionFromRequest(request);
  const { id } = await context.params;

  try {
    const detail = await loadNotificationDetail(getServiceSupabase(), id, user);
    if (!detail) {
      return NextResponse.json({ error: "This notification could not be loaded." }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "This notification could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, user } = sessionFromRequest(request);
  const { id } = await context.params;

  try {
    const readerKey = notificationReaderKey(session?.email, session?.adminUserId);
    await markStaffNotificationRead(getServiceSupabase(), id, readerKey);
    const detail = await loadNotificationDetail(getServiceSupabase(), id, user);
    return NextResponse.json({ ok: true, detail });
  } catch {
    return NextResponse.json({ error: "Unable to mark notification as read." }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, actor, role, user } = sessionFromRequest(request);
  if (!canReviewManagementSupport(role)) {
    return NextResponse.json({ error: "You do not have permission to update status." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as Record<string, unknown>;
  const status = String(body.status ?? "");
  const assignedTo = body.assigned_to !== undefined ? String(body.assigned_to) : undefined;
  const supportAction = body.support_action ? String(body.support_action) : null;

  try {
    const supabase = getServiceSupabase();
    const detail = await loadNotificationDetail(supabase, id, user);
    if (!detail?.report) {
      return NextResponse.json({ error: "No linked submission found for this notification." }, { status: 400 });
    }

    const reportId = detail.report.id;
    let updated = detail.report;

    if (supportAction) {
      updated = await applySupportItemAction(supabase, reportId, supportAction, body, actor);
    } else if (assignedTo !== undefined) {
      updated = await applySupportItemAction(supabase, reportId, "assign", { assigned_to: assignedTo }, actor);
    } else if (status) {
      updated = await applySupportItemAction(supabase, reportId, "change_status", { status }, actor);
    } else {
      return NextResponse.json({ error: "status, assigned_to, or support_action is required." }, { status: 400 });
    }

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId ?? null,
      actorEmail: session?.email ?? null,
      action: "staff.notification.status",
      targetType: "management_report",
      targetId: updated.id,
      details: { notification_id: id, status: updated.admin_status }
    });

    const refreshed = await loadNotificationDetail(supabase, id, user);
    return NextResponse.json({ ok: true, detail: refreshed });
  } catch {
    return NextResponse.json({ error: "Unable to update status." }, { status: 400 });
  }
}
