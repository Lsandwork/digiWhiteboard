import { legacyRoleToRoleKey, type RoleKey } from "@/lib/admin/permissions";
import type { OperationsChecklistRole } from "@/lib/operations-checklist/types";

/** Map a staff legacy/RBAC role to Operations Checklist assigned-role keys. */
export function checklistRolesForStaffRole(legacyRole?: string | null): OperationsChecklistRole[] {
  const key = legacyRoleToRoleKey(legacyRole);
  const roles = new Set<OperationsChecklistRole>(["all_staff"]);

  switch (key) {
    case "overnight":
      roles.add("overnight");
      break;
    case "daycare":
    case "driver":
    case "hiker":
      roles.add("handler");
      roles.add("opening_team");
      if (key === "driver" || key === "hiker") roles.add("transportation");
      break;
    case "team_leader":
      roles.add("team_lead");
      roles.add("handler");
      roles.add("opening_team");
      break;
    case "front_desk_coordinator":
      roles.add("front_desk");
      break;
    case "groomer":
      roles.add("groomer");
      break;
    case "trainer":
      roles.add("trainer");
      break;
    case "management":
    case "admin":
    case "super_admin":
      roles.add("management");
      roles.add("team_lead");
      roles.add("front_desk");
      roles.add("opening_team");
      break;
    default:
      break;
  }

  return [...roles];
}

export function canManageOperationsChecklist(legacyRole?: string | null, roleKey?: RoleKey | null) {
  const key = roleKey ?? legacyRoleToRoleKey(legacyRole);
  return key === "super_admin" || key === "admin" || key === "management" || key === "team_leader";
}

export function displayNameForUser(user: {
  full_name?: string | null;
  display_name?: string | null;
  email?: string | null;
} | null | undefined) {
  return user?.display_name?.trim() || user?.full_name?.trim() || user?.email?.trim() || "Staff";
}
