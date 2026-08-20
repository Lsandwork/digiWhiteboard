import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { demoWriteBlockedMessage, isDemoSession } from "@/lib/demo/session";
import { NextResponse } from "next/server";
import {
  canCreateFrontDeskLogForRole,
  canEditFrontDeskLogForRole,
  canAccessHrPanelsForUser,
  canReviewManagementSupportForUser,
  canReviewWriteUpsForUser,
  canSubmitWriteUpForUser,
  canUseStandardOrEmergencyPush,
  type UserAccess
} from "@/lib/admin/permissions";
import {
  canAccessCrossoverCommunication,
  canAccessFrontDeskLog,
  canAccessPushNotices,
  canCreateDogHandlerComplaintNotice,
  canManageStaffDirectory,
  canSubmitWriteUp as userCanSubmitWriteUp,
  canSubmitGroomerComplaint as userCanSubmitGroomerComplaint,
  canSubmitTrainerComplaint as userCanSubmitTrainerComplaint,
  canCreateTrainerEntry as userCanCreateTrainerEntry,
  canViewManagementReports,
  canViewOwnGroomerSubmissions as userCanViewOwnGroomerSubmissions,
  canViewOwnTrainerSubmissions as userCanViewOwnTrainerSubmissions,
  canManagePackageCommissions as userCanManagePackageCommissions,
  canReviewManagementSupport as userCanReviewManagementSupport,
  canReviewWriteUps as userCanReviewWriteUps,
  canAccessHrPanels as userCanAccessHrPanels,
  canViewPackageCommissions as userCanViewPackageCommissions,
  canViewOwnWriteUps as userCanViewOwnWriteUps,
  canViewStaffDirectory,
  hasCoordinatorAccess,
  isAdminOrManagementRole,
  isFullAdminRole,
  isTeamLeaderRole
} from "@/lib/admin/users";

function hasValidAdminPasswordHeader(request: Request) {
  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  const headerPassword = request.headers.get("x-admin-password")?.trim();
  return Boolean(legacyPassword && headerPassword && headerPassword === legacyPassword);
}

export function isAdminRequest(request: Request) {
  if (getAdminSessionFromRequest(request)) return true;
  return hasValidAdminPasswordHeader(request);
}

/**
 * Role used for API permission checks.
 * Cookie session role wins. Password-header auth without a session is owner_admin.
 * Missing/blank session roles never elevate.
 */
export function getEffectiveAdminRole(request: Request): string | null {
  const session = getAdminSessionFromRequest(request);
  if (session) {
    const role = typeof session.role === "string" ? session.role.trim() : "";
    return role || null;
  }
  if (hasValidAdminPasswordHeader(request)) return "owner_admin";
  return null;
}

export function unauthorizedAdminResponse(body: Record<string, unknown> = { error: "Unauthorized." }) {
  return Response.json(body, { status: 401 });
}

/** Demo sessions can browse admin UI but must not mutate production settings. */
export function blockDemoWrite(request: Request) {
  const session = getAdminSessionFromRequest(request);
  if (!isDemoSession(session)) return null;
  return NextResponse.json({ ok: true, demo: true, message: demoWriteBlockedMessage() });
}

export function canManagePushNotices(role?: string | null, access?: UserAccess | null) {
  if (access) return canUseStandardOrEmergencyPush(access, role);
  return canAccessPushNotices(role) || canUseStandardOrEmergencyPush(null, role);
}

export function canManageStaffOperations(role?: string | null) {
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "assistant_manager" ||
    role === "management" ||
    hasCoordinatorAccess(role)
  );
}

export function canManageWhiteboardAdmin(role?: string | null) {
  return canManageStaffOperations(role);
}

export function canCreatePushNotice(role?: string | null) {
  return canManagePushNotices(role);
}

/** Edit Daily Reminder templates — admins and management only. */
export function canEditDailyReminders(role?: string | null) {
  return isFullAdminRole(role) || role === "management" || role === "assistant_manager";
}

/** Send Daily Reminders early — admins, management, team leads, and coordinators. */
export function canSendDailyReminderEarly(role?: string | null) {
  return canAccessPushNotices(role);
}

/** Force resend a Daily Reminder — full admins only. */
export function canForceResendDailyReminder(role?: string | null) {
  return isFullAdminRole(role);
}

export function canViewDailyReminderHistory(role?: string | null) {
  return canSendDailyReminderEarly(role);
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
  return canCreateDogHandlerComplaintNotice(role);
}

export function canCreateFrontDeskLog(role?: string | null) {
  return canCreateFrontDeskLogForRole(role);
}

export function canEditFrontDeskLog(role?: string | null) {
  return canEditFrontDeskLogForRole(role);
}

export function canPushGroomingRequest(role?: string | null) {
  return (
    role === "owner_admin" ||
    role === "manager_admin" ||
    role === "front_desk_coordinator" ||
    role === "team_leader" ||
    role === "groomer"
  );
}

export function canClearGroomingRequest(role?: string | null) {
  return canPushGroomingRequest(role);
}

export function canAccessManagementReports(role?: string | null) {
  return canViewManagementReports(role);
}

export function canSubmitWriteUp(role?: string | null) {
  return userCanSubmitWriteUp(role);
}

export function canViewOwnWriteUps(role?: string | null) {
  return userCanViewOwnWriteUps(role);
}

export function canSubmitGroomerComplaint(role?: string | null) {
  return userCanSubmitGroomerComplaint(role);
}

export function canViewOwnGroomerSubmissions(role?: string | null) {
  return userCanViewOwnGroomerSubmissions(role);
}

export function canCreateTrainerEntry(role?: string | null) {
  return userCanCreateTrainerEntry(role);
}

export function canSubmitTrainerComplaint(role?: string | null) {
  return userCanSubmitTrainerComplaint(role);
}

/** Team leads (and admin/management) can file supply/accommodation requests. */
export function canSubmitTeamLeadRequest(role?: string | null) {
  return isTeamLeaderRole(role) || isAdminOrManagementRole(role);
}

export function canViewOwnTrainerSubmissions(role?: string | null) {
  return userCanViewOwnTrainerSubmissions(role);
}

export function canManagePackageCommissions(role?: string | null) {
  return userCanManagePackageCommissions(role);
}

export function canViewPackageCommissions(role?: string | null) {
  return userCanViewPackageCommissions(role);
}

export function canReviewManagementSupport(role?: string | null) {
  return userCanReviewManagementSupport(role);
}

export function canReviewWriteUps(role?: string | null) {
  return userCanReviewWriteUps(role);
}

export function canAccessHrPanels(role?: string | null) {
  return userCanAccessHrPanels(role);
}

export function canSubmitWriteUpWithAccess(access: UserAccess | null | undefined, role?: string | null) {
  return canSubmitWriteUpForUser(access, role);
}

export function canReviewWriteUpsWithAccess(access: UserAccess | null | undefined, role?: string | null) {
  return canReviewWriteUpsForUser(access, role);
}

export function canAccessHrPanelsWithAccess(access: UserAccess | null | undefined, role?: string | null) {
  return canAccessHrPanelsForUser(access, role);
}

export function canReviewManagementSupportWithAccess(access: UserAccess | null | undefined, role?: string | null) {
  return canReviewManagementSupportForUser(access, role);
}

export { canAccessCrossoverCommunication, canAccessFrontDeskLog, canAccessPushNotices, canViewStaffDirectory, canManageStaffDirectory };
