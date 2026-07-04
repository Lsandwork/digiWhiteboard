import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { validatePasswordStrength } from "@/lib/admin/password";
import { loadAdminSettings } from "@/lib/admin/settings";
import {
  AdminUserRole,
  changeAdminUserPassword,
  createAdminUser,
  listAdminUsers
} from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function canManageUsers(role?: string) {
  return role === "owner_admin" || role === "manager_admin" || !role;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const users = await listAdminUsers(getServiceSupabase());

  return NextResponse.json({
    users,
    currentUser: {
      email: session?.email ?? null,
      adminUserId: session?.adminUserId ?? null,
      role: session?.role ?? "owner_admin"
    }
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  if (!canManageUsers(session?.role)) {
    return NextResponse.json({ error: "You do not have permission to add users." }, { status: 403 });
  }

  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    role?: AdminUserRole;
    password?: string;
    confirm_password?: string;
    force_password_change?: boolean;
  };

  const full_name = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirm_password = String(body.confirm_password ?? "");
  const role = (body.role ?? "manager_admin") as AdminUserRole;

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: "Full name, email, and password are required." }, { status: 400 });
  }
  if (password !== confirm_password) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const adminSettings = await loadAdminSettings(getServiceSupabase());
  const validation = validatePasswordStrength(password, adminSettings.require_strong_passwords);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const user = await createAdminUser(supabase, {
      full_name,
      email,
      password,
      role,
      force_password_change: body.force_password_change ?? true,
      created_by: session?.adminUserId ?? null
    });

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "admin.user.create",
      targetType: "admin_user",
      targetId: user.id,
      details: { email: user.email, role: user.role }
    });

    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create admin user.";
    return NextResponse.json({ error: message.includes("duplicate") ? "That email is already in use." : message }, { status: 500 });
  }
}
