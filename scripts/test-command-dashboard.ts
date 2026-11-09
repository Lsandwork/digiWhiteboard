import assert from "node:assert/strict";
import { buildLiveFloor } from "@/lib/ops-command-center/live-floor";
import { buildCommandDashboard, buildOperationsTimeline } from "@/lib/ops-command-center/command-dashboard";
import type { ActiveIssue, StaffDirectoryMember } from "@/lib/staff/admin-ops";

function reservation(partial: Record<string, unknown>) {
  return {
    reservation_id: partial.id,
    animal: { id: partial.animalId, name: partial.name, breed: "Mix" },
    owner: { first_name: "Pat", last_name: "Owner" },
    reservation_type: { type: partial.service },
    start_date: partial.start,
    end_date: partial.end,
    check_in_date: partial.checkedIn ?? null,
    check_out_date: partial.checkedOut ?? null,
    warnings: { allergies: partial.allergy ?? "", medicines: "" }
  };
}

const now = Date.parse("2026-11-08T20:00:00-08:00");
const floor = buildLiveFloor({
  businessDate: "2026-11-08",
  now,
  checkedIn: [
    reservation({
      id: "r1",
      animalId: "a1",
      name: "Rex",
      service: "Daycare",
      start: "2026-11-08T08:00:00-08:00",
      end: "2026-11-08T17:00:00-08:00",
      checkedIn: "2026-11-08T08:05:00-08:00"
    }),
    reservation({
      id: "r2",
      animalId: "a2",
      name: "Daisy",
      service: "Overnight Boarding",
      start: "2026-11-07T18:00:00-08:00",
      end: "2026-11-09T10:00:00-08:00",
      checkedIn: "2026-11-07T18:00:00-08:00"
    })
  ],
  today: [],
  tomorrow: []
});

assert.equal(floor.onSite.length, 2);
const timeline = buildOperationsTimeline(floor);
assert.ok(timeline.some((item) => item.detail.includes("Rex")));

const issues: ActiveIssue[] = [
  {
    id: "i1",
    title: "Broken latch",
    category: "Facility Issue",
    source: "Manual",
    source_id: null,
    source_table: null,
    reported_by: "Jamie",
    assigned_to: "Mike",
    priority: "High",
    reported_at: "2026-11-08T12:00:00.000Z",
    due_at: "2026-11-07T12:00:00.000Z",
    status: "Open",
    notes: null,
    resolution_notes: null,
    related_owner_name: null,
    related_dog_name: null,
    created_at: "2026-11-08T12:00:00.000Z",
    updated_at: "2026-11-08T12:00:00.000Z",
    resolved_at: null
  }
];

const directory: StaffDirectoryMember[] = [
  {
    id: "s1",
    name: "Sarah Chen",
    role: "Front Desk",
    department: "Front Desk",
    email: "sarah@fitdogclub.com",
    phone: null,
    status: "Active",
    notes: null,
    admin_user_id: null,
    dashboard_role: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  }
];

const dashboard = buildCommandDashboard({
  floor,
  issues,
  directory,
  sources: [{ key: "gingr", label: "Gingr", ok: true, detail: null }],
  actions: [],
  now
});

assert.equal(dashboard.locationTracking, "unavailable");
assert.equal(dashboard.health, "operational");
assert.equal(dashboard.kpis[0]?.id, "dogs_today");
assert.ok(dashboard.kpis[0]!.value >= 2);
assert.equal(dashboard.issues.open, 1);
assert.equal(dashboard.team[0]?.name, "Sarah Chen");
assert.equal(dashboard.kpis.every((kpi) => typeof kpi.value === "number"), true);

console.log("command dashboard tests passed");
