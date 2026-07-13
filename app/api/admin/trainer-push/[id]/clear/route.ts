import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canClearTrainerPush } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { clearTrainerPushNotice, loadTrainerPushBoardState } from "@/lib/staff/trainer-push-notices";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function canClear(access: Awaited<ReturnType<typeof getUserAccess>> | null, role?: string | null) {
  return canClearTrainerPush(access, role);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canClear(access, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to clear trainer push notices." }, { status: 403 });
  }

  const { id } = await context.params;
  const actor = session?.email ?? session?.adminUserId ?? "admin";

  try {
    const notice = await clearTrainerPushNotice(supabase, id, actor);
    const boardState = await loadTrainerPushBoardState(supabase);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "staff.trainer_push.clear",
      targetType: "trainer_push_notice",
      targetId: notice.id,
      details: { dog_name: notice.dog_name }
    });

    return NextResponse.json({ notice, ...boardState });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear trainer push notice.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
