import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { validatePasswordStrength } from "@/lib/admin/password";
import { loadAdminSettings } from "@/lib/admin/settings";
import { changeAdminUserPassword, getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function canChangePassword(sessionRole: string | undefined, targetUserId: string, sessionUserId?: string) {
  if (sessionRole === "viewer") return sessionUserId === targetUserId;
  return sessionRole === "owner_admin" || sessionRole === "manager_admin" || !sessionRole;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const { id } = await context.params;

  if (!canChangePassword(session?.role, id, session?.adminUserId)) {
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

  const adminSettings = await loadAdminSettings(getServiceSupabase());
  const validation = validatePasswordStrength(password, adminSettings.require_strong_passwords);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await changeAdminUserPassword(supabase, id, password, body.force_password_change ?? false);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.user.password_change",
    targetType: "admin_user",
    targetId: id,
    details: { email: existing.email }
  });

  return NextResponse.json({ ok: true });
}
