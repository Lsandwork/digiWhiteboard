import assert from "node:assert/strict";
import {
  TAB_PERMISSIONS,
  canAccessAdminTab,
  canReviewManagementSupportForUser,
  legacyRoleToRoleKey,
  type UserAccess
} from "../lib/admin/permissions";

assert.equal(TAB_PERMISSIONS.ms_hub, "review_management_support");

function accessFor(
  roleKey: "super_admin" | "admin" | "management" | "team_leader" | "groomer",
  permissions: string[]
): UserAccess {
  return {
    userId: `test-${roleKey}`,
    email: `${roleKey}@fitdog.test`,
    displayLabel: roleKey,
    primaryRole: roleKey,
    roles: [roleKey],
    departments: [],
    permissions: permissions as UserAccess["permissions"]
  };
}

const reviewerPerms = ["review_management_support", "submit_write_up"] as const;
const staffPerms = ["submit_write_up"] as const;

assert.equal(canReviewManagementSupportForUser(accessFor("super_admin", [...reviewerPerms]), "owner_admin"), true);
assert.equal(canReviewManagementSupportForUser(accessFor("admin", [...reviewerPerms]), "manager_admin"), true);
assert.equal(canReviewManagementSupportForUser(accessFor("management", [...reviewerPerms]), "assistant_manager"), true);
assert.equal(canReviewManagementSupportForUser(accessFor("team_leader", [...staffPerms]), "team_leader"), false);
assert.equal(canReviewManagementSupportForUser(accessFor("groomer", [...staffPerms]), "groomer"), false);

assert.equal(canAccessAdminTab(accessFor("admin", [...reviewerPerms]), "ms_hub", "manager_admin", "staff"), true);
assert.equal(canAccessAdminTab(accessFor("groomer", [...staffPerms]), "ms_hub", "groomer", "staff"), false);

assert.equal(legacyRoleToRoleKey("owner_admin"), "super_admin");
assert.equal(legacyRoleToRoleKey("manager_admin"), "admin");
assert.equal(legacyRoleToRoleKey("assistant_manager"), "management");

console.log("support command center permission tests passed");
