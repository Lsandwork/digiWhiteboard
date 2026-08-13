import {
  canAccessRouteGenerator,
  hasPermission,
  hasRole,
  type PermissionKey,
  type UserAccess
} from "@/lib/admin/permissions";
import type { RouteGeneratorPermission } from "@/lib/route-generator/flags";

export function canUseRouteGenerator(access: UserAccess | null | undefined): boolean {
  return canAccessRouteGenerator(access);
}

export function hasRoutePermission(
  access: UserAccess | null | undefined,
  permission: RouteGeneratorPermission
): boolean {
  if (!access || !canUseRouteGenerator(access)) return false;
  if (hasRole(access, "super_admin")) return true;

  if (permission === "route_generator.manage_settings") {
    return hasRole(access, "admin") || hasPermission(access, permission as PermissionKey);
  }

  return true;
}
