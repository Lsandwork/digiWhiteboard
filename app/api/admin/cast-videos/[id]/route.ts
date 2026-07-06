import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  clearCastVideoNotice,
  deleteCastVideoNotice,
  loadCastVideoBoardState,
  pushCastVideoNotice
} from "@/lib/staff/cast-video-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access };
}

function canManageCastVideos(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  if (hasPermission(access, "manage_cast_videos")) return true;
  return role === "owner_admin" || role === "manager_admin";
}

export async function POST(request: Request, context: RouteContext) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage cast videos." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "push");
    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";

    if (action === "delete") {
      const notice = await deleteCastVideoNotice(supabase, id, actor);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.cast_video.delete",
        targetType: "cast_video_notice",
        targetId: notice.id,
        details: { title: notice.title }
      });
      return NextResponse.json({ notice });
    }

    if (action === "clear") {
      const notice = await clearCastVideoNotice(supabase, id, actor);
      const boardState = await loadCastVideoBoardState(supabase);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.cast_video.clear",
        targetType: "cast_video_notice",
        targetId: notice.id,
        details: { title: notice.title }
      });
      return NextResponse.json({ notice, ...boardState });
    }

    const notice = await pushCastVideoNotice(supabase, id, actor);
    const boardState = await loadCastVideoBoardState(supabase);
    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.cast_video.push",
      targetType: "cast_video_notice",
      targetId: notice.id,
      details: { title: notice.title, priority: notice.priority }
    });
    return NextResponse.json({ notice, ...boardState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update cast video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
