/**
 * Unified User Interactions acceptance tests (logic layer).
 * Run: npx tsx scripts/test-user-interactions.ts
 */
import assert from "node:assert/strict";
import type { CrossoverMessage, StaffOpsState } from "../lib/staff/admin-ops";
import { capStaffOpsListPayload } from "../lib/staff/admin-ops";
import { isStaffOpsStatusOpen } from "../lib/user-interactions/lifecycle";
import {
  applyUserInteractionFilter,
  buildAllUnifiedInteractions,
  capRecordsPreservingOpen,
  filterOpenInteractions
} from "../lib/user-interactions/unified";
import { isOverduePacificDueDate, pacificTodayKey } from "../lib/user-interactions/pacific";

function note(partial: Partial<CrossoverMessage>): CrossoverMessage {
  return {
    id: partial.id ?? "n1",
    subject: "S",
    message: "D",
    details: "D",
    from_department: "Front Desk",
    to_department: "Front Desk",
    priority: "Normal",
    status: "Open",
    related_dog_name: null,
    related_owner_name: null,
    related_route: null,
    traffic_weather_issue: null,
    template_title: null,
    created_by: "staff@fitdog.com",
    submitted_by: "Staff",
    assigned_to: "Staff",
    assigned_team: null,
    reported_to: null,
    urgent: false,
    created_at: partial.created_at ?? "2020-01-01T12:00:00.000Z",
    updated_at: partial.updated_at ?? partial.created_at ?? "2020-01-01T12:00:00.000Z",
    resolved_at: null,
    ...partial
  } as CrossoverMessage;
}

// TEST 2 — old open item beyond 120 newer records
{
  const oldOpen = note({ id: "old-open", status: "Open", created_at: "2020-06-01T12:00:00.000Z" });
  const newer = Array.from({ length: 150 }, (_, i) =>
    note({ id: `new-${i}`, status: "Resolved", created_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`, resolved_at: "2026-01-15T12:00:00.000Z" })
  );
  const state: StaffOpsState = {
    crossover_messages: [oldOpen, ...newer],
    crossover_message_replies: [],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: [],
    notifications: []
  };
  const capped = capStaffOpsListPayload(state);
  assert.ok(capped.crossover_messages.some((m) => m.id === "old-open"), "old open note survives 120 cap");
  const unifiedOpen = filterOpenInteractions(buildAllUnifiedInteractions(capped));
  assert.ok(unifiedOpen.some((r) => r.sourceId === "old-open"));
}

// TEST 11 — one Team Log row once
{
  const state: StaffOpsState = {
    crossover_messages: [note({ id: "once", status: "In Progress" })],
    crossover_message_replies: [],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: [],
    notifications: []
  };
  const rows = filterOpenInteractions(buildAllUnifiedInteractions(state));
  assert.equal(rows.filter((r) => r.sourceId === "once").length, 1);
}

// TEST 6 / 7 overdue
{
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = pacificTodayKey(yesterday);
  const [y, m, d] = yKey.split("-").map(Number);
  const dueIso = new Date(Date.UTC(y!, m! - 1, d!, 20, 0, 0)).toISOString();
  assert.equal(isOverduePacificDueDate(dueIso), true);
  assert.equal(isOverduePacificDueDate(null), false);
}

// TEST 8 — filter open statuses
{
  assert.equal(isStaffOpsStatusOpen("Open"), true);
  assert.equal(isStaffOpsStatusOpen("In Progress"), true);
  assert.equal(isStaffOpsStatusOpen("Resolved"), false);
  assert.equal(isStaffOpsStatusOpen("Archived"), false);
}

// Storage cap keeps open rows
{
  const openRows = Array.from({ length: 10 }, (_, i) => note({ id: `o${i}`, status: "Open" }));
  const closed = Array.from({ length: 600 }, (_, i) =>
    note({ id: `c${i}`, status: "Resolved", created_at: `2026-02-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z` })
  );
  const trimmed = capRecordsPreservingOpen([...openRows, ...closed], 500, isStaffOpsStatusOpen);
  assert.equal(trimmed.filter((r) => r.status === "Open").length, 10);
}

// My items filter smoke
{
  const state: StaffOpsState = {
    crossover_messages: [
      note({ id: "mine", assigned_to: "Sarah Smith", created_by: "other@fitdog.com" }),
      note({ id: "other", assigned_to: "Bob", created_by: "other@fitdog.com" })
    ],
    crossover_message_replies: [],
    owner_follow_ups: [],
    active_issues: [],
    activity_logs: [],
    staff_directory: [{ id: "1", name: "Sarah Smith", department: "Front Desk", email: "sarah@fitdog.com", phone: null, role: null, status: "Active", notes: null, checklist_items: null, admin_user_id: null, dashboard_role: null, created_at: "", updated_at: "" }],
    notifications: []
  };
  const all = buildAllUnifiedInteractions(state);
  const mine = applyUserInteractionFilter(all, "mine", { email: "sarah@fitdog.com", adminUserId: null, displayName: "Sarah Smith" }, state.staff_directory);
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.sourceId, "mine");
}

console.log("test-user-interactions: all assertions passed");
