import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canUseGroomingPush } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createGroomingPushNotice,
  loadGroomingPushBoardState,
  listRecentGroomingPushNotices
} from "@/lib/staff/grooming-push-notices";
import { getEffectiveDemoRole, isDemoSession } from "@/lib/demo/session";
import {
  applyDemoGroomingPushNotice,
  clearDemoGroomingNotice,
  demoGroomingPushBoardState,
  demoRecentGroomingNotices,
  getDemoSandbox
} from "@/lib/demo/store";
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

function canPush(access: Awaited<ReturnType<typeof actorAccess>>["access"], role?: string | null) {
  return canUseGroomingPush(access, role);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  const role = isDemoSession(session) ? getEffectiveDemoRole(session) : session?.role;
  if (!canPush(access, role)) {
    return NextResponse.json({ error: "You do not have permission to view grooming push notices." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();

    if (isDemoSession(session)) {
      const sandbox = await getDemoSandbox(supabase);
      const boardState = demoGroomingPushBoardState(sandbox);
      return NextResponse.json({
        ...boardState,
        recent: demoRecentGroomingNotices(sandbox),
        demo: true,
        currentUser: {
          email: session?.email ?? null,
          adminUserId: session?.adminUserId ?? null,
          role,
          access
        }
      });
    }

    const [boardState, recent] = await Promise.all([
      loadGroomingPushBoardState(supabase),
      listRecentGroomingPushNotices(supabase)
    ]);

    return NextResponse.json({
      ...boardState,
      recent,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: session?.role ?? null,
        access
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load grooming push notices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  const role = isDemoSession(session) ? getEffectiveDemoRole(session) : session?.role;
  if (!canPush(access, role)) {
    return NextResponse.json({ error: "You do not have permission to push grooming notices." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";

    if (isDemoSession(session)) {
      const result = await applyDemoGroomingPushNotice(supabase, body, actor);
      return NextResponse.json({
        notice: result.notice,
        activeNotice: result.activeNotice,
        queue: result.queue,
        demo: true
      });
    }

    const notice = await createGroomingPushNotice(supabase, body, actor);
    const boardState = await loadGroomingPushBoardState(supabase);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.grooming_push.create",
      targetType: "grooming_push_notice",
      targetId: notice.id,
      details: { dog_name: notice.dog_name, service: notice.service, groomer_name: notice.groomer_name }
    });

    return NextResponse.json({ notice, ...boardState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create grooming push notice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
