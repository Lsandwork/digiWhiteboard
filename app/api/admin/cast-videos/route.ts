import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canManageCastVideoPush } from "@/lib/admin/permissions";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  clearCastVideoNotice,
  createCastVideoNotice,
  getCastVideoViewStats,
  listCastVideoNotices,
  loadCastVideoBoardState,
  pushCastVideoNotice,
  resolveCastVideoSignedUrls,
  updateCastVideoNotice
} from "@/lib/staff/cast-video-notices";
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

function canManageCastVideos(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  return canManageCastVideoPush(access, role);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage cast videos." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const [notices, boardState] = await Promise.all([
      listCastVideoNotices(supabase),
      loadCastVideoBoardState(supabase)
    ]);

    const resolvedNotices = await Promise.all(notices.map((notice) => resolveCastVideoSignedUrls(supabase, notice)));
    const statsEntries = await Promise.all(
      resolvedNotices
        .filter((notice) => notice.status !== "draft")
        .slice(0, 20)
        .map(async (notice) => [notice.id, await getCastVideoViewStats(supabase, notice.id)] as const)
    );

    return NextResponse.json({
      notices: resolvedNotices,
      activeNotice: boardState.activeNotice,
      queue: boardState.queue,
      stats: Object.fromEntries(statsEntries),
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? null,
        access
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cast videos.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage cast videos." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "create");
    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";

    if (action === "push" && body.id) {
      const notice = await pushCastVideoNotice(supabase, String(body.id), actor);
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
    }

    const asDraft = action === "draft" || action === "create";
    const notice = await createCastVideoNotice(supabase, body, actor, { asDraft });

    if (action === "create_and_push") {
      const pushed = await pushCastVideoNotice(supabase, notice.id, actor);
      const boardState = await loadCastVideoBoardState(supabase);
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId,
        actorEmail: session?.email,
        action: "staff.cast_video.push",
        targetType: "cast_video_notice",
        targetId: pushed.id,
        details: { title: pushed.title, priority: pushed.priority }
      });
      return NextResponse.json({ notice: pushed, ...boardState });
    }

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.cast_video.create",
      targetType: "cast_video_notice",
      targetId: notice.id,
      details: { title: notice.title, status: notice.status }
    });

    return NextResponse.json({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save cast video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage cast videos." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Cast video id is required." }, { status: 400 });

    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";
    const notice = await updateCastVideoNotice(supabase, id, body, actor);
    const resolved = await resolveCastVideoSignedUrls(supabase, notice);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.cast_video.update",
      targetType: "cast_video_notice",
      targetId: notice.id,
      details: { title: notice.title }
    });

    return NextResponse.json({ notice: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update cast video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canManageCastVideos(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to manage cast videos." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Cast video id is required." }, { status: 400 });

    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";
    const notice = await clearCastVideoNotice(supabase, id, actor);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.cast_video.clear",
      targetType: "cast_video_notice",
      targetId: notice.id,
      details: { title: notice.title }
    });

    const boardState = await loadCastVideoBoardState(supabase);
    return NextResponse.json({ notice, ...boardState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear cast video.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
