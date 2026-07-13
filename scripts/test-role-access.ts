import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole
} from "../lib/admin/permissions";
import { ADMIN_TABS } from "../lib/admin/types";
import type { AdminUserRole } from "../lib/admin/users";

const roles: AdminUserRole[] = [
  "owner_admin",
  "manager_admin",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "marketing",
  "viewer"
];

for (const role of roles) {
  const access = accessFromLegacyRole(`audit-${role}`, `${role}@fitdog.test`, role);

  for (const requestedBoard of ["staff", "lobby"] as const) {
    const resolvedBoard = isStaffDigiBoardOnlyLegacyRole(role)
      ? "staff"
      : isLobbyDigiBoardOnlyLegacyRole(role)
        ? "lobby"
        : requestedBoard;
    const firstTab = firstAccessibleAdminTab(access, role, requestedBoard);

    assert.equal(
      (ADMIN_TABS as readonly string[]).includes(firstTab),
      true,
      `${role} resolves to a known ${resolvedBoard} tab`
    );
    assert.equal(
      canAccessAdminTab(access, firstTab, role, resolvedBoard),
      true,
      `${role} can access its first ${resolvedBoard} tab (${firstTab})`
    );
  }
}

assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "yard_links", "daycare", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "hr_hub", "daycare", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "trainer"), "package_commissions", "trainer", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "package_commissions", "assistant_manager", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "groomer"), "grooming_push", "groomer", "staff"), true);

console.log("role access tests passed");
