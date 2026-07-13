import {
  accessFromLegacyRole,
  hasRole,
  isSuperAdminLegacyRole,
  type RoleKey,
  type UserAccess
} from "@/lib/admin/permissions";

const OPERATIONAL_ROLE_KEYS: RoleKey[] = [
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "overnight",
  "maintenance",
  "staff",
  "marketing",
  "viewer"
];

const ALL_ASSIGNABLE_ROLE_KEYS: RoleKey[] = [
  "super_admin",
  "admin",
  "management",
  ...OPERATIONAL_ROLE_KEYS
];

export type AdminUserCreationTier = "super_admin" | "admin" | "management" | "none";

export function getAdminUserCreationTier(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): AdminUserCreationTier {
  const effective = access ?? accessFromLegacyRole(null, null, legacyRole);
  if (hasRole(effective, "super_admin") || isSuperAdminLegacyRole(legacyRole)) return "super_admin";
  if (hasRole(effective, "admin")) return "admin";
  if (hasRole(effective, "management")) return "management";
  if (legacyRole === "manager_admin") return "admin";
  return "none";
}

/** Admin + Management only — not team leads, coordinators, groomers, etc. */
export function canCreateAdminUsers(access: UserAccess | null | undefined, legacyRole?: string | null) {
  return getAdminUserCreationTier(access, legacyRole) !== "none";
}

export function creatablePrimaryRolesForActor(
  access: UserAccess | null | undefined,
  legacyRole?: string | null
): RoleKey[] {
  const tier = getAdminUserCreationTier(access, legacyRole);
  switch (tier) {
    case "super_admin":
      return [...ALL_ASSIGNABLE_ROLE_KEYS];
    case "admin":
      return ALL_ASSIGNABLE_ROLE_KEYS.filter((role) => role !== "super_admin");
    case "management":
      return [...OPERATIONAL_ROLE_KEYS];
    default:
      return [];
  }
}

export function canAssignPrimaryRole(
  access: UserAccess | null | undefined,
  legacyRole: string | null | undefined,
  primaryRole: RoleKey
) {
  return creatablePrimaryRolesForActor(access, legacyRole).includes(primaryRole);
}

export function actorMayAssignSuperAdmin(access: UserAccess | null | undefined, legacyRole?: string | null) {
  return getAdminUserCreationTier(access, legacyRole) === "super_admin";
}
