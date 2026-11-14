import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_TABS } from "../lib/admin/types";
import {
  OVERNIGHT_TABS,
  accessFromLegacyRole,
  accessibleAdminBoards,
  canAccessAdminTab,
  canCreateFrontDeskLogForRole,
  canEditFrontDeskLogForRole,
  firstAccessibleAdminTab
} from "../lib/admin/permissions";
import { buildStaffPanelNav, type NavEntry } from "../lib/admin/nav-groups";
import { canFileStaffComplaint, canSubmitGroomerRequest } from "../lib/admin/users";
import { departmentForDashboardRole } from "../lib/staff/admin-ops";
import { STAFF_DIRECTORY_DASHBOARD_ROLES } from "../lib/staff/directory-reconciliation";

const access = accessFromLegacyRole("overnight-1", "overnight@fitdog.test", "overnight");
const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, "overnight", "staff"));

assert.deepEqual(
  [...visible].sort(),
  [...OVERNIGHT_TABS].sort(),
  "overnight staff panel is exactly the allowed tabs"
);

for (const tab of OVERNIGHT_TABS) {
  assert.equal(canAccessAdminTab(access, tab, "overnight", "staff"), true, `overnight opens ${tab}`);
  assert.equal(canAccessAdminTab(access, tab, "overnight", "lobby"), false, `overnight ${tab} stays off the lobby board`);
}

assert.equal(canAccessAdminTab(access, "body_checks", "overnight", "staff"), true, "overnight opens body_checks");

for (const tab of [
  "push_notices",
  "checklist",
  "walks_board",
  "package_group_walks",
  "bulk_photo_upload",
  "users",
  "overnight_command",
  "staff_directory"
] as const) {
  assert.equal(canAccessAdminTab(access, tab, "overnight", "staff"), false, `overnight does not open ${tab}`);
}

assert.deepEqual(accessibleAdminBoards(access, "overnight"), ["staff"]);
assert.equal(firstAccessibleAdminTab(access, "overnight", "staff"), "ops_command_center");
assert.equal(canCreateFrontDeskLogForRole("overnight"), true);
assert.equal(canEditFrontDeskLogForRole("overnight"), true);
assert.equal(canFileStaffComplaint("overnight"), true);
assert.equal(canSubmitGroomerRequest("overnight"), true);
assert.equal(departmentForDashboardRole("overnight"), "Overnight");
assert.ok(STAFF_DIRECTORY_DASHBOARD_ROLES.includes("overnight"));

function itemLabels(entries: NavEntry[]): string[] {
  const labels: string[] = [];
  for (const entry of entries) {
    if (entry.type === "item") labels.push(entry.label);
    if (entry.type === "group") labels.push(...entry.children.map((child) => child.label));
  }
  return labels;
}

const nav = buildStaffPanelNav(visible, "staff", "overnight");
assert.deepEqual(itemLabels(nav), [
  "Live Floor",
  "My Shift",
  "Team Log",
  "Body Checks",
  "Submit Request",
  "Notifications",
  "Global Settings",
  "Help Center"
]);

const addStaff = readFileSync("components/admin/StaffDirectoryPanel.tsx", "utf8");
assert.match(addStaff, /value: "overnight", label: "Overnight"/);

const daycare = accessFromLegacyRole("handler-1", "handler@fitdog.test", "daycare");
assert.equal(canAccessAdminTab(daycare, "checklist", "daycare", "staff"), true, "dog handler checklist stays");
assert.equal(canAccessAdminTab(daycare, "my_shift", "daycare", "staff"), true);

console.log("test-overnight-account: ok");
