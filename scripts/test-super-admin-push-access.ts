import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  buildUserAccess,
  canAccessAdminTab,
  canClearGroomingPush,
  canClearTrainerPush,
  canUseGroomingPush,
  canUseStandardOrEmergencyPush,
  canUseTrainerPush,
  canUseYardPush,
  hasPermission,
  type PermissionKey,
  type RoleKey
} from "../lib/admin/permissions";
import { permissionsForRoleFromMatrix, buildDefaultRolePermissionMatrix } from "../lib/admin/role-permission-matrix";

const matrix = buildDefaultRolePermissionMatrix();
const pushTabs = [
  "push_notices",
  "yard_push_notices",
  "emergency_alerts",
  "cast_videos",
  "grooming_push",
  "trainer_push"
] as const;

const pushPermissions: PermissionKey[] = [
  "manage_push_notices",
  "push_grooming_request",
  "clear_grooming_request",
  "push_trainer_request",
  "clear_trainer_request",
  "push_yard_notice",
  "manage_cast_videos"
];

function assertSuperAdminPushAccess(label: string, legacyRole: string | null, roles: RoleKey[]) {
  const access = buildUserAccess({
    userId: `test-${label}`,
    email: `${label}@fitdog.test`,
    primaryRole: roles[0],
    roles,
    permissions: roles.flatMap((role) => permissionsForRoleFromMatrix(role, matrix))
  });

  for (const tab of pushTabs) {
    assert.equal(
      canAccessAdminTab(access, tab, legacyRole, "staff"),
      true,
      `${label} can access ${tab}`
    );
  }

  assert.equal(canUseGroomingPush(access, legacyRole), true, `${label} grooming push`);
  assert.equal(canClearGroomingPush(access, legacyRole), true, `${label} grooming clear`);
  assert.equal(canUseTrainerPush(access, legacyRole), true, `${label} trainer push`);
  assert.equal(canClearTrainerPush(access, legacyRole), true, `${label} trainer clear`);
  assert.equal(canUseStandardOrEmergencyPush(access, legacyRole), true, `${label} emergency push`);
  assert.equal(canUseYardPush(access, legacyRole), true, `${label} yard push`);

  for (const permission of pushPermissions) {
    assert.equal(hasPermission(access, permission), true, `${label} has ${permission}`);
  }
}

assertSuperAdminPushAccess("owner-admin-legacy", "owner_admin", ["super_admin"]);

const superAdminRbacOnly = buildUserAccess({
  userId: "rbac-super",
  email: "rbac-super@fitdog.test",
  primaryRole: "super_admin",
  roles: ["super_admin"],
  permissions: permissionsForRoleFromMatrix("super_admin", matrix)
});
assert.equal(canUseTrainerPush(superAdminRbacOnly, "assistant_manager"), true, "RBAC super_admin trainer push");
assert.equal(canUseGroomingPush(superAdminRbacOnly, "assistant_manager"), true, "RBAC super_admin grooming push");
assert.equal(hasPermission(superAdminRbacOnly, "push_yard_notice"), true, "super_admin matrix includes yard push");

const ownerAccess = accessFromLegacyRole("owner", "owner@fitdog.test", "owner_admin");
for (const permission of pushPermissions) {
  assert.equal(hasPermission(ownerAccess, permission), true, `legacy owner_admin has ${permission}`);
}

console.log("super admin push access tests passed");
