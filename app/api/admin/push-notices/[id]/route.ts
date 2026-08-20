import { NextResponse } from "next/server";
import {
  getEffectiveAdminRole,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { accessFromLegacyRole, canUseStandardOrEmergencyPush } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { deleteStaffPushNotice, pushStaffNoticeById, updateStaffPushNotice } from "@/lib/staff/push-notices";
import { getEffectiveDemoRole, isDemoSession } from "@/lib/demo/session";
import { pushDemoStaffNoticeAgain, removeDemoStaffPushNotice, updateDemoStaffPushNotice } from "@/lib/demo/store";
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

async function actorContext(request: Request) {
  const { session, actor } = actorFromRequest(request);
  const supabase = getServiceSupabase();
  const effectiveRole = isDemoSession(session) ? getEffectiveDemoRole(session) : getEffectiveAdminRole(request);
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, effectiveRole, session.email)
    : effectiveRole
      ? accessFromLegacyRole(null, null, effectiveRole)
      : null;
  return { session, actor, access, role: effectiveRole };
}

function canManagePushNotices(
  access: Awaited<ReturnType<typeof actorContext>>["access"],
  role?: string | null
) {
  return canUseStandardOrEmergencyPush(access, role);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, actor, access, role } = await actorContext(request);
  if (!canManagePushNotices(access, role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();

    if (isDemoSession(session)) {
      const result = await updateDemoStaffPushNotice(supabase, id, body, actor);
      return NextResponse.json({ notice: result.notice, demo: true });
    }

    const notice = await updateStaffPushNotice(supabase, id, body, actor);
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

  const { session, actor, access, role } = await actorContext(request);
  if (!canManagePushNotices(access, role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "push");
    if (action !== "push") {
      return NextResponse.json({ error: "Unsupported notice action." }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    if (isDemoSession(session)) {
      const result = await pushDemoStaffNoticeAgain(supabase, id, actor);
      return NextResponse.json({ notice: result.notice, demo: true });
    }

    const notice = await pushStaffNoticeById(supabase, id, actor, body.expires_at);
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

  const { session, access, role } = await actorContext(request);
  if (!canManagePushNotices(access, role)) return forbiddenResponse();

  const { id } = await context.params;

  try {
    const supabase = getServiceSupabase();

    if (isDemoSession(session)) {
      await removeDemoStaffPushNotice(supabase, id);
      return NextResponse.json({ ok: true, demo: true });
    }

    await deleteStaffPushNotice(supabase, id);
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
