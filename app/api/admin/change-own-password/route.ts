import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminSessionCookieOptions,
  getAdminSessionFromRequest
} from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { validatePasswordStrength } from "@/lib/admin/password";
import { loadAdminSettings } from "@/lib/admin/settings";
import { changeAdminUserPassword, getAdminUserById } from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Authenticated users may always change their own password (temp password flow). */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) {
    return NextResponse.json({ error: "You must be signed in with a managed account to change your password." }, { status: 403 });
  }

  const body = (await request.json()) as {
    password?: string;
    confirm_password?: string;
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
  const existing = await getAdminUserById(supabase, session.adminUserId);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await changeAdminUserPassword(supabase, session.adminUserId, password, false);

  await writeAdminAuditLog({
    actorAdminId: session.adminUserId,
    actorEmail: session.email,
    action: "admin.user.password_change_self",
    targetType: "admin_user",
    targetId: session.adminUserId,
    details: { email: existing.email }
  });

  const token = createAdminSessionToken({
    email: session.email,
    adminUserId: session.adminUserId,
    role: existing.role,
    mustChangePassword: false
  });

  const response = NextResponse.json({ ok: true, role: existing.role });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
  return response;
}
