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
assert.equal(merged.rows.length, 2);
const luna = merged.rows.find((row) => row.gingrAnimalId === "a-1");
assert.equal(luna?.checkedIn, true);
assert.equal(luna?.reservationId, "res-1");
assert.equal(luna?.isAppointment, true);
assert.equal(luna?.isUpcoming, false);
assert.equal(merged.rows.find((row) => row.reservationId === "res-3")?.gingrAnimalId, "a-2");

const checkedOut = mergeRosterSources(
  [
    {
      reservation_id: "res-out",
      animal: { id: "a-9", name: "Atlas" },
      reservation_type: { type: "Daycare" },
      check_in_date: "2026-10-14T08:00:00-07:00",
      check_out_date: "2026-10-14T12:00:00-07:00"
    }
  ],
  [],
  "2026-10-14"
);
assert.equal(checkedOut.rows.length, 1);
assert.equal(checkedOut.rows[0]?.checkedIn, false);
assert.equal(checkedOut.rows[0]?.wentHomeToday, true);
assert.equal(checkedOut.rows[0]?.checkedOutAt, "2026-10-14T12:00:00-07:00");

// Shapes from the 10/15 Gingr report: dogs that came and left must never read as "Coming today".
const day = mergeRosterSources(
  [
    {
      reservation_id: "r-in",
      animal: { id: "d-in", name: "Bodhi" },
      reservation_type: { type: "Overnight: Suite" },
      start_date: "2026-10-14T09:30:00-07:00",
      check_in_date: "2026-10-14T10:45:48-07:00"
    },
    {
      reservation_id: "r-race",
      animal: { id: "d-race", name: "Pepper" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-15T08:00:00-07:00",
      check_in_date: "2026-10-15T08:05:00-07:00"
    }
  ],
  [
    {
      reservation_id: "r-daycare",
      animal: { id: "d-daycare", name: "Milo" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-15T07:30:00-07:00",
      check_in_date: "2026-10-15T07:41:00-07:00",
      check_out_date: "2026-10-15T17:02:00-07:00"
    },
    {
      reservation_id: "r-board",
      animal: { id: "d-board", name: "Dougal" },
      reservation_type: { type: "Overnight: Den" },
      start_date: "2026-10-11T07:00:00-07:00",
      check_in_date: "2026-10-11T07:40:02-07:00",
      check_out_date: "2026-10-15T18:46:25-07:00"
    },
    {
      reservation_id: "r-expected",
      animal: { id: "d-expected", name: "Rosie" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-15T09:00:00-07:00",
      confirmed_date: "2026-10-12T10:00:00-07:00"
    },
    {
      reservation_id: "r-race",
      animal: { id: "d-race", name: "Pepper" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-15T08:00:00-07:00",
      check_in_date: "2026-10-15T08:05:00-07:00",
      check_out_date: "2026-10-15T16:10:00-07:00"
    },
    {
      reservation_id: "r-am",
      animal: { id: "d-split", name: "Koda" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-15T07:00:00-07:00",
      check_in_date: "2026-10-15T07:10:00-07:00",
      check_out_date: "2026-10-15T11:00:00-07:00"
    },
    {
      reservation_id: "r-groom",
      animal: { id: "d-split", name: "Koda" },
      reservation_type: { type: "Grooming" },
      start_date: "2026-10-15T15:00:00-07:00"
    },
    {
      reservation_id: "r-next",
      animal: { id: "d-daycare", name: "Milo" },
      reservation_type: { type: "Daycare" },
      start_date: "2026-10-17T07:30:00-07:00"
    }
  ],
  "2026-10-15"
);
const byName = new Map(day.rows.map((row) => [row.dogName, row]));
assert.equal(byName.get("Bodhi")?.checkedIn, true);
assert.equal(byName.get("Bodhi")?.checkedInAt, "2026-10-14T10:45:48-07:00");
assert.equal(byName.get("Milo")?.wentHomeToday, true);
assert.equal(byName.get("Milo")?.isArrivalToday, false);
assert.equal(byName.get("Milo")?.isUpcoming, false);
assert.equal(byName.get("Milo")?.checkedOutAt, "2026-10-15T17:02:00-07:00");
assert.equal(byName.get("Dougal")?.wentHomeToday, true);
assert.equal(byName.get("Dougal")?.checkedIn, false);
assert.equal(byName.get("Rosie")?.isArrivalToday, true);
assert.equal(byName.get("Pepper")?.checkedIn, false, "a check-out from either pull beats the checked-in pull");
assert.equal(byName.get("Pepper")?.wentHomeToday, true);
assert.equal(byName.get("Koda")?.isArrivalToday, true, "a later same-day appointment still makes the dog expected");
assert.equal(byName.get("Koda")?.wentHomeToday, false);
assert.deepEqual(
  day.rows.map((row) => row.dogName),
  ["Bodhi", "Koda", "Rosie", "Dougal", "Milo", "Pepper"]
);
const dayCounts = countRoster(day.rows, { submittedToday: 0, unresolvedFollowUps: 0 });
assert.equal(dayCounts.checkedIn, 1);
assert.equal(dayCounts.arrivals, 2);
assert.equal(dayCounts.wentHome, 3);
assert.equal(dayCounts.upcoming, 0);
assert.equal(filterRoster(day.rows, { filter: "went_home" }).length, 3);
assert.equal(filterRoster(day.rows, { filter: "arriving" }).length, 2);

const atlas = mergeRosterSources(
  [
    {
      reservation_id: "211893",
      animal: { id: "7456", name: "Atlas" },
      reservation_type: { type: "Trainer Led Hike | Group Training" },
      start_date: "2026-10-14T08:40:00-07:00",
      check_in_date: "2026-10-14T08:40:00-07:00"
    }
  ],
  [
    {
      reservation_id: "211520",
      animal: { id: "7456", name: "Atlas" },
      reservation_type: { type: "Trainer Led Hike | Group Training" },
      start_date: "2026-10-21T00:00:00-07:00"
    },
    {
      reservation_id: "211893",
      animal: { id: "7456", name: "Atlas" },
      reservation_type: { type: "Trainer Led Hike | Group Training" },
      start_date: "2026-10-14T08:40:00-07:00",
      check_in_date: "2026-10-14T08:40:00-07:00"
    }
  ],
  "2026-10-14"
);
assert.equal(atlas.rows.length, 1);
assert.equal(atlas.rows[0]?.checkedIn, true);
assert.equal(atlas.rows[0]?.reservationId, "211893");
assert.equal(atlas.rows[0]?.isUpcoming, false);

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
assert.match(panel, /Sync Now/);
assert.match(panel, /tlDogPhotoCandidates/);
assert.doesNotMatch(panel, /localStorage/);
assert.match(panel, /Select an ear finding before submitting/);
// Single form: every category renders at once — no wizard steps or Next navigation.
assert.doesNotMatch(panel, /wizard\.step|stepError|Next:|STEPS/);
assert.match(panel, /<FindingStep title="Ears"/);
assert.match(panel, /<FindingStep title="Nails"/);
assert.match(panel, /<FindingStep title="Coat and grooming"/);
assert.match(panel, /<FindingStep title="Physical findings"/);
assert.match(panel, /body-checks__form-actions/);
// Double-submit protection and confirmed-save success messaging.
assert.match(panel, /if \(!wizard \|\| submitting\) return/);
assert.match(panel, /disabled=\{submitting\}/);
assert.match(panel, /idempotencyKey: wizard\.idempotencyKey/);
assert.match(panel, /Body check saved for/);
assert.match(panel, /setSuccessMessage/);

// Multiple findings across categories stay selected together in one form state,
// and "no concerns" findings cannot conflict with concerns (existing rules).
{
  let ears = toggleFinding(EAR_FINDINGS, [], "redness");
  ears = toggleFinding(EAR_FINDINGS, ears, "ticks");
  let nails = toggleFinding(NAIL_FINDINGS, [], "too_long");
  nails = toggleFinding(NAIL_FINDINGS, nails, "needs_trim");
  const body = reconcileBody(
    toggleFinding(BODY_GROOMING_FINDINGS, toggleFinding(BODY_GROOMING_FINDINGS, [], "needs_bath"), "matted"),
    toggleFinding(BODY_PHYSICAL_FINDINGS, [], "puncture")
  );
  assert.deepEqual(ears, ["redness", "ticks"]);
  assert.deepEqual(nails, ["too_long", "needs_trim"]);
  assert.deepEqual(body.grooming, ["needs_bath", "matted"]);
  assert.deepEqual(body.physical, ["puncture"]);
  const saved = validateInspection({
    gingrAnimalId: "dog-9",
    dogName: "Bella",
    ears,
    nails,
    bodyGrooming: body.grooming,
    bodyPhysical: body.physical,
    notes: "Recheck left ear tomorrow.",
    severity: "needs_follow_up",
    followUpKinds: ["bath", "supervisor_review"],
    idempotencyKey: "idem-multi-category"
  });
  assert.equal(saved.ok, true);
  if (saved.ok) {
    assert.deepEqual(saved.value.ears.map((item) => item.label), ["Redness / Irritation", "Ticks"]);
    assert.deepEqual(saved.value.nails.map((item) => item.label), ["Too Long", "Needs Trim"]);
    assert.deepEqual(saved.value.bodyGrooming.map((item) => item.label), ["Needs Bath", "Matted Hair"]);
    assert.deepEqual(saved.value.bodyPhysical.map((item) => item.label), ["Puncture Wound"]);
    assert.equal(saved.value.notes, "Recheck left ear tomorrow.");
  }
  // "No concerns" cannot coexist with a concern in the same category.
  assert.deepEqual(toggleFinding(EAR_FINDINGS, ["redness"], "clean_normal"), ["clean_normal"]);
  assert.deepEqual(reconcileBody(["no_issues"], ["puncture"]).grooming, []);
}
const css = readFileSync(join(root, "components/admin/body-checks/body-checks.css"), "utf8");
assert.match(css, /var\(--text-primary/);
assert.match(css, /var\(--surface/);
assert.doesNotMatch(css, /background:\s*#fff/);

const reportsRoute = readFileSync(join(root, "app/api/admin/body-checks/reports/route.ts"), "utf8");
assert.match(reportsRoute, /gate\.actor/);
assert.doesNotMatch(reportsRoute, /body\.staffUserId|body\.staff_user_id/);

console.log("body-checks: all checks passed");
