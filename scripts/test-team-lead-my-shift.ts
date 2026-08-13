import assert from "node:assert/strict";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import { isYardTeamLeadUser } from "../lib/admin/team-lead-profile";
import {
  assignedActiveIssues,
  assignedOpenLogMessages,
  assignedToTeamLeadUser,
  previousTeamLeadShiftNotes
} from "../lib/ops-command-center/team-lead-shift";
import { openLogToWorkItem } from "../lib/ops-command-center/adapters/staff-ops-feed";
import {
  availableActionsForKind,
  parseWorkItemId
} from "../lib/ops-command-center/work-item-actions";
import type { ActiveIssue, CrossoverMessage, StaffDirectoryMember } from "../lib/staff/admin-ops";

const tlAccess = accessFromLegacyRole("tl-1", "halle@fitdog.test", "team_leader");
const coordinatorAccess = accessFromLegacyRole("fd-1", "desk@fitdog.test", "front_desk_coordinator");
const dualAccess = {
  ...tlAccess,
  primaryRole: "team_leader" as const,
  roles: ["team_leader", "front_desk_coordinator"] as const
};

assert.equal(
  isYardTeamLeadUser({
    legacyRole: "team_leader",
    access: tlAccess,
    directoryDepartment: "Team Lead"
  }),
  true
);
assert.equal(
  isYardTeamLeadUser({
    legacyRole: "team_leader",
    access: tlAccess,
    directoryDepartment: null
  }),
  true
);
assert.equal(
  isYardTeamLeadUser({
    legacyRole: "team_leader",
    access: tlAccess,
    directoryDepartment: "Front Desk"
  }),
  false
);
assert.equal(
  isYardTeamLeadUser({
    legacyRole: "front_desk_coordinator",
    access: coordinatorAccess,
    directoryDepartment: "Front Desk"
  }),
  false
);
assert.equal(
  isYardTeamLeadUser({
    legacyRole: "team_leader",
    access: dualAccess,
    directoryDepartment: "Team Lead"
  }),
  false,
  "coordinator + team lead dual accounts stay unchanged"
);

const actor = { name: "Halle", email: "halle@fitdog.test", directoryName: "Halle" };
assert.equal(assignedToTeamLeadUser("Halle", null, actor), true);
assert.equal(assignedToTeamLeadUser("halle@fitdog.test", null, actor), true);
assert.equal(assignedToTeamLeadUser("Team Leaders", null, actor), true);
assert.equal(assignedToTeamLeadUser(null, "Team Lead", actor), true);
assert.equal(assignedToTeamLeadUser("Brian", null, actor), false);
assert.equal(assignedToTeamLeadUser("Front Desk Team", null, actor), false);

const now = new Date().toISOString();
function log(partial: Partial<CrossoverMessage> & Pick<CrossoverMessage, "id" | "subject" | "status">): CrossoverMessage {
  return {
    message: partial.message || partial.details || "",
    details: partial.details || partial.message || "",
    from_department: partial.from_department || "Team Lead",
    to_department: partial.to_department || "Team Leaders",
    priority: partial.priority || "Normal",
    related_dog_name: partial.related_dog_name ?? null,
    related_owner_name: partial.related_owner_name ?? null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: null,
    template_field_values: null,
    created_by: partial.created_by ?? "Brian",
    submitted_by: partial.submitted_by ?? partial.created_by ?? "Brian",
    assigned_to: partial.assigned_to ?? null,
    assigned_team: partial.assigned_team ?? null,
    reported_to: null,
    department_area: partial.department_area || "Team Lead",
    urgent: partial.urgent ?? false,
    created_at: partial.created_at || now,
    updated_at: partial.updated_at || now,
    resolved_at: partial.resolved_at ?? null,
    ...partial
  } as CrossoverMessage;
}

const openAssigned = log({
  id: "ol-1",
  subject: "Yard gate latch",
  status: "Open",
  assigned_to: "Halle",
  details: "Needs a wrench"
});
const openUnassigned = log({
  id: "ol-2",
  subject: "Owner callback",
  status: "Open",
  assigned_to: "Front Desk Team",
  from_department: "Front Desk",
  department_area: "Front Desk"
});
const resolvedAssigned = log({
  id: "ol-3",
  subject: "Done already",
  status: "Resolved",
  assigned_to: "Halle"
});

const assignedLogs = assignedOpenLogMessages([openAssigned, openUnassigned, resolvedAssigned], actor);
assert.deepEqual(
  assignedLogs.map((row) => row.id),
  ["ol-1"]
);

const issueAssigned = {
  id: "is-1",
  title: "Water bowl leak",
  category: "Facility Issue",
  source: "Manual",
  source_id: null,
  source_table: null,
  reported_by: "Brian",
  assigned_to: "Halle",
  priority: "High",
  reported_at: now,
  due_at: null,
  status: "Open",
  notes: "Yard 1",
  resolution_notes: null,
  related_owner_name: null,
  related_dog_name: null,
  created_at: now,
  updated_at: now,
  resolved_at: null
} as ActiveIssue;
const issueOther = { ...issueAssigned, id: "is-2", assigned_to: "Brian", title: "Other issue" };
assert.deepEqual(
  assignedActiveIssues([issueAssigned, issueOther], actor).map((row) => row.id),
  ["is-1"]
);

const directory: StaffDirectoryMember[] = [
  {
    id: "s-1",
    name: "Brian",
    role: "Team Lead",
    department: "Team Lead",
    email: "brian@fitdog.test",
    phone: null,
    status: "Active",
    notes: null,
    admin_user_id: "tl-prev",
    dashboard_role: "team_leader",
    created_at: now,
    updated_at: now
  },
  {
    id: "s-2",
    name: "Halle",
    role: "Team Lead",
    department: "Team Lead",
    email: "halle@fitdog.test",
    phone: null,
    status: "Active",
    notes: null,
    admin_user_id: "tl-1",
    dashboard_role: "team_leader",
    created_at: now,
    updated_at: now
  }
];

const earlier = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const notes = previousTeamLeadShiftNotes(
  [
    log({
      id: "n-halle",
      subject: "My current note",
      status: "Open",
      submitted_by: "Halle",
      created_by: "Halle",
      created_at: now
    }),
    log({
      id: "n-brian-1",
      subject: "Handoff: watch Milo",
      status: "Open",
      submitted_by: "Brian",
      created_by: "Brian",
      created_at: earlier,
      details: "Limping on arrival"
    }),
    log({
      id: "n-brian-2",
      subject: "Water station filled",
      status: "Open",
      submitted_by: "Brian",
      created_by: "Brian",
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    })
  ],
  actor,
  directory
);
assert.equal(notes.previousLeadName, "Brian");
assert.equal(notes.notes[0].id, "n-brian-1");
assert.equal(notes.notes.some((note) => note.id === "n-halle"), false);

const workItem = openLogToWorkItem(openAssigned);
assert.equal(workItem.kind, "open_log");
assert.equal(workItem.hrefTab, "crossover_communication");
assert.deepEqual(parseWorkItemId(workItem.id), { kind: "open_log", sourceId: "ol-1" });
assert.ok(availableActionsForKind("open_log").includes("resolved"));
assert.ok(availableActionsForKind("open_log").includes("in_progress"));

console.log("team-lead-my-shift: ok");
