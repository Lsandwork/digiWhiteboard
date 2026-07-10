import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WALK_BOARD_CYCLE_MS, WALK_BOARD_SNOOZE_MS } from "../lib/walks-board/constants";
import {
  buildWalkDueNotificationMessage,
  formatWalkBoardCountdown,
  getWalkBoardUrgency,
  sortWalkBoardEntries,
  summarizeWalkBoardEntries
} from "../lib/walks-board/display";
import {
  accessFromLegacyRole,
  hasPermission,
  permissionsForRoles
} from "../lib/admin/permissions";
import {
  canReceiveWalkBoardReminders,
  canSnoozeWalkBoard
} from "../lib/walks-board/server";
import {
  normalizeWalkBoardDogName,
  validateWalkBoardDogName
} from "../lib/walks-board/validation";
import type { WalkBoardEntryRow } from "../lib/walks-board/types";

function entry(partial: Partial<WalkBoardEntryRow> & Pick<WalkBoardEntryRow, "dog_name" | "walk_type" | "next_due_at">): WalkBoardEntryRow {
  return {
    id: partial.id ?? "entry-1",
    dog_name: partial.dog_name,
    dog_name_normalized: partial.dog_name_normalized ?? normalizeWalkBoardDogName(partial.dog_name),
    walk_type: partial.walk_type,
    status: partial.status ?? "active",
    created_at: partial.created_at ?? "2026-07-10T10:00:00.000Z",
    created_by: partial.created_by ?? "user-1",
    cycle_started_at: partial.cycle_started_at ?? "2026-07-10T10:00:00.000Z",
    next_due_at: partial.next_due_at,
    last_walked_at: partial.last_walked_at ?? null,
    last_walked_by: partial.last_walked_by ?? null,
    snooze_used: partial.snooze_used ?? false,
    snoozed_at: partial.snoozed_at ?? null,
    snoozed_by: partial.snoozed_by ?? null,
    cleared_at: partial.cleared_at ?? null,
    cleared_by: partial.cleared_by ?? null,
    version: partial.version ?? 1,
    updated_at: partial.updated_at ?? "2026-07-10T10:00:00.000Z"
  };
}

// 3–6. Validation and name storage
{
  const rejected = validateWalkBoardDogName("   ");
  assert.equal(rejected.ok, false);
  const ok = validateWalkBoardDogName("  Ralphie  ");
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.value, "Ralphie");
    assert.equal(normalizeWalkBoardDogName(ok.value), "ralphie");
  }
  const long = validateWalkBoardDogName("Sir Barkington Wellington");
  assert.equal(long.ok, true);
}

// 7. One-hour cycle constant
assert.equal(WALK_BOARD_CYCLE_MS, 60 * 60 * 1000);
assert.equal(WALK_BOARD_SNOOZE_MS, 60 * 60 * 1000);

// 8–13. Urgency and countdown behavior with fake time
{
  const base = entry({
    dog_name: "Ralphie",
    walk_type: "no_plays",
    next_due_at: "2026-07-10T11:00:00.000Z"
  });
  const onTrackMs = new Date("2026-07-10T10:30:00.000Z").getTime();
  assert.equal(getWalkBoardUrgency(base, onTrackMs), "on_track");
  assert.match(formatWalkBoardCountdown(base, onTrackMs), /Next walk in/);

  const dueSoonMs = new Date("2026-07-10T10:50:00.000Z").getTime();
  assert.equal(getWalkBoardUrgency(base, dueSoonMs), "due_soon");

  const dueMs = new Date("2026-07-10T11:00:00.000Z").getTime();
  assert.equal(getWalkBoardUrgency(base, dueMs), "walk_due");

  const overdueMs = new Date("2026-07-10T11:23:00.000Z").getTime();
  assert.equal(getWalkBoardUrgency(base, overdueMs), "overdue");
  assert.match(formatWalkBoardCountdown(base, overdueMs), /Overdue by/);
  assert.doesNotMatch(formatWalkBoardCountdown(base, overdueMs), /^-/);

  const snoozed = entry({
    dog_name: "Ralphie",
    walk_type: "groomed",
    next_due_at: "2026-07-10T12:00:00.000Z",
    snooze_used: true
  });
  assert.equal(getWalkBoardUrgency(snoozed, new Date("2026-07-10T11:10:00.000Z").getTime()), "snoozed");
}

// 15–19. Reminder recipient permissions by role
{
  const teamLead = accessFromLegacyRole("u1", "lead@fitdog.com", "team_leader");
  const management = accessFromLegacyRole("u2", "mgr@fitdog.com", "assistant_manager");
  const admin = accessFromLegacyRole("u3", "admin@fitdog.com", "manager_admin");
  const superAdmin = accessFromLegacyRole("u4", "owner@fitdog.com", "owner_admin");
  const groomer = accessFromLegacyRole("u5", "groom@fitdog.com", "groomer");

  assert.equal(canReceiveWalkBoardReminders(teamLead), true);
  assert.equal(canReceiveWalkBoardReminders(management), true);
  assert.equal(canReceiveWalkBoardReminders(admin), true);
  assert.equal(canReceiveWalkBoardReminders(superAdmin), true);
  assert.equal(canReceiveWalkBoardReminders(groomer), false);
  assert.equal(canSnoozeWalkBoard(groomer), false);
  assert.equal(canSnoozeWalkBoard(teamLead), true);
}

// 23–25. Multi-role permissions include reminder capability once
{
  const perms = permissionsForRoles(["team_leader", "management"]);
  assert.equal(perms.filter((p) => p === "receive_walks_board_reminders").length, 1);
  assert.equal(hasPermission(accessFromLegacyRole("u1", "x@fitdog.com", "team_leader"), "view_admin_panel"), true);
}

// 26–27. Reminder idempotency table exists in migration
{
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/030_walk_board.sql"), "utf8");
  assert.match(migration, /walk_board_reminder_sends/);
  assert.match(migration, /unique \(walk_entry_id, cycle_started_at, due_at\)/);
}

// 31–32. Search/sort helpers
{
  const nowMs = new Date("2026-07-10T11:30:00.000Z").getTime();
  const sorted = sortWalkBoardEntries(
    [
      entry({ dog_name: "Later", walk_type: "break_dog", next_due_at: "2026-07-10T13:00:00.000Z" }),
      entry({ dog_name: "Overdue", walk_type: "no_plays", next_due_at: "2026-07-10T10:30:00.000Z" })
    ],
    nowMs
  );
  assert.equal(sorted[0]?.dog_name, "Overdue");
  const summary = summarizeWalkBoardEntries(sorted, nowMs);
  assert.equal(summary.activeCount, 2);
  assert.ok(summary.overdueCount >= 1);
}

// 33. Long names remain complete in UI source
{
  const panel = readFileSync(join(process.cwd(), "components/admin/WalksBoardPanel.tsx"), "utf8");
  assert.match(panel, /entry\.dog_name/);
  assert.doesNotMatch(panel, /entry\.dog_name\.slice\(/);
  assert.match(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"), /overflow-wrap:\s*anywhere/);
}

// 34–35. Responsive layout classes
{
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 960px\)/);
}

// 1–2, 16, 36–38. Route and access wiring
{
  const permissions = readFileSync(join(process.cwd(), "lib/admin/permissions.ts"), "utf8");
  assert.match(permissions, /walks_board/);
  assert.match(permissions, /receive_walks_board_reminders/);

  const api = readFileSync(join(process.cwd(), "app/api/admin/walks-board/route.ts"), "utf8");
  assert.match(api, /isAdminRequest/);
  assert.match(api, /view_admin_panel/);
  assert.match(api, /canSnoozeWalkBoard|snoozeWalkBoardEntry/);

  const lobby = readFileSync(join(process.cwd(), "components/lobby/LobbyCheckoutBoard.tsx"), "utf8");
  assert.doesNotMatch(lobby, /WalksBoardPanel/);

  const cron = readFileSync(join(process.cwd(), "app/api/cron/walk-board-reminders/route.ts"), "utf8");
  assert.match(cron, /processWalkBoardReminders/);
}

// Reminder message content
assert.match(buildWalkDueNotificationMessage("Ralphie", "no_plays", false), /Ralphie is due for a walk — No Plays\./);
assert.match(buildWalkDueNotificationMessage("Ralphie", "no_plays", true), /Snooze already used/);

console.log("test-walks-board: all assertions passed");
