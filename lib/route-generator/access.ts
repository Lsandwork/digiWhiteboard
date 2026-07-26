import {
  hasPermission,
  hasRole,
  type PermissionKey,
  type UserAccess
} from "@/lib/admin/permissions";
import type { RouteGeneratorPermission } from "@/lib/route-generator/flags";

export function canUseRouteGenerator(access: UserAccess | null | undefined): boolean {
  if (!access) return false;
  if (hasRole(access, "super_admin") || hasRole(access, "admin") || hasRole(access, "management")) {
    return true;
  }
  return hasPermission(access, "route_generator.view" as PermissionKey);
}

export function hasRoutePermission(
  access: UserAccess | null | undefined,
  permission: RouteGeneratorPermission
): boolean {
  if (!access) return false;
  if (hasRole(access, "super_admin")) return true;

  if (hasRole(access, "admin")) {
    // Admin: all route permissions; integration secrets still gated by configure_integrations elsewhere.
    return (
      hasPermission(access, permission as PermissionKey) ||
      hasPermission(access, "route_generator.view" as PermissionKey)
    );
  }

  if (hasRole(access, "management")) {
    const allowed: RouteGeneratorPermission[] = [
      "route_generator.view",
      "route_generator.pull_report",
      "route_generator.generate",
      "route_generator.edit",
      "route_generator.approve",
      "route_generator.export",
      "route_generator.view_audit"
    ];
    return allowed.includes(permission);
  }

  return hasPermission(access, permission as PermissionKey);
}
