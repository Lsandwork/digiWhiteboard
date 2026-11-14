import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { revokeAdminSessionsForUser } from "@/lib/admin/session-revocation";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { validatePasswordStrength } from "@/lib/admin/password";
import { canChangeAdminUserPassword } from "@/lib/admin/permissions";
import { loadAdminSettings } from "@/lib/admin/settings";
import { actorCanManageTarget } from "@/lib/admin/super-admin-guards";
import { getUserAccess } from "@/lib/admin/user-access";
import { changeAdminUserPassword, getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const { id } = await context.params;
  const supabase = getServiceSupabase();
  const actorAccess = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canChangeAdminUserPassword(actorAccess, session?.role, id, session?.adminUserId)) {
    return NextResponse.json({ error: "You do not have permission to change this password." }, { status: 403 });
  }

  const body = (await request.json()) as {
    password?: string;
    confirm_password?: string;
    force_password_change?: boolean;
  };

  const password = String(body.password ?? "");
  const confirm_password = String(body.confirm_password ?? "");
  if (!password || password !== confirm_password) {
    return NextResponse.json({ error: "Passwords must match." }, { status: 400 });
  }

  const adminSettings = await loadAdminSettings(supabase);
  const validation = validatePasswordStrength(password, adminSettings.require_strong_passwords);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const isSelf = session?.adminUserId === id;
  if (!isSelf) {
    if (session?.impersonatorEmail) {
      return NextResponse.json({ error: "Return to your own account before resetting passwords." }, { status: 403 });
    }
    const targetAccess = await getUserAccess(supabase, id, existing.role, existing.email);
    if (!actorCanManageTarget(session?.role, actorAccess, existing.role, targetAccess)) {
      return NextResponse.json({ error: "Only Super Admin can change a Super Admin password." }, { status: 403 });
    }
  } else if (session?.impersonatorEmail) {
    return NextResponse.json({ error: "Passwords cannot be changed while logged in as another employee." }, { status: 403 });
  }
  await changeAdminUserPassword(supabase, id, password, isSelf ? false : (body.force_password_change ?? false));

  // Admin resets must kill the target's existing sessions; self-change issues a fresh cookie elsewhere.
  if (!isSelf) {
    revokeAdminSessionsForUser(id);
  }

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: isSelf ? "admin.user.password_change_self" : "admin.user.password_change",
    targetType: "admin_user",
    targetId: id,
    details: { email: existing.email }
  });

  return NextResponse.json({ ok: true, role: existing.role });
}
