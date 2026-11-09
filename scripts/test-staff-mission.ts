import assert from "node:assert/strict";
import type { CommandAction } from "@/lib/ops-command-center/action-queue";
import { buildStaffMissionContext, prioritizeActionsForRole } from "@/lib/ops-command-center/staff-mission";

const sample: CommandAction[] = [
  {
    id: "a1",
    priority: "high",
    category: "issue",
    title: "Broken gate",
    detail: null,
    dogName: null,
    at: null,
    hrefTab: "active_issues",
    hrefLabel: "Open"
  },
  {
    id: "a2",
    priority: "high",
    category: "pickup",
    title: "Rex pickup late",
    detail: null,
    dogName: "Rex",
    at: null,
    hrefTab: "my_shift",
    hrefLabel: "Leaving"
  }
];

const fd = prioritizeActionsForRole(sample, "front_desk_coordinator");
assert.equal(fd[0]?.category, "pickup", "front desk should see pickups before issues");

const tl = prioritizeActionsForRole(sample, "team_leader");
assert.equal(tl[0]?.category, "issue", "team lead should see issues before pickups");

const mission = buildStaffMissionContext({
  roleKey: "front_desk_coordinator",
  roleLabel: "Front Desk Coordinator",
  displayName: "Jamie Smith",
  email: "jamie@fitdogclub.com",
  actions: sample,
  pulse: {
    onSite: 42,
    pickupsDue: 3,
    arrivalsExpected: 2,
    medicalWatch: 1,
    openActions: 2,
    criticalCount: 0
  }
});

assert.equal(mission.greetingName, "Jamie", "uses first name from display name");
assert.equal(mission.yourQueue.length, 2);
assert.ok(mission.quickTools.some((t) => t.tab === "owner_follow_up"));

console.log("staff mission tests passed");
