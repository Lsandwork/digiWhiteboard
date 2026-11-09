import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  actorHomeDepartment,
  messageDepartmentLabel,
  previousDepartmentShiftNotes,
  type ShiftActor
} from "../lib/ops-command-center/team-lead-shift";
import type { CrossoverMessage, StaffDirectoryMember } from "../lib/staff/admin-ops";

const panel = readFileSync(join(process.cwd(), "components/admin/ops-command-center/OpsCommandCenterPanel.tsx"), "utf8");
const dash = readFileSync(join(process.cwd(), "components/admin/ops-command-center/MyShiftDashboard.tsx"), "utf8");
const snapshot = readFileSync(join(process.cwd(), "lib/ops-command-center/snapshot.ts"), "utf8");
const bulk = readFileSync(join(process.cwd(), "lib/staff/bulk-shift-log.ts"), "utf8");

assert.match(dash, /Shift Entry Log/);
assert.match(panel, /create_crossover_bulk/);
assert.match(panel, /departmentHandoff/);
assert.match(dash, /handoff notes/);
assert.match(dash, /All departments/);
assert.doesNotMatch(dash, /Same department only/);
assert.doesNotMatch(panel, /Same department only/);
assert.match(snapshot, /departmentHandoff:/);
assert.match(snapshot, /previousDepartmentShiftNotes/);
assert.match(bulk, /from_department/);

const directory: StaffDirectoryMember[] = [
  {
    id: "1",
    name: "Angelica",
    email: "angelica@fitdog.com",
    phone: null,
    role: "Coordinator",
    department: "Front Desk",
    dashboard_role: "front_desk_coordinator",
    admin_user_id: "a1",
    status: "Active",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "2",
    name: "Brian",
    email: "brian@fitdog.com",
    phone: null,
    role: "Team Lead",
    department: "Team Lead",
    dashboard_role: "team_leader",
    admin_user_id: "b1",
    status: "Active",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "3",
    name: "Maria",
    email: "maria@fitdog.com",
    phone: null,
    role: "Coordinator",
    department: "Front Desk",
    dashboard_role: "front_desk_coordinator",
    admin_user_id: "m1",
    status: "Active",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "4",
    name: "Ivy",
    email: "ivy@fitdog.com",
    phone: null,
    role: "Groomer",
    department: "Grooming",
    dashboard_role: "groomer",
    admin_user_id: "g1",
    status: "Active",
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  }
];

const today = new Date().toISOString();
const yesterday = new Date(Date.now() - 36 * 3600_000).toISOString();

const messages = [
  {
    id: "fd1",
    subject: "FD note",
    from_department: "Front Desk",
    department_area: "Front Desk",
    submitted_by: "Maria",
    created_by: "maria@fitdog.com",
    created_at: today,
    details: "Pass keys",
    message: "Pass keys",
    log_type: "General Shift Note",
    status: "Open"
  },
  {
    id: "tl1",
    subject: "TL note",
    from_department: "Team Lead",
    department_area: "Team Lead",
    submitted_by: "Brian",
    created_by: "brian@fitdog.com",
    created_at: today,
    details: "Yard note",
    message: "Yard note",
    log_type: "General Shift Note",
    status: "Open"
  },
  {
    id: "gr1",
    subject: "Grooming note",
    from_department: "Grooming",
    department_area: "Grooming",
    submitted_by: "Ivy",
    created_by: "ivy@fitdog.com",
    created_at: today,
    details: "Baths running late",
    message: "Baths running late",
    log_type: "General Shift Note",
    status: "Open"
  },
  {
    id: "old1",
    subject: "Yesterday note",
    from_department: "Front Desk",
    department_area: "Front Desk",
    submitted_by: "Maria",
    created_by: "maria@fitdog.com",
    created_at: yesterday,
    details: "Should not show",
    message: "Should not show",
    log_type: "General Shift Note",
    status: "Open"
  }
] as unknown as CrossoverMessage[];

const actor: ShiftActor = { email: "angelica@fitdog.com", name: "Angelica", adminUserId: "a1", directoryName: "Angelica" };
assert.equal(actorHomeDepartment(actor, directory), "Front Desk");
assert.equal(messageDepartmentLabel(messages[0], directory), "Front Desk");
assert.equal(messageDepartmentLabel(messages[1], directory), "Team Lead");

const handoff = previousDepartmentShiftNotes(messages, actor, directory, "Front Desk");
assert.equal(handoff.notes.length, 3);
assert.deepEqual(
  handoff.notes.map((note) => note.id).sort(),
  ["fd1", "gr1", "tl1"]
);
assert.ok(handoff.notes.every((note) => note.id !== "old1"));
assert.ok(handoff.notes.some((note) => note.department === "Team Lead"));
assert.ok(handoff.notes.some((note) => note.department === "Grooming"));

const tlActor: ShiftActor = { email: "brian@fitdog.com", name: "Brian", adminUserId: "b1", directoryName: "Brian" };
const tlHandoff = previousDepartmentShiftNotes(messages, tlActor, directory, "Team Lead");
assert.equal(tlHandoff.notes.length, 3);

console.log("my shift department handoff tests passed");
