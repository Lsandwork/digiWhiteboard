import { getAdminSessionFromRequest } from "@/lib/admin/session";
import {
  hasAnyPermission,
  hasPermission,
  isSuperAdminAccess,
  isSuperAdminLegacyRole,
  type PermissionKey,
  type UserAccess
} from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { getServiceSupabase } from "@/lib/supabase/server";

export type { PermissionKey, UserAccess };

export async function getUserPermissions(userId: string | null | undefined, legacyRole?: string | null, email?: string | null) {
  const supabase = getServiceSupabase();
  const access = await getUserAccess(supabase, userId, legacyRole, email);
  return access.permissions;
}

export async function hasPermissionForUser(
  userId: string | null | undefined,
  permissionKey: PermissionKey,
  legacyRole?: string | null,
  email?: string | null
) {
  const permissions = await getUserPermissions(userId, legacyRole, email);
  return permissions.includes(permissionKey);
}

export async function hasAnyPermissionForUser(
  userId: string | null | undefined,
  permissionKeys: PermissionKey[],
  legacyRole?: string | null,
  email?: string | null
) {
  const permissions = await getUserPermissions(userId, legacyRole, email);
  return permissionKeys.some((key) => permissions.includes(key));
}

export async function getRequestUserAccess(request: Request): Promise<UserAccess | null> {
  const session = getAdminSessionFromRequest(request);
  if (!session?.adminUserId) return null;
  const supabase = getServiceSupabase();
  return getUserAccess(supabase, session.adminUserId, session.role, session.email);
}

export async function requirePermission(request: Request, permissionKey: PermissionKey) {
  const access = await getRequestUserAccess(request);
  if (!access || !hasPermission(access, permissionKey)) {
    return { ok: false as const, status: 403, error: "You do not have permission to perform this action." };
  }
  return { ok: true as const, access };
}

export async function requireSuperAdmin(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return { ok: false as const, status: 401, error: "Unauthorized." };
  }
  const access = await getRequestUserAccess(request);
  if (!isSuperAdminLegacyRole(session.role) && !isSuperAdminAccess(access)) {
    return { ok: false as const, status: 403, error: "Only Super Admin can access this resource." };
  }
  return { ok: true as const, access, session };
}

export function canAccessRoute(access: UserAccess | null | undefined, route: string, legacyRole?: string | null) {
  if (route.startsWith("/admin/settings/user-groups-permissions")) {
    return isSuperAdminLegacyRole(legacyRole) || isSuperAdminAccess(access);
  }
  if (route.includes("tab=integrations") || route.endsWith("/integrations")) {
    return hasAnyPermission(access, ["view_integrations", "view_integration_status", "configure_integrations"]);
  }
  return hasPermission(access, "view_admin_panel");
}
