import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  buildUserAccess,
  canAccessAdminTab,
  legacyRoleToRoleKey,
  MANAGEMENT_REQUIRED_PANEL_TABS
} from "@/lib/admin/permissions";
import {
  buildDefaultRolePermissionMatrix,
  isPermissionLockedForRole,
  permissionsForRolesFromMatrix
} from "@/lib/admin/role-permission-matrix";
import { buildAdminNav } from "@/lib/admin/nav-groups";

assert.equal(legacyRoleToRoleKey("management"), "management");
assert.equal(legacyRoleToRoleKey("assistant_manager"), "management");

for (const role of ["assistant_manager", "management"] as const) {
  const access = accessFromLegacyRole("mgmt-1", "mgmt@fitdog.test", role);
  for (const tab of MANAGEMENT_REQUIRED_PANEL_TABS) {
    assert.equal(
      canAccessAdminTab(access, tab, role, "staff"),
      true,
      `${role} can open ${tab}`
    );
  }
}

// Even if an old matrix snapshot disabled the permissions, management still keeps the panels.
const matrix = buildDefaultRolePermissionMatrix();
for (const key of Object.keys(matrix.management)) {
  if (
    key.includes("route_generator") ||
    key.includes("fitdog") ||
    key.includes("vet_visits") ||
    key.includes("track_incidents") ||
    key === "receive_walks_board_reminders"
  ) {
    matrix.management[key] = false;
  }
}
const forced = permissionsForRolesFromMatrix(["management"], matrix);
assert.ok(forced.includes("route_generator.view"), "matrix force-on restores route_generator.view");
assert.ok(forced.includes("view_fitdog_alerts"), "matrix force-on restores view_fitdog_alerts");
assert.ok(forced.includes("view_vet_visits"), "matrix force-on restores view_vet_visits");
assert.ok(forced.includes("view_track_incidents"), "matrix force-on restores view_track_incidents");
assert.equal(isPermissionLockedForRole("management", "route_generator.view"), true);
assert.equal(isPermissionLockedForRole("management", "view_fitdog_alerts"), true);

const access = buildUserAccess({
  userId: "m1",
  email: "m@fitdog.test",
  primaryRole: "management",
  roles: ["management"],
  departments: ["management"],
  permissions: forced
});
for (const tab of MANAGEMENT_REQUIRED_PANEL_TABS) {
  assert.equal(canAccessAdminTab(access, tab, "assistant_manager", "staff"), true);
}

const nav = buildAdminNav([...MANAGEMENT_REQUIRED_PANEL_TABS, "overview", "settings"], "staff");
const labels = JSON.stringify(nav);
assert.match(labels, /Route Generator/);
assert.match(labels, /Sports App Alerts/);
assert.match(labels, /Walks Board/);
assert.match(labels, /Vet Visits/);
assert.match(labels, /Track Incidents/);

console.log("management panel tabs tests passed");
