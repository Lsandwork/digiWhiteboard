import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  hasPermission,
  ROLE_PERMISSIONS,
  RUFFLY_ALLOWED_ROLES,
  type RoleKey
} from "../lib/admin/permissions";
import { buildDefaultRolePermissionMatrix } from "../lib/admin/role-permission-matrix";

const allowedLegacy = [
  ["owner_admin", "super_admin"],
  ["manager_admin", "admin"],
  ["assistant_manager", "management"],
  ["front_desk_coordinator", "front_desk_coordinator"]
] as const;

for (const [legacy, roleKey] of allowedLegacy) {
  assert.equal(RUFFLY_ALLOWED_ROLES.has(roleKey), true, `${roleKey} should be allowed`);
  const access = accessFromLegacyRole(`u-${legacy}`, `${legacy}@fitdog.test`, legacy);
  assert.equal(hasPermission(access, "ruffly.view"), true, `${legacy} should open Ruffly`);
}

const deniedLegacy = ["marketing", "trainer", "groomer", "team_leader", "daycare", "viewer", "driver"] as const;
for (const legacy of deniedLegacy) {
  const access = accessFromLegacyRole(`u-${legacy}`, `${legacy}@fitdog.test`, legacy);
  assert.equal(hasPermission(access, "ruffly.view"), false, `${legacy} must not open Ruffly`);
}

const matrix = buildDefaultRolePermissionMatrix();
for (const role of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
  for (const [permission, enabled] of Object.entries(matrix[role] ?? {})) {
    if (!permission.startsWith("ruffly.")) continue;
    if (!RUFFLY_ALLOWED_ROLES.has(role)) {
      assert.equal(enabled, false, `${role} must not keep ${permission} in matrix`);
    }
  }
}

console.log("ruffly role access tests passed");
