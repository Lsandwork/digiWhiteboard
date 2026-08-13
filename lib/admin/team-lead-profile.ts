import type { UserAccess } from "@/lib/admin/permissions";
import { FRONT_DESK_DEPARTMENT, TEAM_LEAD_DEPARTMENT } from "@/lib/staff/admin-ops";

/** Staff-directory / assignment labels that mean Team Lead department (not Front Desk). */
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
 * Pure yard Team Lead: team_leader role + Team Lead department.
 * Coordinators (including a coordinator who also holds a team-lead role) stay unchanged.
 */
export function isYardTeamLeadUser(input: {
  legacyRole?: string | null;
  access?: UserAccess | null;
  directoryDepartment?: string | null;
}): boolean {
  const roles = input.access?.roles || [];
  const primary = input.access?.primaryRole || null;
  const legacy = String(input.legacyRole || "").trim();

  if (legacy === "front_desk_coordinator" || primary === "front_desk_coordinator") return false;
  if (roles.includes("front_desk_coordinator")) return false;

  const isTeamLeadRole =
    legacy === "team_leader" || primary === "team_leader" || roles.includes("team_leader");
  if (!isTeamLeadRole) return false;

  const dept = input.directoryDepartment;
  if (dept && String(dept).trim()) {
    if (isFrontDeskDepartmentLabel(dept) && !isTeamLeadDepartmentLabel(dept)) return false;
    return isTeamLeadDepartmentLabel(dept);
  }

  // No directory row: team_leader without coordinator role defaults to Team Lead department.
  return true;
}

export { TEAM_LEAD_DEPARTMENT };
