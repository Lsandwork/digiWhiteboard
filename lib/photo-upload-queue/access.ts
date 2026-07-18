import {
  accessFromLegacyRole,
  hasPermission,
  isDogHandlerLegacyRole,
  isFullAdminLegacyRole,
  isMarketingLegacyRole,
  isSuperAdminLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";

function isManagementLikeRole(role?: string | null) {
  return role === "assistant_manager" || role === "management";
}

export function canAccessPhotoUploadQueue(
  access: UserAccess | null | undefined,
  role?: string | null
) {
  const effective = access ?? accessFromLegacyRole(null, null, role);
  if (hasPermission(effective, "manage_photo_upload_queue")) return true;
  if (hasPermission(effective, "view_admin_panel")) {
    return (
      isFullAdminLegacyRole(role) ||
      isManagementLikeRole(role) ||
      isMarketingLegacyRole(role) ||
      isDogHandlerLegacyRole(role) ||
      isSuperAdminLegacyRole(role)
    );
  }
  return false;
}

export function canReopenPhotoUploadBatch(
  access: UserAccess | null | undefined,
  role?: string | null
) {
  const effective = access ?? accessFromLegacyRole(null, null, role);
  return hasPermission(effective, "reopen_photo_upload_batches") || isSuperAdminLegacyRole(role);
}

export function canManagePhotoUploadSettings(
  access: UserAccess | null | undefined,
  role?: string | null
) {
  const effective = access ?? accessFromLegacyRole(null, null, role);
  return hasPermission(effective, "manage_photo_upload_settings") || isSuperAdminLegacyRole(role);
}

export function canEditCompletedPhotoBatch(
  access: UserAccess | null | undefined,
  role?: string | null
) {
  return canReopenPhotoUploadBatch(access, role);
}
