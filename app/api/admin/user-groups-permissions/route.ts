import { NextResponse } from "next/server";
import { isAdminRequest, unauthorizedAdminResponse } from "@/lib/admin/api-auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  ALL_CATALOG_PERMISSION_KEYS,
  MATRIX_ROLE_KEYS,
  PERMISSION_CATEGORIES
} from "@/lib/admin/permission-catalog";
import type { PermissionKey, RoleKey } from "@/lib/admin/permissions";
import {
  buildDefaultRolePermissionMatrix,
  isPermissionLockedForRole,
  loadRolePermissionMatrix,
  saveRolePermissionMatrix,
  setCategoryPermissionsForRole,
  setRolePermission
} from "@/lib/admin/role-permission-matrix";
import { requireSuperAdmin } from "@/lib/auth/permissions";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const gate = await requireSuperAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = getServiceSupabase();
  const matrix = await loadRolePermissionMatrix(supabase);

  return NextResponse.json({
    categories: PERMISSION_CATEGORIES,
    roles: MATRIX_ROLE_KEYS,
    matrix,
    locked: Object.fromEntries(
      MATRIX_ROLE_KEYS.flatMap((role) =>
        ALL_CATALOG_PERMISSION_KEYS.map((permission) => [
          `${role}:${permission}`,
          isPermissionLockedForRole(role, permission)
        ])
      )
    )
  });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();

  const gate = await requireSuperAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = (await request.json()) as {
    role?: RoleKey;
    permission?: PermissionKey;
    enabled?: boolean;
    categoryPermissions?: PermissionKey[];
    bulk?: boolean;
    resetDefaults?: boolean;
  };

  const supabase = getServiceSupabase();
  const session = gate.session;

  try {
    if (body.resetDefaults) {
      const matrix = buildDefaultRolePermissionMatrix();
      await saveRolePermissionMatrix(supabase, matrix);
      await writeAdminAuditLog({
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        action: "rbac.matrix.reset_defaults",
        targetType: "role_permission_matrix",
        details: {}
      });
      return NextResponse.json({ matrix, ok: true });
    }

    const role = body.role;
    if (!role) {
      return NextResponse.json({ error: "Role is required." }, { status: 400 });
    }

    if (body.bulk && Array.isArray(body.categoryPermissions)) {
      const matrix = await setCategoryPermissionsForRole(
        supabase,
        role,
        body.categoryPermissions,
        Boolean(body.enabled)
      );
      await writeAdminAuditLog({
        actorAdminId: session.adminUserId,
        actorEmail: session.email,
        action: "rbac.matrix.bulk_update",
        targetType: "role",
        targetId: role,
        details: {
          permissions: body.categoryPermissions,
          enabled: Boolean(body.enabled)
        }
      });
      return NextResponse.json({ matrix, ok: true });
    }

    const permission = body.permission;
    if (!permission) {
      return NextResponse.json({ error: "Permission is required." }, { status: 400 });
    }

    const before = await loadRolePermissionMatrix(supabase);
    const oldValue = Boolean(before[role]?.[permission]);
    const matrix = await setRolePermission(supabase, role, permission, Boolean(body.enabled));

    await writeAdminAuditLog({
      actorAdminId: session.adminUserId,
      actorEmail: session.email,
      action: "rbac.permission.update",
      targetType: "role_permission",
      targetId: `${role}:${permission}`,
      details: {
        role,
        permission,
        old_value: oldValue,
        new_value: Boolean(body.enabled)
      }
    });

    return NextResponse.json({ matrix, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update permission.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
