import assert from "node:assert/strict";
import { ADMIN_TABS } from "../lib/admin/types";
import { accessFromLegacyRole, canAccessAdminTab, firstAccessibleAdminTab } from "../lib/admin/permissions";
import { buildStaffPanelNav, type NavEntry } from "../lib/admin/nav-groups";

const ROLES = [
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
  "overnight",
  "marketing",
  "viewer"
] as const;

function navTabs(entries: NavEntry[]): string[] {
  const tabs: string[] = [];
  for (const entry of entries) {
    if (entry.type === "item") tabs.push(entry.tab);
    if (entry.type === "group") tabs.push(...entry.children.map((child) => child.tab));
  }
  return tabs;
}

for (const role of ROLES) {
  const access = accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role);

  // Hidden for every user account, including full/super admins.
  assert.equal(
    canAccessAdminTab(access, "front_desk_command", role, "staff"),
    false,
    `${role} must not access Front Desk Command`
  );
  assert.equal(
    canAccessAdminTab(access, "front_desk_command", role, "lobby"),
    false,
    `${role} must not access Front Desk Command on lobby board`
  );

  const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, role, "staff"));
  assert.ok(!visible.includes("front_desk_command"), `${role} visible tabs exclude Front Desk Command`);

  const nav = buildStaffPanelNav(visible, "staff", role);
  assert.ok(!navTabs(nav).includes("front_desk_command"), `${role} sidebar excludes Front Desk Command`);

  // The default landing tab must never resolve to the hidden panel.
  assert.notEqual(firstAccessibleAdminTab(access, role, "staff"), "front_desk_command");
}

// Hiding the panel must not break the rest of the front desk role's tools.
{
  const access = accessFromLegacyRole("fd-1", "fd@fitdog.test", "front_desk_coordinator");
  assert.equal(canAccessAdminTab(access, "my_shift", "front_desk_coordinator", "staff"), true);
  assert.equal(canAccessAdminTab(access, "ops_command_center", "front_desk_coordinator", "staff"), true);
  assert.equal(canAccessAdminTab(access, "push_notices", "front_desk_coordinator", "staff"), true);
  assert.equal(firstAccessibleAdminTab(access, "front_desk_coordinator", "staff"), "my_shift");
  console.log("ok - coordinator keeps My Shift / Ops Command Center / Push Notices");
}

// Other command panels stay available to their roles (no collateral hiding).
{
  const tl = accessFromLegacyRole("tl-1", "tl@fitdog.test", "team_leader");
  assert.equal(canAccessAdminTab(tl, "yard_command", "team_leader", "staff"), true);
  const owner = accessFromLegacyRole("sa-1", "owner@fitdog.test", "owner_admin");
  assert.equal(canAccessAdminTab(owner, "ops_command_center", "owner_admin", "staff"), true);
  console.log("ok - other command panels unaffected");
}

console.log("test-front-desk-command-hidden: all assertions passed");
