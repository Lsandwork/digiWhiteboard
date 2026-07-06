import { NextResponse } from "next/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { canReviewManagementSupport } from "@/lib/admin/users";
import {
  applySubmitterSupportReply,
  applySupportItemAction
} from "@/lib/staff/management-support-admin";
import { loadNotificationDetail } from "@/lib/staff/notification-detail";
import { linkedEntityId, linkedEntityTable } from "@/lib/staff/notification-hub";
import { replyToCrossoverMessage } from "@/lib/staff/admin-ops";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const session = getAdminSessionFromRequest(request);
  const actor = session?.email ?? session?.adminUserId ?? "admin";
  const role = session?.role ?? null;
  const user = {
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    role
  };
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const message = String(body.message ?? "").trim();
    const isInternal = Boolean(body.internal_note);
    const markResolved = Boolean(body.mark_resolved);

    if (!message) {
      return NextResponse.json({ error: "Response is required." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const detail = await loadNotificationDetail(supabase, id, user);
    if (!detail) {
      return NextResponse.json({ error: "This notification could not be loaded." }, { status: 404 });
    }

    const { notification } = detail;
    const entityTable = linkedEntityTable(notification);
    const entityId = linkedEntityId(notification);

    if (entityTable === "management_reports" && detail.report) {
      if (!detail.permissions.canReply && !canReviewManagementSupport(role)) {
        return NextResponse.json({ error: "You do not have permission to reply." }, { status: 403 });
      }

      let updated;
      if (canReviewManagementSupport(role)) {
        const supportAction = isInternal ? "add_internal_note" : "add_response";
        updated = await applySupportItemAction(supabase, detail.report.id, supportAction, {
          body: message,
          user_role: role ?? "admin",
          mark_resolved: markResolved
        }, actor);
      } else if (detail.report.created_by?.trim().toLowerCase() === session?.email?.trim().toLowerCase()) {
        updated = await applySubmitterSupportReply(supabase, detail.report.id, message, actor, role ?? "staff");
      } else {
        return NextResponse.json({ error: "You do not have permission to reply." }, { status: 403 });
      }

      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: isInternal ? "staff.notification.internal_note" : "staff.notification.reply",
        targetType: "management_report",
        targetId: updated.id,
        details: { notification_id: id, status: updated.admin_status }
      });

      const refreshed = await loadNotificationDetail(supabase, id, user);
      return NextResponse.json({ ok: true, message: "Response sent.", detail: refreshed });
    }

    if (entityTable === "crossover_messages" && notification.linkedCrossover) {
      if (!detail.permissions.canReplyCrossover) {
        return NextResponse.json({ error: "You do not have permission to reply." }, { status: 403 });
      }
      await replyToCrossoverMessage(supabase, entityId, message, actor, "Reply");
      const refreshed = await loadNotificationDetail(supabase, id, user);
      return NextResponse.json({ ok: true, message: "Response sent.", detail: refreshed });
    }

    return NextResponse.json({ error: "Replies are not available for this notification type." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Response didn't send. Try again." }, { status: 400 });
  }
}
