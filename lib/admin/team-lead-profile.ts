import type { UserAccess } from "@/lib/admin/permissions";
import { FRONT_DESK_DEPARTMENT, TEAM_LEAD_DEPARTMENT } from "@/lib/staff/admin-ops";

function normalizeDashboardRole(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isTeamLeadDashboardRole(value?: string | null) {
  const token = normalizeDashboardRole(value);
  return token === "team_leader" || token === "team_lead";
}

export function isCoordinatorDashboardRole(value?: string | null) {
  const token = normalizeDashboardRole(value);
  return token === "front_desk_coordinator" || token === "front_desk";
}

/** Staff-directory / assignment labels that mean Team Lead (not Front Desk). */
export function isTeamLeadDepartmentLabel(value?: string | null) {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return false;
  if (token.includes("front desk") && !token.includes("team lead")) return false;
  return (
    token === "team lead" ||
    token === "team leads" ||
    token === "team leaders" ||
    token === "team_leader" ||
    token.includes("team lead")
  );
}

export function isFrontDeskDepartmentLabel(value?: string | null) {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return false;
  return token === "front desk" || token === FRONT_DESK_DEPARTMENT.toLowerCase();
}

/**
 * Team Lead dashboard login: active Team Lead role/dashboard.
 * Coordinator dashboards stay unchanged, including a coordinator who also has a separate Team Lead account.
 */
export function isTeamLeadDashboardUser(input: {
  legacyRole?: string | null;
  access?: UserAccess | null;
  dashboardRole?: string | null;
}): boolean {
  const roles = input.access?.roles || [];
  const primary = input.access?.primaryRole || null;
  const legacy = String(input.legacyRole || "").trim();

  if (isCoordinatorDashboardRole(legacy) || isCoordinatorDashboardRole(primary)) return false;
  if (roles.includes("front_desk_coordinator")) return false;

  // Active Team Lead dashboard/login only. Directory department is ignored.
  return isTeamLeadDashboardRole(legacy) || isTeamLeadDashboardRole(primary);
}

/** @deprecated use isTeamLeadDashboardUser — kept so older call sites keep compiling. */
export function isYardTeamLeadUser(input: {
  legacyRole?: string | null;
  access?: UserAccess | null;
  dashboardRole?: string | null;
  directoryDepartment?: string | null;
}) {
  return isTeamLeadDashboardUser(input);
}

export { TEAM_LEAD_DEPARTMENT };
