import {
  hasPermission,
  isFullAdminLegacyRole,
  isMarketingLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";

function accessLooksLikeCastTvManager(access: UserAccess | null | undefined) {
  if (!access) return false;
  const roles = [access.primaryRole, ...(access.roles ?? [])];
  if (roles.includes("marketing") || roles.includes("super_admin") || roles.includes("admin")) {
    return true;
  }
  return hasPermission(access, "manage_cast_tv");
}

export function canManageCastTv(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (isFullAdminLegacyRole(legacyRole)) return true;
  if (isMarketingLegacyRole(legacyRole)) return true;
  return accessLooksLikeCastTvManager(access);
}
