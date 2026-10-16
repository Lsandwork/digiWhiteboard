import {
  accessFromLegacyRole,
  hasPermission,
  type PermissionKey,
  type UserAccess
} from "@/lib/admin/permissions";
import { isFullAdminRole } from "@/lib/admin/users";
import { isStaffOpsStatusClosed } from "@/lib/user-interactions/lifecycle";

export type UserInteractionsCapabilities = {
  canCreateNote: boolean;
  canReplyNote: boolean;
  canUpdateNote: boolean;
  canAssignNote: boolean;
  canCompleteNote: boolean;
  canCreateFollowUp: boolean;
  canUpdateFollowUp: boolean;
  canAssignFollowUp: boolean;
  canCompleteFollowUp: boolean;
  canCreateIssue: boolean;
  canUpdateIssue: boolean;
  canAssignIssue: boolean;
  canCompleteIssue: boolean;
};

export class StaffOpsAuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "StaffOpsAuthorizationError";
  }
}

export class StaffOpsConflictError extends Error {
  constructor(message = "This record was updated by someone else. Refresh and try again.") {
    super(message);
    this.name = "StaffOpsConflictError";
  }
}

/** Atomic compare-and-swap RPC (migration 076) is required but not available on this database. */
export class StaffOpsAtomicSaveUnavailableError extends Error {
  constructor(
    message = "Staff Operations cannot save safely: apply database migration 076 (patch_admin_settings_json_if_revision) before writing."
  ) {
    super(message);
    this.name = "StaffOpsAtomicSaveUnavailableError";
  }
}

/** Client-sent revision from User Interactions (optional for backward-compatible callers). */
export function parseStaffOpsRevision(body: Record<string, unknown>): number | undefined {
  const raw = body.staff_ops_revision;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.floor(parsed);
}

function elevated(access: UserAccess, role: string | null | undefined): boolean {
  return isFullAdminRole(role);
}

function allowed(access: UserAccess, role: string | null | undefined, permission: PermissionKey): boolean {
  if (elevated(access, role)) return true;
  return hasPermission(access, permission);
}

export function buildUserInteractionsCapabilities(
  access: UserAccess,
  role: string | null | undefined
): UserInteractionsCapabilities {
  const canCreateNote =
    allowed(access, role, "create_front_desk_log") || allowed(access, role, "create_trainer_entry");
  const canEditNote = allowed(access, role, "edit_front_desk_log");
  const canAssignNote = allowed(access, role, "assign_front_desk_log") || canEditNote;
  const canResolveNote = allowed(access, role, "resolve_front_desk_log") || canEditNote;

  const canCreateFollowUp = allowed(access, role, "create_owner_follow_up");
  const canEditFollowUp = allowed(access, role, "edit_owner_follow_up");
  const canAssignFollowUp = allowed(access, role, "assign_owner_follow_up") || canEditFollowUp;
  const canResolveFollowUp = allowed(access, role, "resolve_owner_follow_up") || canEditFollowUp;

  const canCreateIssue = allowed(access, role, "create_active_issue");
  const canEditIssue = allowed(access, role, "edit_active_issue");
  const canAssignIssue = allowed(access, role, "assign_active_issue") || canEditIssue;
  const canResolveIssue = allowed(access, role, "resolve_active_issue") || canEditIssue;

  return {
    canCreateNote,
    canReplyNote: canCreateNote || canEditNote,
    canUpdateNote: canEditNote,
    canAssignNote,
    canCompleteNote: canResolveNote,
    canCreateFollowUp,
    canUpdateFollowUp: canEditFollowUp,
    canAssignFollowUp,
    canCompleteFollowUp: canResolveFollowUp,
    canCreateIssue,
    canUpdateIssue: canEditIssue,
    canAssignIssue,
    canCompleteIssue: canResolveIssue
  };
}

function patchAssignsOnly(patch: Record<string, unknown>): boolean {
  const keys = Object.keys(patch).filter((k) => k !== "action" && k !== "id" && k !== "staff_ops_revision");
  return keys.length > 0 && keys.every((k) => k === "assigned_to" || k === "assigned_team");
}

function patchStatusValue(patch: Record<string, unknown>): string | null {
  if (patch.status === undefined || patch.status === null) return null;
  return String(patch.status).trim();
}

function patchClosesStatus(status: string | null): boolean {
  if (!status) return false;
  return isStaffOpsStatusClosed(status);
}

export function assertStaffOpsPostAuthorized(
  access: UserAccess,
  role: string | null | undefined,
  action: string,
  body: Record<string, unknown>
): void {
  const caps = buildUserInteractionsCapabilities(access, role);

  switch (action) {
    case "create_crossover":
    case "create_crossover_bulk":
      if (!caps.canCreateNote) throw new StaffOpsAuthorizationError();
      return;
    case "reply_crossover":
      if (!caps.canReplyNote) throw new StaffOpsAuthorizationError();
      return;
    case "update_crossover":
    case "move_crossover":
    case "bulk_update_crossover":
    case "delete_crossover": {
      if (action === "delete_crossover" && !caps.canUpdateNote) throw new StaffOpsAuthorizationError();
      const status = patchStatusValue(body);
      if (patchAssignsOnly(body)) {
        if (!caps.canAssignNote) throw new StaffOpsAuthorizationError();
        return;
      }
      if (status && patchClosesStatus(status)) {
        if (!caps.canCompleteNote) throw new StaffOpsAuthorizationError();
        return;
      }
      if (!caps.canUpdateNote) throw new StaffOpsAuthorizationError();
      return;
    }
    case "reopen_crossover":
      if (!caps.canUpdateNote) throw new StaffOpsAuthorizationError();
      return;
    case "create_follow_up":
      if (!caps.canCreateFollowUp) throw new StaffOpsAuthorizationError();
      return;
    case "update_follow_up": {
      const status = patchStatusValue(body);
      if (patchAssignsOnly(body)) {
        if (!caps.canAssignFollowUp) throw new StaffOpsAuthorizationError();
        return;
      }
      if (status && patchClosesStatus(status)) {
        if (!caps.canCompleteFollowUp) throw new StaffOpsAuthorizationError();
        return;
      }
      if (!caps.canUpdateFollowUp) throw new StaffOpsAuthorizationError();
      return;
    }
    case "create_issue":
      if (!caps.canCreateIssue) throw new StaffOpsAuthorizationError();
      return;
    case "update_issue": {
      const status = patchStatusValue(body);
      if (patchAssignsOnly(body)) {
        if (!caps.canAssignIssue) throw new StaffOpsAuthorizationError();
        return;
      }
      if (status && patchClosesStatus(status)) {
        if (!caps.canCompleteIssue) throw new StaffOpsAuthorizationError();
        return;
      }
      if (!caps.canUpdateIssue) throw new StaffOpsAuthorizationError();
      return;
    }
    default:
      return;
  }
}

export function accessForStaffOpsSession(
  adminUserId: string | null | undefined,
  email: string | null | undefined,
  role: string | null | undefined
): UserAccess {
  return accessFromLegacyRole(adminUserId ?? null, email ?? null, role);
}
