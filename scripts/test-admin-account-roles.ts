import assert from "node:assert/strict";
import { canEditDailyReminders } from "../lib/admin/api-auth";
import { isAdminOrManagementLegacyRole } from "../lib/admin/permissions";
import {
  isAdminOrManagementRole,
  isManagementTierUserRole
} from "../lib/admin/users";

assert.equal(isAdminOrManagementRole("assistant_manager"), true);
assert.equal(isAdminOrManagementRole("owner_admin"), true);
assert.equal(isAdminOrManagementRole("manager_admin"), true);
assert.equal(isAdminOrManagementRole("team_leader"), false);

assert.equal(canEditDailyReminders("assistant_manager"), true);
assert.equal(canEditDailyReminders("owner_admin"), true);
assert.equal(canEditDailyReminders("team_leader"), false);

assert.equal(isAdminOrManagementLegacyRole("assistant_manager"), true);
assert.equal(isAdminOrManagementLegacyRole("owner_admin"), true);
assert.equal(isAdminOrManagementLegacyRole("team_leader"), false);

assert.equal(isManagementTierUserRole("assistant_manager"), true);
assert.equal(isManagementTierUserRole("owner_admin"), true);
assert.equal(isManagementTierUserRole("manager_admin"), true);
assert.equal(isManagementTierUserRole("management"), true);
assert.equal(isManagementTierUserRole("admin"), true);
assert.equal(isManagementTierUserRole("team_leader"), false);

console.log("admin account role tests passed");
