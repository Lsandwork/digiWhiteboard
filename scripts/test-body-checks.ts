import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accessFromLegacyRole, canAccessAdminTab } from "../lib/admin/permissions";
import { getTabLabel } from "../lib/admin/nav-groups";
import { parentHubForTab } from "../lib/admin/super-admin-nav";
import { ADMIN_TABS } from "../lib/admin/types";
import { pacificDayBounds } from "../lib/body-checks/dates";
import {
  BODY_GROOMING_FINDINGS,
  BODY_PHYSICAL_FINDINGS,
  EAR_FINDINGS,
  NAIL_FINDINGS,
  reconcileBody,
  toggleFinding
} from "../lib/body-checks/findings";
import { classifyReservationPage } from "../lib/body-checks/gingr";
import { countRoster, filterRoster, mergeRosterSources } from "../lib/body-checks/roster";
import { validateInspection } from "../lib/body-checks/validation";

const root = process.cwd();

assert.deepEqual(toggleFinding(EAR_FINDINGS, ["clean_normal"], "redness"), ["redness"]);
assert.deepEqual(toggleFinding(EAR_FINDINGS, ["redness", "ticks"], "clean_normal"), ["clean_normal"]);
assert.deepEqual(toggleFinding(EAR_FINDINGS, ["redness"], "ticks"), ["redness", "ticks"]);
assert.deepEqual(toggleFinding(NAIL_FINDINGS, ["good_length"], "too_long"), ["too_long"]);
assert.deepEqual(toggleFinding(BODY_GROOMING_FINDINGS, ["needs_bath"], "matted"), ["needs_bath", "matted"]);
assert.deepEqual(reconcileBody(["no_issues"], ["puncture"]), { grooming: [], physical: ["puncture"] });
assert.deepEqual(reconcileBody(["no_issues"], []), { grooming: ["no_issues"], physical: [] });

const base = {
  gingrAnimalId: "dog-1",
  dogName: "Luna",
  ears: ["clean_normal"],
  nails: ["good_length"],
  bodyGrooming: ["no_issues"],
  bodyPhysical: [] as string[],
  severity: "routine",
  idempotencyKey: "idem-1"
};

assert.equal(validateInspection({ ...base, ears: ["other"] }).ok, false);
assert.equal(validateInspection({ ...base, ears: ["other"], earOther: "Wax in the left ear" }).ok, true);
assert.equal(validateInspection({ ...base, notes: "x".repeat(2001) }).ok, false);
assert.equal(validateInspection({ ...base, gingrAnimalId: "  " }).ok, false);
assert.equal(validateInspection({ ...base, severity: "needs_follow_up" }).ok, false);
const both = validateInspection({
  ...base,
  bodyGrooming: ["needs_bath", "matted", "no_issues"],
  severity: "needs_follow_up",
  followUpKinds: ["bath"]
});
assert.equal(both.ok, true);
if (both.ok) {
  assert.deepEqual(
    both.value.bodyGrooming.map((item) => item.id),
    ["needs_bath", "matted"]
  );
  assert.equal(both.value.followUpKinds.includes("bath"), true);
}

const merged = mergeRosterSources(
  [
    {
      id: "res-1",
      animal_id: "a-1",
      animal_name: "Luna",
      owner_name: "Jessica Miller",
      type: "Daycare",
      check_in_stamp: "2026-10-14 08:00:00"
    }
  ],
  [
    {
      id: "res-1",
      animal_id: "a-1",
      animal_name: "Luna",
      owner_name: "Jessica Miller",
      type: "Daycare",
      start_date: "2026-10-14"
    },
    {
      id: "res-2",
      animal_id: "a-1",
      animal_name: "Luna",
      type: "Grooming",
      start_date: "2026-10-14 15:00:00"
    },
    {
      id: "res-3",
      animal_id: "a-2",
      animal_name: "Luna",
      owner_name: "Other Owner",
      type: "Boarding",
      start_date: "2026-10-16"
    }
  ],
  "2026-10-14"
);
assert.equal(merged.rows.length, 3);
assert.equal(merged.rows.filter((row) => row.gingrAnimalId === "a-1" && row.checkedIn).length, 1);
assert.equal(merged.rows.find((row) => row.reservationId === "res-2")?.isAppointment, true);
assert.equal(merged.rows.find((row) => row.reservationId === "res-3")?.gingrAnimalId, "a-2");

const counts = countRoster(merged.rows, { submittedToday: 2, unresolvedFollowUps: 1 });
assert.equal(counts.dogs, 2);
assert.equal(counts.checkedIn, 1);
assert.equal(counts.appointments, 1);
assert.equal(counts.upcoming, 1);
assert.equal(counts.submittedToday, 2);
assert.equal(filterRoster(merged.rows, { filter: "checked_in" }).length, 1);
assert.equal(filterRoster(merged.rows, { query: "other owner" }).length, 1);
assert.equal(filterRoster(merged.rows, { filter: "follow_up", followUpAnimalIds: new Set(["a-2"]) }).length, 1);

assert.equal(classifyReservationPage(2, 3, "same", "same"), "done");
assert.equal(classifyReservationPage(1, 0, "", ""), "done");
assert.equal(classifyReservationPage(8, 2, "new", "old", 8), "capped");
assert.equal(classifyReservationPage(1, 2, "new", ""), "append");

const october = pacificDayBounds("2026-10-14");
const january = pacificDayBounds("2026-01-15");
assert.equal(october?.start.startsWith("2026-10-14T07:00:00"), true);
assert.equal(january?.start.startsWith("2026-01-15T08:00:00"), true);

assert.equal((ADMIN_TABS as readonly string[]).includes("body_checks"), true);
assert.equal(getTabLabel("body_checks"), "Body Checks");
assert.equal(parentHubForTab("body_checks"), "sa_floor_hub");
for (const role of ["daycare", "team_leader", "groomer", "front_desk_coordinator", "manager_admin"]) {
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role), "body_checks", role, "staff"),
    true,
    role
  );
}
assert.equal(canAccessAdminTab(accessFromLegacyRole("m", "m@fitdog.test", "marketing"), "body_checks", "marketing", "staff"), false);
assert.equal(canAccessAdminTab(accessFromLegacyRole("d", "d@fitdog.test", "daycare"), "body_checks", "daycare", "lobby"), false);

const migration = readFileSync(join(root, "supabase/migrations/097_body_checks.sql"), "utf8");
assert.match(migration, /idempotency_key text not null/);
assert.match(migration, /body_check_reports_idempotency_idx/);
assert.doesNotMatch(migration, /unique \(gingr_animal_id/);
assert.match(migration, /enable row level security/);
assert.match(migration, /using \(false\) with check \(false\)/);
assert.match(migration, /grant select, insert, update, delete on table public.body_check_reports to service_role/);
assert.match(migration, /body_check_follow_up_events/);

const gingr = readFileSync(join(root, "lib/body-checks/gingr.ts"), "utf8");
assert.match(gingr, /\/api\/v1\/reservations/);
assert.match(gingr, /stale: true/);
assert.match(gingr, /rows: cache\.rows/);
assert.doesNotMatch(gingr, /\/api\/v1\/appointments/);

const dashboard = readFileSync(join(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.match(dashboard, /tab === "body_checks" \? <BodyChecksPanel/);
const panel = readFileSync(join(root, "components/admin/body-checks/BodyChecksPanel.tsx"), "utf8");
assert.match(panel, /Submit Body Check Report/);
assert.doesNotMatch(panel, /localStorage/);

const reportsRoute = readFileSync(join(root, "app/api/admin/body-checks/reports/route.ts"), "utf8");
assert.match(reportsRoute, /gate\.actor/);
assert.doesNotMatch(reportsRoute, /body\.staffUserId|body\.staff_user_id/);

console.log("body-checks: all checks passed");
