import type { CommissionActor, CommissionViewer } from "./types";

export function isTrainerViewer(viewer: CommissionViewer) {
  return Boolean(viewer.isTrainerOnly);
}

export function assertCanView(viewer: CommissionViewer) {
  if (!viewer.adminUserId && !viewer.email && !viewer.canManage && !viewer.canComment) {
    // Session always has identity; empty means unauthorized at API already.
  }
}

export function assertCanManage(viewer: CommissionViewer) {
  if (!viewer.canManage) throw new Error("You do not have permission to manage package commissions.");
}

export function assertCanComment(viewer: CommissionViewer) {
  if (!viewer.canComment && !viewer.canManage) {
    throw new Error("You do not have permission to comment on package commissions.");
  }
}

export function assertSuperAdmin(viewer: CommissionViewer) {
  if (!viewer.isSuperAdmin) {
    throw new Error("Only Super Admin can perform this action.");
  }
}

export function assertNotManagementDestructive(viewer: CommissionViewer, action: string) {
  if (viewer.roleKey === "management" || viewer.role === "assistant_manager") {
    if (action === "delete" || action === "reopen_payroll" || action === "hard_archive") {
      throw new Error("Management cannot permanently delete records or reopen locked payroll periods.");
    }
  }
}

export function actorLabel(actor: CommissionActor) {
  return actor.name || actor.email || actor.adminUserId || "system";
}

export function trainerOwnsRecord(
  record: { trainer_user_id?: string | null; trainer_email?: string | null },
  viewer: CommissionViewer
) {
  if (viewer.adminUserId && record.trainer_user_id && viewer.adminUserId === record.trainer_user_id) {
    return true;
  }
  if (viewer.email && record.trainer_email) {
    return viewer.email.trim().toLowerCase() === record.trainer_email.trim().toLowerCase();
  }
  return false;
}
