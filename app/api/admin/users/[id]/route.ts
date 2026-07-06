import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { canManageAdminUsers } from "@/lib/admin/permissions";
import { legacyRoleToRoleKey, type DepartmentKey, type RoleKey } from "@/lib/admin/permissions";
import { assertUserMutationAllowed } from "@/lib/admin/super-admin-guards";
import { getUserAccess, roleKeyToLegacyRole, setUserAccess } from "@/lib/admin/user-access";
import {
  AdminUserRole,
  deleteAdminUser,
  getAdminUserById,
  updateAdminUser
} from "@/lib/admin/users";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function parseRoleKeys(values: unknown): RoleKey[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim() as RoleKey).filter(Boolean);
}

function parseDepartments(values: unknown): DepartmentKey[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value).trim() as DepartmentKey).filter(Boolean);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const actorAccess = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canManageAdminUsers(actorAccess, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to edit users." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    full_name?: string;
    email?: string;
    role?: AdminUserRole;
    primary_role?: RoleKey;
    additional_roles?: RoleKey[];
    departments?: DepartmentKey[];
    status?: "active" | "disabled";
    force_password_change?: boolean;
  };

  if (session?.adminUserId === id && body.status === "disabled") {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const existingAccess = await getUserAccess(supabase, id, existing.role, existing.email);
  const primaryRoleKey = body.primary_role ?? (body.role ? legacyRoleToRoleKey(body.role) : legacyRoleToRoleKey(existing.role));

  try {
    await assertUserMutationAllowed({
      supabase,
      actorLegacyRole: session?.role,
      actorAccess,
      targetUserId: id,
      targetLegacyRole: existing.role,
      targetAccess: existingAccess,
      nextPrimaryRole: body.primary_role ? primaryRoleKey : undefined,
      nextStatus: body.status,
      action: body.status === "disabled" ? "disable" : "update"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Not allowed." }, { status: 403 });
  }

  const legacyRole = roleKeyToLegacyRole(primaryRoleKey) as AdminUserRole;

  const user = await updateAdminUser(supabase, id, {
    full_name: body.full_name != null ? String(body.full_name).trim() : undefined,
    email: body.email != null ? String(body.email).trim().toLowerCase() : undefined,
    role: body.role ?? body.primary_role ? legacyRole : undefined,
    status: body.status,
    force_password_change: body.force_password_change
  });

  if (body.primary_role || body.additional_roles || body.departments) {
    const additionalRoles = parseRoleKeys(body.additional_roles).filter((r) => r !== primaryRoleKey);
    const departments = body.departments ? parseDepartments(body.departments) : (await getUserAccess(supabase, id, user.role, user.email)).departments;
    await setUserAccess(supabase, id, {
      primaryRole: primaryRoleKey,
      roles: [primaryRoleKey, ...additionalRoles],
      departments
    });
  }

  const access = await getUserAccess(supabase, id, user.role, user.email);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: body.status === "disabled" ? "admin.user.disable" : "admin.user.update",
    targetType: "admin_user",
    targetId: id,
    details: { ...body, roles: access.roles, departments: access.departments }
  });

  return NextResponse.json({ user: { ...user, access } });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const session = getAdminSessionFromRequest(request);
  const supabase = getServiceSupabase();
  const actorAccess = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

  if (!canManageAdminUsers(actorAccess, session?.role)) {
    return NextResponse.json({ error: "You do not have permission to delete users." }, { status: 403 });
  }

  const { id } = await context.params;
  if (session?.adminUserId === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const existing = await getAdminUserById(supabase, id);
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const existingAccess = await getUserAccess(supabase, id, existing.role, existing.email);
  try {
    await assertUserMutationAllowed({
      supabase,
      actorLegacyRole: session?.role,
      actorAccess,
      targetUserId: id,
      targetLegacyRole: existing.role,
      targetAccess: existingAccess,
      action: "delete"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Not allowed." }, { status: 403 });
  }

  await deleteAdminUser(supabase, id);

  await writeAdminAuditLog({
    actorAdminId: session?.adminUserId,
    actorEmail: session?.email,
    action: "admin.user.delete",
    targetType: "admin_user",
    targetId: id,
    details: { email: existing.email }
  });

  return NextResponse.json({ ok: true });
}
