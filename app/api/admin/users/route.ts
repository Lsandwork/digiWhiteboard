import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { validatePasswordStrength } from "@/lib/admin/password";
import { canManageAdminUsers } from "@/lib/admin/permissions";
import { legacyRoleToRoleKey, type DepartmentKey, type RoleKey } from "@/lib/admin/permissions";
import { loadAdminSettings } from "@/lib/admin/settings";
import {
  getUserAccess,
  migrateLegacyUserAccess,
  roleKeyToLegacyRole,
  setUserAccess
} from "@/lib/admin/user-access";
import {
  AdminUserRole,
  changeAdminUserPassword,
  createAdminUser,
  listAdminUsers,
  normalizeAdminUserId
} from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseRoleKeys(values: unknown): RoleKey[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value).trim() as RoleKey)
    .filter(Boolean);
}

function parseDepartments(values: unknown): DepartmentKey[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value).trim() as DepartmentKey)
    .filter(Boolean);
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  await migrateLegacyUserAccess(supabase).catch(() => undefined);

  const users = await listAdminUsers(supabase);
  const enriched = await Promise.all(
    users.map(async (user) => ({
      ...user,
      access: await getUserAccess(supabase, user.id, user.role, user.email)
    }))
  );

  const actorAccess = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  return NextResponse.json({
    users: enriched,
    currentUser: {
      email: session?.email ?? null,
      adminUserId: session?.adminUserId ?? null,
      role: session?.role ?? "owner_admin",
      access: actorAccess
    }
  });
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const actorAccess = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canManageAdminUsers(actorAccess, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to add users." }, { status: 403 });
  }

  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    role?: AdminUserRole;
    primary_role?: RoleKey;
    additional_roles?: RoleKey[];
    departments?: DepartmentKey[];
    password?: string;
    confirm_password?: string;
    force_password_change?: boolean;
  };

  const full_name = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const confirm_password = String(body.confirm_password ?? "");

  const primaryRoleKey = body.primary_role ?? legacyRoleToRoleKey(body.role ?? "manager_admin");
  const legacyRole = roleKeyToLegacyRole(primaryRoleKey) as AdminUserRole;
  const additionalRoles = parseRoleKeys(body.additional_roles).filter((r) => r !== primaryRoleKey);
  const departments = parseDepartments(body.departments);

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: "Full name, email, and password are required." }, { status: 400 });
  }
  if (password !== confirm_password) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const adminSettings = await loadAdminSettings(supabase);
  const validation = validatePasswordStrength(password, adminSettings.require_strong_passwords);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  try {
    const user = await createAdminUser(supabase, {
      full_name,
      email,
      password,
      role: legacyRole,
      force_password_change: body.force_password_change ?? true,
      created_by: normalizeAdminUserId(session?.adminUserId)
    });

    await setUserAccess(supabase, user.id, {
      primaryRole: primaryRoleKey,
      roles: [primaryRoleKey, ...additionalRoles],
      departments
    });

    const access = await getUserAccess(supabase, user.id, user.role, user.email);

    await writeAdminAuditLog({
      actorAdminId: session?.adminUserId,
      actorEmail: session?.email,
      action: "admin.user.create",
      targetType: "admin_user",
      targetId: user.id,
      details: { email: user.email, role: user.role, roles: access.roles, departments }
    });

    return NextResponse.json({ user: { ...user, access } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create admin user.";
    return NextResponse.json({ error: message.includes("duplicate") ? "That email is already in use." : message }, { status: 500 });
  }
}
