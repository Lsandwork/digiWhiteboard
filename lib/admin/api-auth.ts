import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { canCreateFrontDeskLogForRole } from "@/lib/admin/permissions";
import {
  canAccessCrossoverCommunication,
  canAccessFrontDeskLog,
  canAccessPushNotices,
  canCreateDogHandlerComplaintNotice,
  canManageStaffDirectory,
  canSubmitWriteUp as userCanSubmitWriteUp,
  canViewManagementReports,
  canViewOwnWriteUps as userCanViewOwnWriteUps,
  canViewStaffDirectory,
  hasCoordinatorAccess
} from "@/lib/admin/users";

export function isAdminRequest(request: Request) {
  if (getAdminSessionFromRequest(request)) return true;

  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  const headerPassword = request.headers.get("x-admin-password")?.trim();
  return Boolean(legacyPassword && headerPassword && headerPassword === legacyPassword);
}

export function unauthorizedAdminResponse(body: Record<string, unknown> = { error: "Unauthorized." }) {
  return Response.json(body, { status: 401 });
}

export function canManagePushNotices(role?: string | null) {
  return canAccessPushNotices(role) || !role;
}

export function canManageStaffOperations(role?: string | null) {
  return role === "owner_admin" || role === "manager_admin" || hasCoordinatorAccess(role) || !role;
}

export function canManageWhiteboardAdmin(role?: string | null) {
  return canManageStaffOperations(role);
}

export function canCreatePushNotice(role?: string | null) {
  return canManagePushNotices(role);
}

export function canManageCrossover(role?: string | null) {
  return canAccessFrontDeskLog(role);
}

export function canManageOwnerFollowUp(role?: string | null) {
  return canManageStaffOperations(role);
}

export function canManageActiveIssues(role?: string | null) {
  return canManageStaffOperations(role);
}

export function canPushDogHandlerComplaintNotice(role?: string | null) {
  return canCreateDogHandlerComplaintNotice(role) || !role;
}

export function canCreateFrontDeskLog(role?: string | null) {
  return canCreateFrontDeskLogForRole(role) || !role;
}

export function canPushGroomingRequest(role?: string | null) {
  return role === "owner_admin" || role === "manager_admin" || role === "front_desk_coordinator" || role === "team_leader" || role === "groomer" || !role;
}

export function canClearGroomingRequest(role?: string | null) {
  return canPushGroomingRequest(role);
}

export function canAccessManagementReports(role?: string | null) {
  return canViewManagementReports(role) || !role;
}

export function canSubmitWriteUp(role?: string | null) {
  return userCanSubmitWriteUp(role) || !role;
}

export function canViewOwnWriteUps(role?: string | null) {
  return userCanViewOwnWriteUps(role) || !role;
}

export { canAccessCrossoverCommunication, canAccessFrontDeskLog, canAccessPushNotices, canViewStaffDirectory, canManageStaffDirectory };
