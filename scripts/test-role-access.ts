import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  canCreateFrontDeskLogForRole,
  canEditFrontDeskLogForRole,
  firstAccessibleAdminTab,
  isFullAdminLegacyRole,
  isLobbyDigiBoardOnlyLegacyRole,
  isStaffDigiBoardOnlyLegacyRole,
  legacyRoleToRoleKey
} from "../lib/admin/permissions";
import { ADMIN_TABS } from "../lib/admin/types";
import { isFullAdminRole, type AdminUserRole } from "../lib/admin/users";

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
      firstTab === "my_shift" || firstTab === "crossover_communication" ? "staff" : resolvedBoard;

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
    `${role} can open Team Log`
  );
  if (role !== "marketing") {
    assert.equal(
      canAccessAdminTab(access, "my_shift", role, "staff"),
      true,
      `${role} can open My Shift`
    );
    assert.equal(
      firstAccessibleAdminTab(access, role, "staff"),
      "my_shift",
      `${role} staff landing tab is My Shift`
    );
  } else {
    assert.equal(
      firstAccessibleAdminTab(access, role, "staff"),
      "crossover_communication",
      "marketing staff landing tab remains Team Log"
    );
  }
}

assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "yard_push_notices", "front_desk_coordinator", "staff"),
  true,
  "front desk coordinator can access Yard Push"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "ops_command_center", "front_desk_coordinator", "staff"),
  true,
  "front desk coordinator can open Ops Command Center from Floor Ops"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "ops_command_center", "team_leader", "staff"),
  true,
  "team lead can open Ops Command Center from Floor Ops"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "groomer"), "ops_command_center", "groomer", "staff"),
  false,
  "groomer does not get a standalone Ops Command Center tab"
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
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "handler_shift_entry", "daycare", "staff"),
  false,
  "handlers use Team Log instead of Handler Shift Entry Log"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "trainer"), "trainer_entry", "trainer", "staff"),
  false,
  "trainers use Team Log instead of Trainer's Entry"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "handler_shift_entry", "assistant_manager", "staff"),
  false,
  "management no longer sees Handler Shift Entry Log"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "manager_admin"), "trainer_entry", "manager_admin", "staff"),
  false,
  "admin no longer sees Trainer's Entry"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "trainer_entry", "owner_admin", "staff"),
  false,
  "super admin no longer sees Trainer's Entry"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "marketing"), "walks_board", "marketing", "staff"),
  false,
  "marketing accounts should not open Walks Board on staff"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "settings", "daycare", "staff"),
  true,
  "handlers can open Settings/profile"
);
assert.equal(legacyRoleToRoleKey("overnight"), "overnight");
assert.equal(legacyRoleToRoleKey("maintenance"), "maintenance");
assert.equal(legacyRoleToRoleKey("unknown_role_xyz"), "viewer");

assert.equal(isFullAdminLegacyRole(null), false, "null role is not full admin");
assert.equal(isFullAdminLegacyRole(""), false, "empty role is not full admin");
assert.equal(isFullAdminLegacyRole("viewer"), false, "viewer is not full admin");
assert.equal(isFullAdminLegacyRole("owner_admin"), true, "owner_admin is full admin");
assert.equal(isFullAdminRole(null), false, "null role is not full admin (users)");
assert.equal(isFullAdminRole(""), false, "empty role is not full admin (users)");

assert.equal(canCreateFrontDeskLogForRole("viewer"), false, "viewer cannot create team log");
assert.equal(canEditFrontDeskLogForRole("viewer"), false, "viewer cannot edit team log");
assert.equal(canCreateFrontDeskLogForRole("overnight"), false, "overnight cannot create team log");
assert.equal(canEditFrontDeskLogForRole("maintenance"), false, "maintenance cannot edit team log");
assert.equal(canCreateFrontDeskLogForRole("daycare"), true, "handlers can create team log");
assert.equal(canEditFrontDeskLogForRole("daycare"), true, "handlers can edit team log");

assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "viewer"), "checklist", "viewer", "staff"),
  false,
  "viewer cannot open checklist"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "overnight"), "checklist", "overnight", "staff"),
  false,
  "overnight cannot open checklist"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "checklist", "daycare", "staff"),
  true,
  "handlers can open checklist"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "checklist", "team_leader", "staff"),
  true,
  "team leads can open checklist"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, null), "users", null, "staff"),
  false,
  "missing role must not open admin-only tabs"
);

console.log("role access tests passed");
