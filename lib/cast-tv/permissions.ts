import {
  hasPermission,
  isFullAdminLegacyRole,
  isMarketingLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";

export function canManageCastTv(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (isFullAdminLegacyRole(legacyRole)) return true;
  if (hasPermission(access, "manage_cast_tv")) return true;
  return isMarketingLegacyRole(legacyRole);
}
