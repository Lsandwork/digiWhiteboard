type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

import {
  ALL_CATALOG_PERMISSION_KEYS,
  SUPER_ADMIN_ONLY_PERMISSIONS
} from "@/lib/admin/permission-catalog";
import {
  permissionsForRoles as staticPermissionsForRoles,
  ROLE_PERMISSIONS,
  type PermissionKey,
  type RoleKey
} from "@/lib/admin/permissions";

export type RolePermissionMatrix = Record<string, Record<string, boolean>>;

const SETTINGS_STORE_KEY = "role_permission_matrix";

function emptyMatrix(): RolePermissionMatrix {
  return {};
}

export function buildDefaultRolePermissionMatrix(): RolePermissionMatrix {
  const matrix: RolePermissionMatrix = {};
  for (const role of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    matrix[role] = {};
    const permissions = ROLE_PERMISSIONS[role] ?? [];
    for (const key of ALL_CATALOG_PERMISSION_KEYS) {
      matrix[role][key] = permissions.includes(key);
    }
    if (role === "super_admin") {
      for (const key of ALL_CATALOG_PERMISSION_KEYS) {
        matrix[role][key] = true;
      }
    }
    if (role === "admin") {
      for (const key of SUPER_ADMIN_ONLY_PERMISSIONS) {
        matrix[role][key] = false;
      }
    }
  }
  return matrix;
}

function mergeMatrix(base: RolePermissionMatrix, stored: RolePermissionMatrix): RolePermissionMatrix {
  const merged = buildDefaultRolePermissionMatrix();
  for (const role of Object.keys(merged)) {
    for (const key of ALL_CATALOG_PERMISSION_KEYS) {
      if (stored[role]?.[key] !== undefined) {
        merged[role][key] = Boolean(stored[role][key]);
      }
    }
    if (role === "super_admin") {
      for (const key of ALL_CATALOG_PERMISSION_KEYS) {
        merged[role][key] = true;
      }
    }
    if (role === "admin") {
      for (const key of SUPER_ADMIN_ONLY_PERMISSIONS) {
        merged[role][key] = false;
      }
    }
  }
  return merged;
}

export async function loadRolePermissionMatrix(supabase: SupabaseClient): Promise<RolePermissionMatrix> {
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) return buildDefaultRolePermissionMatrix();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const stored = settings[SETTINGS_STORE_KEY];
  if (!stored || typeof stored !== "object") return buildDefaultRolePermissionMatrix();
  return mergeMatrix(buildDefaultRolePermissionMatrix(), stored as RolePermissionMatrix);
}

export async function saveRolePermissionMatrix(supabase: SupabaseClient, matrix: RolePermissionMatrix) {
  const sanitized = mergeMatrix(buildDefaultRolePermissionMatrix(), matrix);
  const { data, error } = await supabase.from("admin_settings").select("settings").eq("id", "default").maybeSingle();
  if (error) throw error;
  const settings = {
    ...((data?.settings ?? {}) as Record<string, unknown>),
    [SETTINGS_STORE_KEY]: sanitized
  };
  const { error: saveError } = await supabase
    .from("admin_settings")
    .upsert({ id: "default", settings, updated_at: new Date().toISOString() });
  if (saveError) throw saveError;
  return sanitized;
}

export function permissionsForRoleFromMatrix(role: RoleKey, matrix: RolePermissionMatrix): PermissionKey[] {
  if (role === "super_admin") {
    return [...ALL_CATALOG_PERMISSION_KEYS];
  }
  const roleMap = matrix[role];
  if (!roleMap) {
    return staticPermissionsForRoles([role]);
  }
  const enabled = ALL_CATALOG_PERMISSION_KEYS.filter((key) => roleMap[key]);
  if (enabled.length === 0) {
    return staticPermissionsForRoles([role]);
  }
  return enabled;
}

export function permissionsForRolesFromMatrix(roles: RoleKey[], matrix: RolePermissionMatrix): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const permission of permissionsForRoleFromMatrix(role, matrix)) {
      set.add(permission);
    }
  }
  return [...set];
}

export function isPermissionLockedForRole(role: RoleKey, permission: PermissionKey): boolean {
  if (role === "super_admin") return true;
  if (role === "admin" && SUPER_ADMIN_ONLY_PERMISSIONS.has(permission)) return true;
  return false;
}

export async function setRolePermission(
  supabase: SupabaseClient,
  role: RoleKey,
  permission: PermissionKey,
  enabled: boolean
) {
  if (isPermissionLockedForRole(role, permission)) {
    throw new Error("This permission is locked for this role.");
  }
  const matrix = await loadRolePermissionMatrix(supabase);
  if (!matrix[role]) matrix[role] = {};
  matrix[role][permission] = enabled;
  return saveRolePermissionMatrix(supabase, matrix);
}

export async function setCategoryPermissionsForRole(
  supabase: SupabaseClient,
  role: RoleKey,
  permissions: PermissionKey[],
  enabled: boolean
) {
  const matrix = await loadRolePermissionMatrix(supabase);
  if (!matrix[role]) matrix[role] = {};
  for (const permission of permissions) {
    if (isPermissionLockedForRole(role, permission)) continue;
    matrix[role][permission] = enabled;
  }
  return saveRolePermissionMatrix(supabase, matrix);
}

export async function ensureSuperAdminUsers(supabase: SupabaseClient) {
  const { data: superAdmins, error } = await supabase
    .from("admin_users")
    .select("id, email, role")
    .eq("role", "owner_admin")
    .eq("status", "active");
  if (error) throw error;
  if ((superAdmins ?? []).length > 0) return { count: superAdmins!.length };

  const { data: managers } = await supabase
    .from("admin_users")
    .select("id, email, role")
    .eq("role", "manager_admin")
    .eq("status", "active")
    .limit(1);
  const fallback = managers?.[0];
  if (!fallback) {
    console.error("[rbac] No active admin user found to promote to Super Admin.");
    return { count: 0, error: "no_super_admin_candidate" };
  }
  await supabase.from("admin_users").update({ role: "owner_admin", updated_at: new Date().toISOString() }).eq("id", fallback.id);
  return { count: 1, promoted: fallback.email };
}
