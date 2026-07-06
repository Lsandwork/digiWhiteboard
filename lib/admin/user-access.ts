import {
  buildUserAccess,
  accessFromLegacyRole,
  legacyRoleToRoleKey,
  roleKeyToLegacyRole,
  ROLE_LABELS,
  type DepartmentKey,
  type RoleKey,
  type UserAccess
} from "@/lib/admin/permissions";
import {
  loadRolePermissionMatrix,
  permissionsForRolesFromMatrix
} from "@/lib/admin/role-permission-matrix";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type UserAccessAssignment = {
  primaryRole: RoleKey;
  roles: RoleKey[];
  departments: DepartmentKey[];
};

type UserAccessState = {
  assignments: Record<string, UserAccessAssignment>;
};

const SETTINGS_STORE_KEY = "admin_user_access";

function normalizeRoleKey(value: unknown): RoleKey | null {
  const key = String(value ?? "").trim() as RoleKey;
  return key in ROLE_LABELS ? key : null;
}

function normalizeDepartmentKey(value: unknown): DepartmentKey | null {
  const key = String(value ?? "").trim() as DepartmentKey;
  const valid: DepartmentKey[] = [
    "front_desk", "management", "daycare", "grooming", "training",
    "transportation", "overnight", "maintenance", "admin"
  ];
  return valid.includes(key) ? key : null;
}

function parseState(value: unknown): UserAccessState {
  if (!value || typeof value !== "object") return { assignments: {} };
  const raw = (value as { assignments?: unknown }).assignments;
  if (!raw || typeof raw !== "object") return { assignments: {} };

  const assignments: Record<string, UserAccessAssignment> = {};
  for (const [userId, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const primary = normalizeRoleKey(item.primaryRole) ?? "viewer";
    const roles = Array.isArray(item.roles)
      ? [...new Set(item.roles.map(normalizeRoleKey).filter(Boolean) as RoleKey[])]
      : [primary];
    const departments = Array.isArray(item.departments)
      ? [...new Set(item.departments.map(normalizeDepartmentKey).filter(Boolean) as DepartmentKey[])]
      : [];
    assignments[userId] = {
      primaryRole: primary,
      roles: roles.length ? roles : [primary],
      departments
    };
  }
  return { assignments };
}

async function loadState(supabase: SupabaseClient): Promise<UserAccessState> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return { assignments: {} };
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  return parseState(settings[SETTINGS_STORE_KEY]);
}

async function saveState(supabase: SupabaseClient, state: UserAccessState) {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: state
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
}

export async function getUserAccess(
  supabase: SupabaseClient,
  userId: string | null | undefined,
  legacyRole?: string | null,
  email?: string | null
): Promise<UserAccess> {
  const matrix = await loadRolePermissionMatrix(supabase);

  if (!userId) return accessFromLegacyRole(null, email ?? null, legacyRole);

  const state = await loadState(supabase);
  const assignment = state.assignments[userId];
  if (!assignment) {
    const primaryRole = legacyRoleToRoleKey(legacyRole);
    const roles = [primaryRole];
    return buildUserAccess({
      userId,
      email,
      primaryRole,
      roles,
      permissions: permissionsForRolesFromMatrix(roles, matrix)
    });
  }

  const roles = [...new Set([assignment.primaryRole, ...assignment.roles])];
  return buildUserAccess({
    userId,
    email,
    primaryRole: assignment.primaryRole,
    roles: assignment.roles,
    departments: assignment.departments,
    permissions: permissionsForRolesFromMatrix(roles, matrix)
  });
}

export async function setUserAccess(
  supabase: SupabaseClient,
  userId: string,
  assignment: UserAccessAssignment
) {
  const state = await loadState(supabase);
  const primaryRole = assignment.primaryRole;
  const roles = [...new Set([primaryRole, ...assignment.roles])];
  state.assignments[userId] = {
    primaryRole,
    roles,
    departments: [...new Set(assignment.departments)]
  };
  await saveState(supabase, state);
  return state.assignments[userId];
}

export async function migrateLegacyUserAccess(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, email, role");
  if (error) return;

  const state = await loadState(supabase);
  let changed = false;

  for (const row of data ?? []) {
    if (state.assignments[row.id]) continue;
    const primaryRole = legacyRoleToRoleKey(row.role);
    state.assignments[row.id] = {
      primaryRole,
      roles: [primaryRole],
      departments: defaultDepartmentsForRole(primaryRole)
    };
    changed = true;
  }

  if (changed) await saveState(supabase, state);
}

function defaultDepartmentsForRole(role: RoleKey): DepartmentKey[] {
  switch (role) {
    case "front_desk_coordinator":
    case "team_leader":
      return ["front_desk"];
    case "groomer":
      return ["grooming"];
    case "trainer":
      return ["training"];
    case "management":
    case "admin":
    case "super_admin":
      return ["management", "admin"];
    case "daycare":
      return ["daycare"];
    case "driver":
    case "hiker":
      return ["transportation"];
    default:
      return [];
  }
}

export { roleKeyToLegacyRole, legacyRoleToRoleKey };
