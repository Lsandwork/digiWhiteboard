import type { UserAccess } from "@/lib/admin/permissions";
import { isCoordinatorDashboardRole } from "@/lib/admin/team-lead-profile";

function normalizeDashboardRole(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isGroomerDashboardRole(value?: string | null) {
  const token = normalizeDashboardRole(value);
  return token === "groomer";
}

/** Active Groomer dashboard login. Coordinator dashboards stay unchanged. */
export function isGroomerDashboardUser(input: {
  legacyRole?: string | null;
  access?: UserAccess | null;
}): boolean {
  const roles = input.access?.roles || [];
  const primary = input.access?.primaryRole || null;
  const legacy = String(input.legacyRole || "").trim();

  if (isCoordinatorDashboardRole(legacy) || isCoordinatorDashboardRole(primary)) return false;
  if (roles.includes("front_desk_coordinator")) return false;

  return isGroomerDashboardRole(legacy) || isGroomerDashboardRole(primary);
}
