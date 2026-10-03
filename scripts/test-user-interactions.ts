import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ActiveIssue, CrossoverMessage, OwnerFollowUp, StaffOpsState } from "../lib/staff/admin-ops";
import { capStaffOpsListPayload } from "../lib/staff/admin-ops";
import {
  assignmentMatchesActor,
  dueLabelFor,
  employeeStatusLabel,
  filterArchiveInteractions,
  filterCompletedToday,
  filterMyItems,
  filterOpenInteractions,
  filterOverdueInteractions,
  isOverdueDueAt,
  listUnifiedInteractions,
  pacificTodayKey,
  retainUnresolvedThenCapClosed,
  searchInteractions,
  staffPriorityFromEmployee
} from "../lib/staff/user-interactions";

function isoDaysAgo(days: number, hourUtc = 18) {
  const date = new Date("2026-10-02T18:00:00.000Z");
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date.toISOString();
}

function note(partial: Partial<CrossoverMessage> & Pick<CrossoverMessage, "id" | "subject" | "status">): CrossoverMessage {
  return {
    message: partial.details ?? partial.message ?? "",
    details: partial.details ?? partial.message ?? "",
    log_type: "General Shift Note",
    from_department: "Front Desk",
    to_department: "Front Desk",
    priority: "Normal",
    related_dog_name: null,
    related_owner_name: null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: null,
    template_id: null,
    template_field_values: null,
    created_by: "sarah@fitdog.test",
    submitted_by: "Sarah",
    assigned_to: "Sarah",
    assigned_team: null,
    reported_to: null,
    department_area: "Front Desk",
    due_at: null,
    reminder_at: null,
    needs_management_review: false,
    linked_owner_follow_up_id: null,
    linked_active_issue_id: null,
    management_alerted_at: null,
    urgent: false,
    created_at: isoDaysAgo(0),
    updated_at: isoDaysAgo(0),
    resolved_at: null,
    archived_at: null,
    resolution_notes: null,
    ...partial
  };
}

function emptyState(messages: CrossoverMessage[], followUps: OwnerFollowUp[] = [], issues: ActiveIssue[] = []): StaffOpsState {
  return {
    crossover_messages: messages,
    crossover_message_replies: [],
    owner_follow_ups: followUps,
    active_issues: issues,
    activity_logs: [],
    staff_directory: [],
    notifications: []
  };
}

assert.equal(employeeStatusLabel("Active"), "Open");
assert.equal(employeeStatusLabel("Scheduled"), "Open");
assert.equal(employeeStatusLabel("In Progress"), "In progress");
assert.equal(employeeStatusLabel("Waiting on Owner"), "Waiting");
assert.equal(employeeStatusLabel("Pending Review"), "Waiting");
assert.equal(employeeStatusLabel("Needs Management Review"), "Waiting");
assert.equal(employeeStatusLabel("Resolved"), "Done");
assert.equal(employeeStatusLabel("Check Out"), "Done");
assert.equal(employeeStatusLabel("Archived"), "Done");
assert.equal(staffPriorityFromEmployee("Urgent"), "Urgent");
assert.equal(staffPriorityFromEmployee("High"), "High");
assert.equal(staffPriorityFromEmployee("Normal"), "Normal");

const oldOpen = note({
  id: "old-open",
  subject: "Old open note",
  status: "Open",
  created_at: isoDaysAgo(200)
});
const newerClosed = Array.from({ length: 130 }, (_, index) =>
  note({
    id: `closed-${index}`,
    subject: `Closed ${index}`,
    status: "Resolved",
    created_at: isoDaysAgo(index),
    resolved_at: isoDaysAgo(index)
  })
);
const newestFirst = [oldOpen, ...newerClosed].sort(
  (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
const fullState = emptyState(newestFirst);
const openFromFull = filterOpenInteractions(listUnifiedInteractions(fullState));
assert.equal(openFromFull.some((item) => item.id === "old-open"), true, "TEST 1/2: old open remains when using the full Open dataset");

const cappedClassic = capStaffOpsListPayload(fullState);
assert.equal(
  filterOpenInteractions(listUnifiedInteractions(cappedClassic)).some((item) => item.id === "old-open"),
  false,
  "documents why Open must not use the 120 payload cap"
);

const retained = retainUnresolvedThenCapClosed([oldOpen, ...newerClosed], 500);
assert.equal(retained.some((item) => item.id === "old-open" && item.status === "Open"), true, "500-cap path keeps unresolved rows");
const extraUnresolved = Array.from({ length: 520 }, (_, index) =>
  note({ id: `open-${index}`, subject: `Open ${index}`, status: "Open", created_at: isoDaysAgo(index + 1) })
);
const overCap = retainUnresolvedThenCapClosed([...extraUnresolved, ...newerClosed], 500);
assert.equal(overCap.filter((item) => item.status === "Open").length, 520, "unresolved rows are never truncated by the 500 cap");

const createdAt = "2026-08-01T15:00:00.000Z";
const completed = {
  ...oldOpen,
  created_at: createdAt,
  status: "Resolved" as const,
  resolved_at: "2026-10-02T16:00:00.000Z"
};
const completedItems = listUnifiedInteractions(emptyState([completed]));
assert.equal(filterOpenInteractions(completedItems).length, 0, "TEST 3: completed today leaves Open");
assert.equal(filterArchiveInteractions(completedItems)[0]?.id, "old-open");
assert.equal(completedItems[0]?.createdAt, createdAt, "TEST 3: created_at unchanged");
assert.equal(filterCompletedToday(completedItems, new Date("2026-10-02T20:00:00.000Z")).length, 1);

const archived = listUnifiedInteractions(
  emptyState([
    note({
      id: "archived-1",
      subject: "Archived note",
      status: "Archived",
      created_at: createdAt,
      archived_at: "2026-10-02T16:00:00.000Z",
      resolved_at: null
    })
  ])
);
assert.equal(filterArchiveInteractions(archived)[0]?.createdAt, createdAt, "TEST 4: archive keeps created_at");
assert.equal(archived[0]?.archivedAt, "2026-10-02T16:00:00.000Z");

const reopened = listUnifiedInteractions(
  emptyState([
    note({
      id: "reopened-1",
      subject: "Reopened note",
      status: "Open",
      created_at: createdAt,
      resolved_at: null,
      archived_at: null
    })
  ])
);
assert.equal(filterOpenInteractions(reopened)[0]?.createdAt, createdAt, "TEST 5: reopen keeps created_at");
assert.equal(reopened[0]?.resolvedAt, null);

const pacificNow = new Date("2026-10-03T06:30:00.000Z");
assert.equal(pacificTodayKey(pacificNow), "2026-10-02", "TEST 12: 06:30 UTC in October is still Oct 2 in Pacific");
assert.equal(pacificTodayKey(new Date("2026-10-03T08:30:00.000Z")), "2026-10-03", "TEST 12: after Pacific midnight it is Oct 3");
assert.equal(pacificTodayKey(new Date("2026-01-15T07:30:00.000Z")), "2026-01-14", "TEST 12: 07:30 UTC in January is still Jan 14 PST");
assert.equal(pacificTodayKey(new Date("2026-01-15T08:30:00.000Z")), "2026-01-15", "TEST 12: 08:30 UTC in January is Jan 15 PST");
const overdueItem = listUnifiedInteractions(
  emptyState([
    note({
      id: "overdue-1",
      subject: "Overdue note",
      status: "Open",
      due_at: "2026-10-01",
      created_at: createdAt
    })
  ])
)[0];
assert.equal(isOverdueDueAt(overdueItem.dueAt, pacificNow), true, "TEST 6: due yesterday is overdue");
assert.equal(filterOverdueInteractions([overdueItem], pacificNow).length, 1);
assert.match(dueLabelFor("2026-10-01", pacificNow), /Overdue/);

const noDue = listUnifiedInteractions(emptyState([note({ id: "no-due", subject: "No due", status: "Open", due_at: null })]))[0];
assert.equal(isOverdueDueAt(noDue.dueAt, pacificNow), false, "TEST 7: no due date is not overdue");
assert.equal(filterOverdueInteractions([noDue], pacificNow).length, 0);
assert.equal(dueLabelFor(null, pacificNow), "No due date");
assert.equal(dueLabelFor("2026-10-02", pacificNow), "Due today");
assert.equal(dueLabelFor("2026-10-03", pacificNow), "Due tomorrow");

const actor = { name: "Sarah", email: "sarah@fitdog.test" };
const mine = listUnifiedInteractions(
  emptyState([
    note({ id: "mine", subject: "Mine", status: "Open", assigned_to: null, submitted_by: "Sarah" }),
    note({ id: "theirs", subject: "Theirs", status: "Open", assigned_to: "Bernard", submitted_by: "Bernard" })
  ])
);
assert.equal(filterMyItems(mine, actor).map((item) => item.id).join(), "mine", "TEST 10: unassigned creator lands in My items");
assert.equal(assignmentMatchesActor(mine.find((item) => item.id === "mine")!, actor), true);

const duplicateState = emptyState([oldOpen, { ...oldOpen }]);
assert.equal(listUnifiedInteractions(duplicateState).filter((item) => item.id === "old-open").length, 1, "TEST 11: one row per backend id");

const searchable = listUnifiedInteractions(
  emptyState([
    note({
      id: "search-1",
      subject: "Maple update",
      details: "Needs a callback",
      related_owner_name: "Alex",
      related_dog_name: "Maple",
      status: "Open"
    })
  ])
);
assert.equal(searchInteractions(searchable, "maple")[0]?.id, "search-1");
assert.equal(searchInteractions(searchable, "alex")[0]?.id, "search-1");

const followUpValidation = readFileSync("components/admin/UserInteractionsPanel.tsx", "utf8");
assert.match(followUpValidation, /Owner is required for a follow-up/);
assert.match(followUpValidation, /kind === "follow_up" && !owner\.trim\(\)/);
assert.match(followUpValidation, /\+ New interaction/);
assert.match(followUpValidation, /What is this\?/);
assert.match(followUpValidation, /> Note/);
assert.match(followUpValidation, /> Follow-up/);
assert.match(followUpValidation, /> Issue/);
assert.doesNotMatch(followUpValidation, />Check Out</);

const adminOps = readFileSync("lib/staff/admin-ops.ts", "utf8");
assert.match(adminOps, /retainUnresolvedThenCapClosed/);
const moveStart = adminOps.indexOf("export async function moveCrossoverMessages");
const moveEnd = adminOps.indexOf("export async function bulkUpdateCrossoverMessages");
assert.ok(moveStart >= 0 && moveEnd > moveStart);
assert.doesNotMatch(adminOps.slice(moveStart, moveEnd), /created_at:/);
assert.match(adminOps, /Reopened by \$\{actor/);

const route = readFileSync("app/api/admin/staff-operations/route.ts", "utf8");
assert.match(route, /view === "open"/);
assert.match(route, /filterOpenInteractions\(allItems\)/);
assert.doesNotMatch(route.slice(route.indexOf('view === "open"'), route.indexOf('view === "open"') + 800), /capStaffOpsListPayload/);

const occFeed = readFileSync("lib/ops-command-center/adapters/staff-ops-feed.ts", "utf8");
assert.match(occFeed, /hrefTab: "user_interactions"/);
assert.match(occFeed, /hrefTab: "fitdog_alerts"/);

const notify = readFileSync("lib/staff/admin-ops.ts", "utf8");
assert.match(notify, /sendSuperAdminSmsAlertFireAndForget/);
assert.match(notify, /triggerShellyAlertFireAndForget/);

console.log("User Interactions acceptance tests passed.");
