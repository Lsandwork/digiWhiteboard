import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  WALK_BOARD_ALARM_END_HOUR,
  WALK_BOARD_ALARM_HOURS,
  WALK_BOARD_ALARM_INTERVAL_HOURS,
  WALK_BOARD_ALARM_START_HOUR,
  WALK_BOARD_CYCLE_MS
} from "../lib/walks-board/constants";
import {
  buildWalkDueNotificationMessage,
  formatWalkBoardCountdown,
  getWalkBoardUrgency,
  mergeWalkBoardState,
  summarizeWalkBoardCycles,
  withCompletedWalkBoardCycle
} from "../lib/walks-board/display";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  hasPermission,
  permissionsForRoles
} from "../lib/admin/permissions";
import {
  canReceiveWalkBoardReminders,
  canSnoozeWalkBoard
} from "../lib/walks-board/server";
import {
  currentWalkBoardAlarmHour,
  isWalkBoardOperatingWindow,
  nextWalkBoardAlarmAt,
  walkBoardClockParts,
  walkBoardExpectedSlots,
  walkBoardSlotEndAt
} from "../lib/walks-board/schedule";
import type { WalkBoardCycleRow, WalkBoardCycleView, WalkBoardPublicState } from "../lib/walks-board/types";

function cycle(partial: Partial<WalkBoardCycleRow> & Pick<WalkBoardCycleRow, "slot_key" | "due_at">): WalkBoardCycleRow {
  return {
    id: partial.id ?? "cycle-1",
    slot_key: partial.slot_key,
    shift_date: partial.shift_date ?? "2026-08-18",
    scheduled_hour: partial.scheduled_hour ?? 8,
    status: partial.status ?? "pending",
    due_at: partial.due_at,
    completed_at: partial.completed_at ?? null,
    completed_by: partial.completed_by ?? null,
    missed_at: partial.missed_at ?? null,
    push_notice_id: partial.push_notice_id ?? null,
    version: partial.version ?? 1,
    created_at: partial.created_at ?? "2026-08-18T15:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-18T15:00:00.000Z"
  };
}

assert.equal(WALK_BOARD_CYCLE_MS, 2 * 60 * 60 * 1000);
assert.equal(WALK_BOARD_ALARM_START_HOUR, 8);
assert.equal(WALK_BOARD_ALARM_END_HOUR, 19);
assert.equal(WALK_BOARD_ALARM_INTERVAL_HOURS, 2);
assert.deepEqual([...WALK_BOARD_ALARM_HOURS], [8, 10, 12, 14, 16, 18]);

{
  // Tuesday 8:00 AM PDT = 15:00 UTC on Aug 18, 2026
  const eightAm = new Date("2026-08-18T15:00:00.000Z");
  assert.equal(walkBoardClockParts(eightAm).hour, 8);
  assert.equal(isWalkBoardOperatingWindow(eightAm), true);
  assert.equal(currentWalkBoardAlarmHour(eightAm), 8);

  const nineAm = new Date("2026-08-18T16:00:00.000Z");
  assert.equal(currentWalkBoardAlarmHour(nineAm), 8);

  const sixPm = new Date("2026-08-19T01:00:00.000Z");
  assert.equal(currentWalkBoardAlarmHour(sixPm), 18);
  assert.equal(isWalkBoardOperatingWindow(sixPm), true);

  const sevenPm = new Date("2026-08-19T02:00:00.000Z");
  assert.equal(isWalkBoardOperatingWindow(sevenPm), false);
  assert.equal(currentWalkBoardAlarmHour(sevenPm), null);

  const sevenAm = new Date("2026-08-18T14:00:00.000Z");
  assert.equal(isWalkBoardOperatingWindow(sevenAm), false);

  const sundayEight = new Date("2026-08-16T15:00:00.000Z");
  assert.equal(currentWalkBoardAlarmHour(sundayEight), 8);

  const nextFromSevenThirty = nextWalkBoardAlarmAt(new Date("2026-08-18T14:30:00.000Z"));
  assert.equal(walkBoardClockParts(nextFromSevenThirty).hour, 8);

  const slots = walkBoardExpectedSlots("2026-08-18");
  assert.equal(slots.length, 6);
  assert.equal(slots[0]?.label, "8:00 AM");
  assert.equal(slots[5]?.label, "6:00 PM");

  assert.equal(walkBoardSlotEndAt("2026-08-18T08:00").toISOString(), "2026-08-18T17:00:00.000Z");
  assert.equal(walkBoardSlotEndAt("2026-08-18T18:00").toISOString(), "2026-08-19T02:00:00.000Z");
}

{
  const pending = cycle({
    slot_key: "2026-08-18T08:00",
    due_at: "2026-08-18T15:00:00.000Z",
    scheduled_hour: 8
  });
  assert.equal(getWalkBoardUrgency(pending, new Date("2026-08-18T15:00:00.000Z").getTime()), "alarm_due");
  assert.match(formatWalkBoardCountdown(pending, new Date("2026-08-18T15:00:00.000Z").getTime()), /Alarm due/);

  const overdue = cycle({
    slot_key: "2026-08-18T08:00",
    due_at: "2026-08-18T15:00:00.000Z",
    scheduled_hour: 8
  });
  assert.equal(getWalkBoardUrgency(overdue, new Date("2026-08-18T15:20:00.000Z").getTime()), "overdue");
  assert.match(formatWalkBoardCountdown(overdue, new Date("2026-08-18T15:20:00.000Z").getTime()), /Overdue by/);

  const completed = cycle({
    slot_key: "2026-08-18T08:00",
    due_at: "2026-08-18T15:00:00.000Z",
    status: "completed"
  });
  assert.equal(getWalkBoardUrgency(completed, Date.now()), "completed");

  const summary = summarizeWalkBoardCycles([pending, completed], new Date("2026-08-18T15:00:00.000Z").getTime());
  assert.equal(summary.todayCount, 2);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.completedCount, 1);
}

{
  const pendingView: WalkBoardCycleView = {
    ...cycle({
      id: "cycle-open",
      slot_key: "2026-08-18T08:00",
      due_at: "2026-08-18T15:00:00.000Z",
      scheduled_hour: 8
    }),
    completed_by_user: null
  };
  const state: WalkBoardPublicState = {
    timezone: "America/Los_Angeles",
    operatingWindow: true,
    currentSlotKey: pendingView.slot_key,
    currentCycle: pendingView,
    todayCycles: [pendingView],
    summary: summarizeWalkBoardCycles([pendingView], Date.now()),
    permissions: { canComplete: true, canReceiveReminders: true },
    serverTime: "2026-08-18T15:00:00.000Z",
    nextAlarmAt: "2026-08-18T17:00:00.000Z",
    title: "Physical Whiteboard Walk Check",
    message: "Update the boards.",
    checklist: ["Update the Walks Board"]
  };
  const done: WalkBoardCycleView = { ...pendingView, status: "completed", completed_at: "2026-08-18T15:05:00.000Z" };
  const next = withCompletedWalkBoardCycle(state, done, new Date("2026-08-18T15:05:00.000Z").getTime());
  assert.equal(next.currentCycle?.status, "completed");
  assert.equal(next.summary.pendingCount, 0);
  assert.equal(next.summary.completedCount, 1);

  const stale = mergeWalkBoardState(next, state, new Date("2026-08-18T15:05:00.000Z").getTime());
  assert.equal(stale.currentCycle?.status, "completed");
}

{
  const teamLead = accessFromLegacyRole("u1", "lead@fitdog.com", "team_leader");
  const management = accessFromLegacyRole("u2", "mgr@fitdog.com", "assistant_manager");
  const admin = accessFromLegacyRole("u3", "admin@fitdog.com", "manager_admin");
  const superAdmin = accessFromLegacyRole("u4", "owner@fitdog.com", "owner_admin");
  const coordinator = accessFromLegacyRole("u6", "fdc@fitdog.com", "front_desk_coordinator");
  const dogHandler = accessFromLegacyRole("u7", "handler@fitdog.com", "daycare");
  const groomer = accessFromLegacyRole("u5", "groom@fitdog.com", "groomer");

  assert.equal(canReceiveWalkBoardReminders(teamLead), true);
  assert.equal(canReceiveWalkBoardReminders(management), true);
  assert.equal(canReceiveWalkBoardReminders(admin), true);
  assert.equal(canReceiveWalkBoardReminders(superAdmin), true);
  assert.equal(canReceiveWalkBoardReminders(coordinator), true);
  assert.equal(canReceiveWalkBoardReminders(dogHandler), true);
  assert.equal(canReceiveWalkBoardReminders(groomer), false);
  assert.equal(canSnoozeWalkBoard(groomer), false);
  assert.equal(canSnoozeWalkBoard(teamLead), false);
  assert.equal(canSnoozeWalkBoard(dogHandler), false);
}

{
  const perms = permissionsForRoles(["team_leader", "management"]);
  assert.equal(perms.filter((p) => p === "receive_walks_board_reminders").length, 1);
  assert.equal(hasPermission(accessFromLegacyRole("u1", "x@fitdog.com", "team_leader"), "view_admin_panel"), true);
}

{
  const migration = readFileSync(join(process.cwd(), "supabase/migrations/078_walk_board_alarm_cycles.sql"), "utf8");
  assert.match(migration, /walk_board_cycles/);
  assert.match(migration, /walks_board_alarm/);
  assert.match(migration, /08:00:00/);
  assert.match(migration, /18:00:00/);
  assert.match(migration, /monday','tuesday','wednesday','thursday','friday','saturday','sunday/);
  assert.match(migration, /dog_handler','team_lead/);
}

{
  const panel = readFileSync(join(process.cwd(), "components/admin/WalksBoardPanel.tsx"), "utf8");
  assert.doesNotMatch(panel, /entry\.dog_name/);
  assert.doesNotMatch(panel, /Add Dog/);
  assert.doesNotMatch(panel, /\bSnooze\b/);
  assert.match(panel, /Mark Complete/);
  assert.match(panel, /cannot be snoozed/);
  assert.match(panel, /physical whiteboard/);
  assert.match(panel, /Upload pictures/);
  assert.match(panel, /AbortController/);
  assert.match(panel, /walk-board-cycles-live/);
  assert.match(panel, /withCompletedWalkBoardCycle/);
  assert.match(panel, /mergeWalkBoardState/);
  assert.match(panel, /visibilitychange/);
  assert.doesNotMatch(panel, /\[hasLoaded, showToast\]/);
  assert.doesNotMatch(panel, /walk-board-cycles-\$\{Date\.now/);
  assert.match(readFileSync(join(process.cwd(), "app/globals.css"), "utf8"), /overflow-wrap:\s*anywhere/);
}

{
  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  assert.match(css, /minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 960px\)/);
  assert.match(css, /walks-board-slot-grid/);
  assert.doesNotMatch(css, /walks-board-card-urgent/);
  assert.doesNotMatch(css, /\.walks-board-card--overdue \{[\s\S]{0,220}?animation:/);
}

{
  const permissions = readFileSync(join(process.cwd(), "lib/admin/permissions.ts"), "utf8");
  assert.match(permissions, /walks_board/);
  assert.match(permissions, /receive_walks_board_reminders/);
  assert.match(permissions, /if \(tab === "walks_board"\) \{\s*if \(board !== "staff"\) return false;/);

  const nav = readFileSync(join(process.cwd(), "lib/admin/nav-groups.ts"), "utf8");
  assert.match(nav, /FRONT_DESK_TABS:[\s\S]*"walks_board"/);
  assert.doesNotMatch(nav, /singles\(\["walks_board"/);

  const api = readFileSync(join(process.cwd(), "app/api/admin/walks-board/route.ts"), "utf8");
  assert.match(api, /isAdminRequest/);
  assert.doesNotMatch(api, /view_admin_panel/);
  assert.doesNotMatch(api, /Signed-in staff account required/);
  assert.match(api, /resolveWalkBoardActor/);
  assert.match(api, /cannot be snoozed/);
  assert.doesNotMatch(api, /snoozeWalkBoardEntry/);
  assert.match(api, /private, no-store, max-age=0/);

  const server = readFileSync(join(process.cwd(), "lib/walks-board/server.ts"), "utf8");
  assert.match(server, /includePermissions/);
  assert.match(server, /closeExpired/);
  assert.match(server, /Promise\.all/);
  assert.match(server, /loadPendingWalkBoardCycle/);

  const dashboard = readFileSync(join(process.cwd(), "components/admin/AdminDashboard.tsx"), "utf8");
  assert.match(dashboard, /if \(!lastSavedAt\) return/);

  const checklist = readFileSync(join(process.cwd(), "lib/ruffops-checklist/server.ts"), "utf8");
  assert.match(checklist, /closeExpired:\s*false/);
  assert.match(checklist, /includePermissions:\s*false/);

  const actor = readFileSync(join(process.cwd(), "lib/walks-board/actor.ts"), "utf8");
  assert.match(actor, /findAdminUserByEmail/);
  assert.match(actor, /actorUserId: null/);

  const lobby = readFileSync(join(process.cwd(), "components/lobby/LobbyCheckoutBoard.tsx"), "utf8");
  assert.doesNotMatch(lobby, /WalksBoardPanel/);

  const cron = readFileSync(join(process.cwd(), "app/api/cron/walk-board-reminders/route.ts"), "utf8");
  assert.match(cron, /processWalkBoardReminders/);

  const reminders = readFileSync(join(process.cwd(), "lib/walks-board/reminders.ts"), "utf8");
  assert.match(reminders, /notice_type: "daily_reminder"/);
  assert.match(reminders, /createAndPushStaffNotice/);
  assert.match(reminders, /walks_board_alarm/);

  const bell = readFileSync(join(process.cwd(), "components/admin/NotificationBell.tsx"), "utf8");
  assert.doesNotMatch(bell, /\bSnooze\b/);
  assert.match(bell, /Mark complete|Complete/);
  assert.match(bell, /Cannot snooze/);

  const bellApi = readFileSync(join(process.cwd(), "app/api/admin/notification-bell/route.ts"), "utf8");
  assert.match(bellApi, /loadPendingWalkBoardCycle/);
  assert.doesNotMatch(bellApi, /loadWalkBoardPublicState/);
}

{
  const roles = ["groomer", "trainer", "daycare", "viewer", "owner_admin"] as const;
  for (const role of roles) {
    const access = accessFromLegacyRole(`walk-${role}`, `${role}@fitdog.test`, role);
    assert.equal(
      canAccessAdminTab(access, "walks_board", role, "staff"),
      true,
      `${role} can access walks_board on staff board`
    );
  }

  const limitedRoles = ["groomer", "trainer", "daycare", "viewer", "owner_admin"] as const;
  for (const role of limitedRoles) {
    const access = accessFromLegacyRole(`walk-${role}`, `${role}@fitdog.test`, role);
    assert.equal(
      canAccessAdminTab(access, "walks_board", role, "lobby"),
      false,
      `${role} cannot access walks_board on lobby board`
    );
  }
}

assert.match(buildWalkDueNotificationMessage(), /physical whiteboard/);
assert.match(buildWalkDueNotificationMessage(), /cannot be snoozed/);
assert.doesNotMatch(buildWalkDueNotificationMessage(), /Ralphie/);

const handlerPerms = permissionsForRoles(["daycare"]);
assert.ok(handlerPerms.includes("receive_walks_board_reminders"));
const coordinatorPerms = permissionsForRoles(["front_desk_coordinator"]);
assert.ok(coordinatorPerms.includes("receive_walks_board_reminders"));

console.log("test-walks-board: all assertions passed");
