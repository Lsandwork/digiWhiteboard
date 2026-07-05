import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import {
  createGroomingPushNotice,
  loadGroomingDogOptions,
  loadGroomingPushBoardState,
  listRecentGroomingPushNotices
} from "@/lib/staff/grooming-push-notices";
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
  if (hasPermission(access, "push_grooming_request")) return true;
  return role === "owner_admin" || role === "manager_admin" || role === "front_desk_coordinator" || role === "team_leader" || role === "groomer" || !role;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const { session, access } = await actorAccess(request);
  if (!canPush(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to view grooming push notices." }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    const [boardState, recent, dogs] = await Promise.all([
      loadGroomingPushBoardState(supabase),
      listRecentGroomingPushNotices(supabase),
      loadGroomingDogOptions(supabase)
    ]);

    return NextResponse.json({
      ...boardState,
      recent,
      dogs,
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
  if (!canPush(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to push grooming notices." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const actor = session?.email ?? session?.adminUserId ?? "admin";
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
