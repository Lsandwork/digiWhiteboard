import assert from "node:assert/strict";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import { isGroomerDashboardUser } from "../lib/admin/groomer-profile";
import {
  assignedGroomerActiveIssues,
  assignedGroomerOpenLogMessages,
  assignedToGroomerUser
} from "../lib/ops-command-center/team-lead-shift";
import {
  additionalServicesFromReservation,
  isFreeWalkService
} from "../lib/ops-command-center/groomer-additional-services";
import { canViewFitdogAlerts } from "../lib/fitdog-ops/access";
import type { ActiveIssue, CrossoverMessage } from "../lib/staff/admin-ops";
import type { GingrReservation } from "../lib/integrations/gingr/types";

const groomerAccess = accessFromLegacyRole("g1", "ivy@fitdog.test", "groomer");
const coordinatorAccess = accessFromLegacyRole("fd-1", "desk@fitdog.test", "front_desk_coordinator");
const dualAccess = {
  ...groomerAccess,
  primaryRole: "groomer" as const,
  roles: ["groomer", "front_desk_coordinator"] as const
};

assert.equal(isGroomerDashboardUser({ legacyRole: "groomer", access: groomerAccess }), true);
assert.equal(isGroomerDashboardUser({ legacyRole: "front_desk_coordinator", access: coordinatorAccess }), false);
assert.equal(isGroomerDashboardUser({ legacyRole: "groomer", access: dualAccess }), false);
assert.equal(isGroomerDashboardUser({ legacyRole: "team_leader", access: accessFromLegacyRole("tl", "tl@fitdog.test", "team_leader") }), false);
assert.equal(canViewFitdogAlerts(groomerAccess, "groomer"), false);
assert.equal(canViewFitdogAlerts(coordinatorAccess, "front_desk_coordinator"), true);

const actor = { name: "Ivy", email: "ivy@fitdog.test", directoryName: "Ivy" };
assert.equal(assignedToGroomerUser("Ivy", null, actor), true);
assert.equal(assignedToGroomerUser("ivy@fitdog.test", null, actor), true);
assert.equal(assignedToGroomerUser("Grooming Team", null, actor), true);
assert.equal(assignedToGroomerUser(null, "Groomer", actor), true);
assert.equal(assignedToGroomerUser("Team Leaders", null, actor), false);
assert.equal(assignedToGroomerUser("Halle", null, actor), false);

assert.equal(isFreeWalkService("Free Walk"), true);
assert.equal(isFreeWalkService("free-walk"), true);
assert.equal(isFreeWalkService("Free Walks"), true);
assert.equal(isFreeWalkService("Paid Walk"), false);
assert.equal(isFreeWalkService("Nail Trim"), false);

const reservation = {
  id: "1001",
  reservation_id: "1001",
  animal: { id: "55", name: "Oscar" },
  owner: { first_name: "Sam", last_name: "Lee" },
  reservation_type: { type: "Daycare" },
  services: [
    { id: "s1", name: "Free Walk", scheduled_at: "2026-08-13 08:00:00" },
    { id: "s2", name: "Bath", scheduled_at: "2026-08-13 10:00:00" },
    { id: "s3", name: "Nail Trim", scheduled_at: "2026-08-13 11:00:00" },
    { id: "s4", name: "Teeth Brush", scheduled_at: "2026-08-12 09:00:00" }
  ]
} as GingrReservation;

const services = additionalServicesFromReservation(reservation, "2026-08-13");
assert.deepEqual(
  services.map((row) => row.serviceName).sort(),
  ["Bath", "Nail Trim"]
);
assert.equal(services.some((row) => /free walk/i.test(row.serviceName)), false);
assert.equal(services[0]?.dogName, "Oscar");

const now = new Date().toISOString();
const assignedLog = {
  id: "ol-1",
  subject: "Sensitive skin note",
  message: "Use oatmeal shampoo",
  details: "Use oatmeal shampoo",
  from_department: "Front Desk",
  to_department: "Grooming Team",
  priority: "High",
  status: "Open",
  related_dog_name: "Oscar",
  related_owner_name: "Sam Lee",
  related_route: null,
  traffic_weather_issue: null,
  template_title: null,
  template_field_values: null,
  created_by: "Desk",
  submitted_by: "Desk",
  assigned_to: "Ivy",
  assigned_team: "Grooming Team",
  reported_to: null,
  department_area: "Grooming",
  urgent: false,
  created_at: now,
  updated_at: now,
  resolved_at: null
} as CrossoverMessage;
const otherLog = { ...assignedLog, id: "ol-2", assigned_to: "Halle", assigned_team: "Team Leaders", subject: "Yard note" } as CrossoverMessage;
assert.deepEqual(
  assignedGroomerOpenLogMessages([assignedLog, otherLog], actor).map((row) => row.id),
  ["ol-1"]
);

const issueAssigned = {
  id: "is-1",
  title: "Clipper blade dull",
  category: "Facility Issue",
  source: "Manual",
  source_id: null,
  source_table: null,
  reported_by: "Ivy",
  assigned_to: "Grooming Team",
  priority: "High",
  reported_at: now,
  due_at: null,
  status: "Open",
  notes: null,
  resolution_notes: null,
  related_owner_name: null,
  related_dog_name: null,
  created_at: now,
  updated_at: now,
  resolved_at: null
} as ActiveIssue;
const issueOther = { ...issueAssigned, id: "is-2", assigned_to: "Team Leaders", title: "Gate latch" };
assert.deepEqual(
  assignedGroomerActiveIssues([issueAssigned, issueOther], actor).map((row) => row.id),
  ["is-1"]
);

console.log("groomer-my-shift: ok");
