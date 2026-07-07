import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import { loadCastVideoBoardState } from "@/lib/staff/cast-video-notices";
import {
  clearYardPushNotice,
  getActiveYardPushNotice,
  pushYardNotice,
  type YardPushSide,
  YARD_PUSH_SIDE_OPTIONS
} from "@/lib/staff/yard-push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function actorAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  return { session, access };
}

function canPushYardNotice(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  if (hasPermission(access, "push_yard_notice")) return true;
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "management" ||
    role === "front_desk_coordinator" ||
    role === "team_leader"
  );
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canPushYardNotice(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage yard push notices." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const [activeNotice, boardState] = await Promise.all([
      getActiveYardPushNotice(supabase),
      loadCastVideoBoardState(supabase, { department: "staff_whiteboard" })
    ]);

    return NextResponse.json({
      activeNotice,
      boardActiveNotice: boardState.activeNotice,
      sides: YARD_PUSH_SIDE_OPTIONS,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? null,
        access
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load yard push notices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canPushYardNotice(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to push yard notices." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as { action?: unknown; side?: unknown };
    const action = String(body.action ?? "");
    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";

    if (action === "clear") {
      const notice = await clearYardPushNotice(supabase, actor);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.yard_push.clear",
        targetType: "cast_video_notice",
        targetId: notice.id,
        details: { title: notice.title }
      });
      const boardState = await loadCastVideoBoardState(supabase, { department: "staff_whiteboard" });
      return NextResponse.json({ ok: true, notice: null, cleared: notice, ...boardState });
    }

    const side = String(body.side ?? "") as YardPushSide;
    if (side !== "large_side" && side !== "small_side") {
      return NextResponse.json({ error: "Choose Large Side or Small Side before pushing." }, { status: 400 });
    }

    const notice = await pushYardNotice(supabase, side, actor);
    const boardState = await loadCastVideoBoardState(supabase, { department: "staff_whiteboard" });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.yard_push.push",
      targetType: "cast_video_notice",
      targetId: notice.id,
      details: { title: notice.title, side }
    });

    return NextResponse.json({
      ok: true,
      notice,
      message: "Yard camera pushed to the Staff Digital Whiteboard.",
      ...boardState
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to push yard notice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
