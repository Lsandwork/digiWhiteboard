import {
  accessFromLegacyRole,
  hasPermission,
  isDogHandlerLegacyRole,
  isFrontDeskCoordinatorLegacyRole,
  isFullAdminLegacyRole,
  isMarketingLegacyRole,
  isSuperAdminLegacyRole,
  isTeamLeaderLegacyRole,
  type UserAccess
} from "@/lib/admin/permissions";

function isManagementLikeRole(role?: string | null) {
  return role === "assistant_manager" || role === "management";
}

/** Upload + view for anyone with Bulk Photo Upload access. */
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
      isTeamLeaderLegacyRole(role) ||
      isFrontDeskCoordinatorLegacyRole(role) ||
      isSuperAdminLegacyRole(role)
    );
  }
  return false;
}

/**
 * Download one-by-one or in bulk:
 * Team Leads, Front Desk Coordinators, Super Admins, Admins, Management.
 */
export function canDownloadPhotoUploads(
  access: UserAccess | null | undefined,
  role?: string | null
) {
  if (
    isSuperAdminLegacyRole(role) ||
    isFullAdminLegacyRole(role) ||
    isManagementLikeRole(role) ||
    isTeamLeaderLegacyRole(role) ||
    isFrontDeskCoordinatorLegacyRole(role)
  ) {
    return true;
  }
  const effective = access ?? accessFromLegacyRole(null, null, role);
  return hasPermission(effective, "download_photo_uploads");
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
