import assert from "node:assert/strict";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  FRONT_DESK_COORDINATOR_TABS,
  TEAM_LEADER_TABS
} from "@/lib/admin/permissions";
import { buildAdminNav } from "@/lib/admin/nav-groups";

const fdc = accessFromLegacyRole("fdc-1", "front@fitdog.test", "front_desk_coordinator");
const lead = accessFromLegacyRole("lead-1", "lead@fitdog.test", "team_leader");

for (const tab of ["fitdog_alerts", "walks_board", "vet_visits", "track_incidents"] as const) {
  assert.equal(
    canAccessAdminTab(fdc, tab, "front_desk_coordinator", "staff"),
    true,
    `front desk coordinator can open ${tab}`
  );
  assert.ok(
    (FRONT_DESK_COORDINATOR_TABS as readonly string[]).includes(tab),
    `FRONT_DESK_COORDINATOR_TABS includes ${tab}`
  );
}

for (const tab of ["vet_visits", "track_incidents"] as const) {
  assert.equal(
    canAccessAdminTab(lead, tab, "team_leader", "staff"),
    true,
    `team lead can open ${tab}`
  );
  assert.ok((TEAM_LEADER_TABS as readonly string[]).includes(tab), `TEAM_LEADER_TABS includes ${tab}`);
}

assert.equal(canAccessAdminTab(lead, "fitdog_alerts", "team_leader", "staff"), false);

const fdcTabs = [
  "crossover_communication",
  "owner_follow_up",
  "active_issues",
  "fitdog_alerts",
  "walks_board",
  "vet_visits",
  "track_incidents",
  "push_notices",
  "settings"
] as const;
const nav = buildAdminNav([...fdcTabs], "staff");
const labels = JSON.stringify(nav);
assert.match(labels, /Sports App Alerts/);
assert.match(labels, /Walks Board/);
assert.match(labels, /Vet Visits/);
assert.match(labels, /Track Incidents/);

console.log("front desk team lead panel tabs tests passed");
