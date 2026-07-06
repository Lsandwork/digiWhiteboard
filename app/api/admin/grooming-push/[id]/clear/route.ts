import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { clearGroomingPushNotice, loadGroomingPushBoardState } from "@/lib/staff/grooming-push-notices";
import { getEffectiveDemoRole, isDemoSession } from "@/lib/demo/session";
import { clearDemoGroomingNotice, demoGroomingPushBoardState } from "@/lib/demo/store";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function canClear(access: Awaited<ReturnType<typeof getUserAccess>> | null, role?: string | null) {
  if (hasPermission(access, "clear_grooming_request")) return true;
  return role === "owner_admin" || role === "manager_admin" || role === "front_desk_coordinator" || role === "team_leader" || role === "groomer" || !role;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;
  const role = isDemoSession(session) ? getEffectiveDemoRole(session) : session?.role;

  if (!canClear(access, role)) {
    return NextResponse.json({ error: "You do not have permission to clear grooming push notices." }, { status: 403 });
  }

  const { id } = await context.params;
  const actor = session?.email ?? session?.adminUserId ?? "admin";

  try {
    if (isDemoSession(session)) {
      const sandbox = await clearDemoGroomingNotice(supabase, id);
      const notice = sandbox.grooming_notices.find((item) => item.id === id) ?? null;
      return NextResponse.json({ notice, ...demoGroomingPushBoardState(sandbox), demo: true });
    }

    const notice = await clearGroomingPushNotice(supabase, id, actor);
    const boardState = await loadGroomingPushBoardState(supabase);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.grooming_push.clear",
      targetType: "grooming_push_notice",
      targetId: notice.id,
      details: { dog_name: notice.dog_name }
    });

    return NextResponse.json({ notice, ...boardState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear grooming push notice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
