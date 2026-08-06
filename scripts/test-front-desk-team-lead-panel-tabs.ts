import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  FRONT_DESK_COORDINATOR_TABS,
  MANAGEMENT_REQUIRED_PANEL_TABS,
  TEAM_LEADER_TABS
} from "@/lib/admin/permissions";
import { buildAdminNav, buildStaffPanelNav, findNavSectionForTab } from "@/lib/admin/nav-groups";

const fdc = accessFromLegacyRole("fdc-1", "front@fitdog.test", "front_desk_coordinator");
const lead = accessFromLegacyRole("lead-1", "lead@fitdog.test", "team_leader");

const REQUIRED = [...MANAGEMENT_REQUIRED_PANEL_TABS] as const;

for (const tab of REQUIRED) {
  assert.equal(
    canAccessAdminTab(fdc, tab, "front_desk_coordinator", "staff"),
    true,
    `front desk coordinator can open ${tab}`
  );
  assert.ok(
    (FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab),
    `FRONT_DESK_COORDINATOR_TABS includes ${tab}`
  );

  assert.equal(
    canAccessAdminTab(lead, tab, "team_leader", "staff"),
    true,
    `team lead can open ${tab}`
  );
  assert.ok((TEAM_LEADER_TABS as readonly string[]).includes(tab), `TEAM_LEADER_TABS includes ${tab}`);
}

assert.equal(
  canAccessAdminTab(lead, "active_issues", "team_leader", "staff"),
  true,
  "team lead can open active_issues"
);
assert.ok((TEAM_LEADER_TABS as readonly string[]).includes("active_issues"), "TEAM_LEADER_TABS includes active_issues");

const fdcTabs = [
  "crossover_communication",
  "owner_follow_up",
  "active_issues",
  "route_generator",
  "fitdog_alerts",
  "walks_board",
  "vet_visits",
  "track_incidents",
  "push_notices",
  "settings"
] as const;
const fdcNav = buildAdminNav([...fdcTabs], "staff");
const fdcLabels = JSON.stringify(fdcNav);
assert.match(fdcLabels, /Route Generator/);
assert.match(fdcLabels, /Sports App Alerts/);
assert.match(fdcLabels, /Walks Board/);
assert.match(fdcLabels, /Vet Visits/);
assert.match(fdcLabels, /Track Incidents/);
assert.equal(findNavSectionForTab(fdcNav, "route_generator"), "Dashboard");
assert.equal(findNavSectionForTab(fdcNav, "fitdog_alerts"), "Front Desk & Floor");

const leadVisible = REQUIRED.filter((tab) => canAccessAdminTab(lead, tab, "team_leader", "staff"));
const leadNav = buildStaffPanelNav(
  [...leadVisible, "crossover_communication", "push_notices", "settings"],
  "staff",
  "team_leader"
);
const leadLabels = JSON.stringify(leadNav);
assert.match(leadLabels, /Route Generator/);
assert.match(leadLabels, /Sports App Alerts/);
assert.match(leadLabels, /Walks Board/);
assert.match(leadLabels, /Vet Visits/);
assert.match(leadLabels, /Track Incidents/);
assert.equal(findNavSectionForTab(leadNav, "route_generator"), "Dashboard");
assert.equal(findNavSectionForTab(leadNav, "vet_visits"), "Front Desk & Floor");
assert.equal(findNavSectionForTab(leadNav, "walks_board"), "Front Desk & Floor");

console.log("front desk team lead panel tabs tests passed");
