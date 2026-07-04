import { NextResponse } from "next/server";
import { canManagePushNotices, isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { deleteStaffPushNotice, pushStaffNoticeById, updateStaffPushNotice } from "@/lib/staff/push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function forbiddenResponse() {
  return NextResponse.json({ error: "You do not have permission to manage Push Notices." }, { status: 403 });
}

function actorFromRequest(request: Request) {
  const session = getAdminSessionFromRequest(request);
  return {
    session,
    actor: session?.email ?? session?.adminUserId ?? "admin"
  };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, actor } = actorFromRequest(request);
  if (!canManagePushNotices(session?.role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const notice = await updateStaffPushNotice(getServiceSupabase(), id, body, actor);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.push_notice.update",
      targetType: "staff_push_notice",
      targetId: notice.id,
      details: { title: notice.title, priority: notice.priority }
    });

    return NextResponse.json({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Push Notice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, actor } = actorFromRequest(request);
  if (!canManagePushNotices(session?.role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "push");
    if (action !== "push") {
      return NextResponse.json({ error: "Unsupported notice action." }, { status: 400 });
    }

    const notice = await pushStaffNoticeById(getServiceSupabase(), id, actor, body.expires_at);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.push_notice.push_again",
      targetType: "staff_push_notice",
      targetId: notice.id,
      details: { title: notice.title, priority: notice.priority }
    });

    return NextResponse.json({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to push notice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session } = actorFromRequest(request);
  if (!canManagePushNotices(session?.role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    await deleteStaffPushNotice(getServiceSupabase(), id);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.push_notice.delete",
      targetType: "staff_push_notice",
      targetId: id,
      details: {}
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete Push Notice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
