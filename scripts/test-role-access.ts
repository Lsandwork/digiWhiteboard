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
  "driver",
  "hiker",
  "marketing",
  "viewer"
];

for (const role of roles) {
  const access = accessFromLegacyRole(`audit-${role}`, `${role}@fitdog.test`, role);

  for (const requestedBoard of ["staff", "lobby"] as const) {
    const resolvedBoard = isStaffDigiBoardOnlyLegacyRole(role)
      ? "staff"
      : isLobbyDigiBoardOnlyLegacyRole(role)
        ? requestedBoard === "staff"
          ? "staff"
          : "lobby"
        : requestedBoard;
    const firstTab = firstAccessibleAdminTab(access, role, requestedBoard);
    const accessBoard =
      firstTab === "crossover_communication" ? "staff" : resolvedBoard;

    assert.equal(
      (ADMIN_TABS as readonly string[]).includes(firstTab),
      true,
      `${role} resolves to a known tab (${firstTab})`
    );
    assert.equal(
      canAccessAdminTab(access, firstTab, role, accessBoard),
      true,
      `${role} can access its first tab (${firstTab}) on ${accessBoard}`
    );
  }

  assert.equal(
    canAccessAdminTab(access, "crossover_communication", role, "staff"),
    true,
    `${role} can open Front Desk Log`
  );
  assert.equal(
    firstAccessibleAdminTab(access, role, "staff"),
    "crossover_communication",
    `${role} staff landing tab is Front Desk Log`
  );
}

assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "yard_push_notices", "front_desk_coordinator", "staff"),
  true,
  "front desk coordinator can access Yard Push"
);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "yard_links", "daycare", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "hr_hub", "daycare", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), "yard_links", "driver", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), "walks_board", "driver", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), "hr_hub", "driver", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "hiker"), "yard_links", "hiker", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "trainer"), "package_commissions", "trainer", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "package_commissions", "assistant_manager", "staff"), true);
assert.equal(canAccessAdminTab(accessFromLegacyRole(null, null, "groomer"), "grooming_push", "groomer", "staff"), true);

console.log("role access tests passed");
