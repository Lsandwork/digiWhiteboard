import {
  hasPermission,
  isAdminOrManagementLegacyRole,
  isFullAdminLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";

export function canViewPackProTraining(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (isFullAdminLegacyRole(legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  return hasPermission(access, "view_pack_pro_training");
}

export function canManagePackProTraining(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (isFullAdminLegacyRole(legacyRole) || isAdminOrManagementLegacyRole(legacyRole)) return true;
  return hasPermission(access, "manage_pack_pro_training");
}
