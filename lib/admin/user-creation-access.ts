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

export function isAssignableRoleKey(value: string): value is RoleKey {
  return (ALL_ASSIGNABLE_ROLE_KEYS as string[]).includes(value);
}

/**
 * Every requested role (primary or additional) must be a known role the actor may grant.
 * Roles the target already holds may be kept; super-admin targets are guarded separately.
 */
export function roleAssignmentError(
  access: UserAccess | null | undefined,
  legacyRole: string | null | undefined,
  requestedRoles: unknown[],
  alreadyHeld: RoleKey[] = []
): string | null {
  const allowed = creatablePrimaryRolesForActor(access, legacyRole);
  for (const raw of requestedRoles) {
    const role = String(raw ?? "").trim();
    if (!isAssignableRoleKey(role)) return "Unknown role.";
    if (!alreadyHeld.includes(role) && !allowed.includes(role)) return "You cannot assign that role.";
  }
  return null;
}

export function actorMayAssignSuperAdmin(access: UserAccess | null | undefined, legacyRole?: string | null) {
  return getAdminUserCreationTier(access, legacyRole) === "super_admin";
}

export function sameMembers(a: readonly string[], b: readonly string[]) {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/**
 * Only Super Admin may change their own roles or departments; everyone else asks another administrator.
 * Pass `null` for anything the request leaves unchanged.
 */
export function selfAccessChangeError(input: {
  isSelf: boolean;
  actorIsSuperAdmin: boolean;
  current: Pick<UserAccess, "primaryRole" | "roles" | "departments">;
  nextPrimaryRole: RoleKey | null;
  nextAdditionalRoles: readonly RoleKey[] | null;
  nextDepartments: readonly string[] | null;
}): string | null {
  if (!input.isSelf || input.actorIsSuperAdmin) return null;
  const { current } = input;
  const primary = input.nextPrimaryRole ?? current.primaryRole;
  const primaryChanging = primary !== current.primaryRole;
  const additionalChanging =
    input.nextAdditionalRoles !== null &&
    !sameMembers(
      input.nextAdditionalRoles.filter((role) => role !== primary),
      current.roles.filter((role) => role !== current.primaryRole)
    );
  const departmentsChanging = input.nextDepartments !== null && !sameMembers(input.nextDepartments, current.departments);
  if (primaryChanging || additionalChanging || departmentsChanging) {
    return "Ask another administrator to change your own role or departments.";
  }
  return null;
}
