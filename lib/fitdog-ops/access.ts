import {
  legacyRoleToRoleKey,
  type RoleKey,
  type UserAccess
} from "@/lib/admin/permissions";

/** Roles authorized for Fitdog payment alerts (UI + API). */
export const FITDOG_ALERT_ALLOWED_ROLES: RoleKey[] = [
  "super_admin",
  "admin",
  "management",
  "front_desk_coordinator"
];

export function isFitdogAlertsRole(role?: string | null): boolean {
  if (!role) return false;
  const primary = legacyRoleToRoleKey(role);
  return FITDOG_ALERT_ALLOWED_ROLES.includes(primary);
}

export function canViewFitdogAlerts(_access: UserAccess | null | undefined, _legacyRole?: string | null): boolean {
  // Retired from RuffOps — keep the helpers so existing API/tests compile, but nobody can open the tool.
  return false;
}

export function canManageFitdogAlerts(_access: UserAccess | null | undefined, _legacyRole?: string | null): boolean {
  return false;
}

export function assertFitdogAlertsAccess(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (!canViewFitdogAlerts(access, legacyRole)) {
    const err = new Error("Fitdog Alerts access required.");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
