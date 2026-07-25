import {
  hasPermission,
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

export function canViewFitdogAlerts(access: UserAccess | null | undefined, legacyRole?: string | null): boolean {
  if (hasPermission(access, "view_fitdog_alerts") || hasPermission(access, "manage_fitdog_alerts")) return true;
  return isFitdogAlertsRole(legacyRole ?? access?.primaryRole ?? null);
}

export function canManageFitdogAlerts(access: UserAccess | null | undefined, legacyRole?: string | null): boolean {
  if (hasPermission(access, "manage_fitdog_alerts")) return true;
  if (!legacyRole && !access) return false;
  const primary = legacyRoleToRoleKey(legacyRole ?? access?.primaryRole ?? null);
  return primary === "super_admin" || primary === "admin" || primary === "management" || primary === "front_desk_coordinator";
}

export function assertFitdogAlertsAccess(access: UserAccess | null | undefined, legacyRole?: string | null) {
  if (!canViewFitdogAlerts(access, legacyRole)) {
    const err = new Error("Fitdog Alerts access required.");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
