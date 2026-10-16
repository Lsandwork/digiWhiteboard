import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLiveFloor, cleanWarning, floorCategory } from "@/lib/ops-command-center/live-floor";
import { buildActionQueue } from "@/lib/ops-command-center/action-queue";
import { splitOperationsAlerts } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import type { OperationsAlert } from "@/lib/fitdog-ops/types";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";

const businessDate = "2026-10-15";
const now = Date.parse("2026-10-15T18:00:00-07:00");

function reservation(input: {
  id: string;
  dog: string;
  type: string;
  start: string;
  end: string;
  checkIn?: string | null;
  checkOut?: string | null;
  allergies?: string;
  medicines?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}) {
  return {
    reservation_id: input.id,
    start_date: input.start,
    end_date: input.end,
    check_in_date: input.checkIn ?? null,
    check_out_date: input.checkOut ?? null,
    confirmed_date: input.confirmed === false ? null : "2026-10-01T09:00:00-07:00",
    cancelled_date: input.cancelled ? "2026-10-14T09:00:00-07:00" : null,
    reservation_type: { id: "1", type: input.type },
    animal: { id: `a-${input.id}`, name: input.dog, breed: "Mix" },
    owner: { id: "o1", first_name: "Pat", last_name: "Lee", email: "pat@example.com", cell_phone: "555-555-1234" },
    warnings: { allergies: input.allergies ?? "<p>none</p>", medicines: input.medicines ?? "" },
    notes: { reservation_notes: "", animal_notes: "" }
  };
}

// Gingr warning fields are HTML and usually say "none".
assert.equal(cleanWarning("<p>none</p>"), null);
assert.equal(cleanWarning("N/A"), null);
assert.equal(cleanWarning("&nbsp;"), null);
assert.equal(cleanWarning("No allergies."), null);
assert.equal(cleanWarning("<p>Oatmeal&nbsp;</p>"), "Oatmeal");

assert.equal(floorCategory("Overnight Suite"), "boarding");
assert.equal(floorCategory("Petite Suite"), "boarding");
assert.equal(floorCategory("Full Day Daycare"), "daycare");
assert.equal(floorCategory("Hourly"), "daycare");
assert.equal(floorCategory("Training Only"), "training");
assert.equal(floorCategory("Adventure Hikes"), "outing");

const checkedIn = [
  reservation({ id: "1", dog: "Archie", type: "Overnight Suite", start: "2026-10-13T08:00:00-07:00", end: "2026-10-17T11:00:00-07:00", checkIn: "2026-10-13T08:05:00-07:00", allergies: "Potentially beef" }),
  reservation({ id: "2", dog: "Dessa", type: "Full Day Daycare", start: "2026-10-15T08:00:00-07:00", end: "2026-10-15T19:00:00-07:00", checkIn: "2026-10-15T08:10:00-07:00" }),
  reservation({ id: "3", dog: "Bolt", type: "Full Day Daycare", start: "2026-10-15T08:00:00-07:00", end: "2026-10-15T17:00:00-07:00", checkIn: "2026-10-15T08:10:00-07:00" }),
  reservation({ id: "4", dog: "Mabel", type: "Den", start: "2026-10-10T08:00:00-07:00", end: "2026-10-14T11:00:00-07:00", checkIn: "2026-10-10T08:00:00-07:00" }),
  reservation({ id: "5", dog: "Gone", type: "Hourly", start: "2026-10-15T08:00:00-07:00", end: "2026-10-15T12:00:00-07:00", checkIn: "2026-10-15T08:00:00-07:00", checkOut: "2026-10-15T11:00:00-07:00" })
];
const today = [
  ...checkedIn,
  reservation({ id: "6", dog: "Late Lou", type: "Full Day Daycare", start: "2026-10-15T16:00:00-07:00", end: "2026-10-15T20:00:00-07:00" }),
  reservation({ id: "7", dog: "Soon Sam", type: "Training Only", start: "2026-10-15T18:15:00-07:00", end: "2026-10-15T19:00:00-07:00" }),
  reservation({ id: "8", dog: "Cancelled Cal", type: "Full Day Daycare", start: "2026-10-15T09:00:00-07:00", end: "2026-10-15T17:00:00-07:00", cancelled: true })
];
const tomorrow = [
  reservation({ id: "9", dog: "Tia", type: "Overnight Suite", start: "2026-10-16T09:00:00-07:00", end: "2026-10-19T11:00:00-07:00" }),
  reservation({ id: "10", dog: "Ned", type: "Full Day Daycare", start: "2026-10-16T08:00:00-07:00", end: "2026-10-16T18:00:00-07:00", confirmed: false }),
  reservation({ id: "1", dog: "Archie", type: "Overnight Suite", start: "2026-10-13T08:00:00-07:00", end: "2026-10-17T11:00:00-07:00", checkIn: "2026-10-13T08:05:00-07:00" })
];

const floor = buildLiveFloor({ checkedIn, today, tomorrow, businessDate, now });

assert.deepEqual(
  floor.onSite.map((dog) => dog.dogName),
  ["Archie", "Bolt", "Dessa", "Mabel"],
  "checked-out and cancelled reservations are not on site"
);
assert.equal(floor.onSiteByCategory.boarding, 2);
assert.equal(floor.onSiteByCategory.daycare, 2);
assert.deepEqual(floor.pickupsRemaining.map((dog) => dog.dogName), ["Dessa"]);
assert.deepEqual(floor.overduePickups.map((dog) => dog.dogName).sort(), ["Bolt", "Mabel"]);
assert.ok(floor.overduePickups.find((dog) => dog.dogName === "Mabel")?.overstay, "past checkout date is an overstay");
assert.equal(floor.overduePickups.find((dog) => dog.dogName === "Bolt")?.minutesLate, 60);
assert.deepEqual(floor.lateArrivals.map((dog) => dog.dogName), ["Late Lou"]);
assert.deepEqual(floor.arrivalsExpected.map((dog) => dog.dogName), ["Soon Sam"]);
assert.equal(floor.leftToday, 1);
assert.deepEqual(floor.medicalWatch.map((dog) => [dog.dogName, dog.allergies]), [["Archie", "Potentially beef"]]);
assert.equal(floor.tomorrow.arrivals, 2, "dogs already staying are not tomorrow arrivals");
assert.equal(floor.tomorrow.unconfirmed, 1);
assert.deepEqual(floor.tomorrow.boardingArrivals.map((dog) => dog.dogName), ["Tia"]);
assert.ok(!JSON.stringify(floor).includes("pat@example.com"), "owner email never leaves the server");
assert.ok(!JSON.stringify(floor).includes("555-555-1234"), "owner phone never leaves the server");

function alert(type: OperationsAlert["alert_type"], overrides: Partial<OperationsAlert> = {}): OperationsAlert {
  return {
    id: `${type}-${Math.random()}`,
    source: "fitdog",
    source_event_id: null,
    source_record_id: null,
    idempotency_key: type,
    alert_type: type,
    severity: "medium",
    owner_id: null,
    owner_name: "Pat Lee",
    dog_id: null,
    dog_name: "Archie",
    reservation_id: null,
    invoice_id: null,
    transaction_id: null,
    service_name: null,
    service_date: null,
    amount_due: 0,
    amount_paid: 0,
    currency: "USD",
    failure_reason: null,
    payment_attempt_count: 0,
    payment_method_brand: null,
    payment_method_last_four: null,
    status: "new",
    assigned_user_id: null,
    assigned_user_name: null,
    detected_at: "2026-10-15T15:00:00-07:00",
    acknowledged_at: null,
    resolved_at: null,
    follow_up_at: null,
    resolution_type: null,
    resolution_notes: null,
    package_credit_check: {},
    source_url: null,
    created_at: "2026-10-15T15:00:00-07:00",
    updated_at: "2026-10-15T15:00:00-07:00",
    ...overrides
  };
}

function teamLog(overrides: Partial<CrossoverMessage>): CrossoverMessage {
  return {
    id: Math.random().toString(36).slice(2),
    subject: "Note",
    message: "",
    from_department: "Front Desk",
    to_department: "All",
    priority: "Normal",
    status: "Open",
    related_dog_name: null,
    related_owner_name: null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: null,
    template_field_values: null,
    created_by: null,
    assigned_to: null,
    reported_to: null,
    urgent: false,
    created_at: "2026-10-15T09:00:00-07:00",
    updated_at: "2026-10-15T09:00:00-07:00",
    resolved_at: null,
    ...overrides
  };
}

const alerts = [
  alert("FITDOG_NOTIFICATION", { failure_reason: "Pat uploaded documents to account" }),
  alert("FITDOG_NOTIFICATION", { failure_reason: "Old cancellation", detected_at: "2026-08-01T10:00:00-07:00" }),
  alert("CARD_DECLINED", { severity: "critical", amount_due: 82 }),
  alert("FITDOG_SYNC_ERROR", { failure_reason: "Fitdog OAuth failed (403)." })
];

const split = splitOperationsAlerts(alerts);
assert.equal(split.paymentAlerts.length, 2, "owner activity notices are not payment alerts");
assert.equal(split.ownerActivity.length, 2);

const queue = buildActionQueue({
  floor,
  teamLog: [
    teamLog({ subject: "Routine note" }),
    teamLog({ subject: "Gate latch broken", urgent: true }),
    teamLog({ subject: "Call vet", due_at: "2026-10-15T12:00:00-07:00" }),
    teamLog({ subject: "Ancient", created_at: "2026-09-01T09:00:00-07:00" }),
    teamLog({ subject: "Done", status: "Resolved", urgent: true })
  ],
  issues: [],
  followUps: [],
  alerts,
  bodyChecks: [
    {
      id: "bc1",
      dog_name: "Archie",
      owner_name: "Pat Lee",
      severity: "urgent",
      follow_up_kinds: ["owner_communication"],
      staff_name: "Sam",
      inspected_at: "2026-10-15T14:00:00-07:00"
    }
  ],
  notifications: [
    { id: "n1", title: "Shift handoff ready", body: null, priority: "attention", href_tab: null, created_at: "2026-10-15T14:00:00-07:00" }
  ],
  now
});

const titles = queue.actions.map((action) => action.title);
assert.ok(titles.includes("Mabel is past their checkout date"));
assert.ok(titles.includes("Bolt pickup is 1 hr late"));
assert.ok(titles.some((title) => title.startsWith("Late Lou has not arrived")));
assert.ok(titles.includes("Body check follow-up for Archie"));
assert.ok(titles.includes("Gate latch broken"));
assert.ok(titles.includes("Call vet"), "past-due Team Log items need action");
assert.ok(!titles.includes("Routine note"), "routine Team Log notes are not action items");
assert.ok(!titles.includes("Done"), "resolved Team Log items are not action items");
assert.ok(titles.some((title) => title.includes("open over 14 days")), "stale Team Log items are summarized once");
assert.ok(titles.some((title) => title.startsWith("Card declined")));
assert.ok(titles.includes("Fitdog sync reported an error"));
assert.ok(!titles.some((title) => /uploaded documents|Shift handoff ready/i.test(title)), "informational notices stay out of the action list");
assert.equal(queue.actions[0].priority, "critical", "most urgent first");
assert.equal(queue.staleTeamLogCount, 1);
assert.deepEqual(queue.ownerActivity.map((item) => item.summary), ["Pat uploaded documents to account"], "owner activity is limited to 24 hours");

const route = readFileSync("app/api/admin/ops-command-center/route.ts", "utf8");
assert.match(route, /view === "live_floor"/);
assert.match(route, /loadCommandCenterView/);
const dashboard = readFileSync("components/admin/AdminDashboard.tsx", "utf8");
assert.match(dashboard, /tab === "ops_command_center" \? \(\s*<OpsLiveCommandCenter/);
assert.match(dashboard, /mode="my_shift"/, "My Shift keeps the existing panel");
const css = readFileSync("components/admin/ops-command-center/ops-live-command-center.css", "utf8");
assert.match(css, /var\(--surface/);
assert.doesNotMatch(css, /background:\s*#fff/i);

console.log("ops command center live floor tests passed");
