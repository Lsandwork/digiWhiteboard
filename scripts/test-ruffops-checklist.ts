import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  TEAM_LEADER_TABS
} from "../lib/admin/permissions";
import { ADMIN_TABS } from "../lib/admin/types";
import { getTabLabel } from "../lib/admin/nav-groups";
import { parentHubForTab } from "../lib/admin/super-admin-nav";
import { ROLE_HUB_NAV } from "../lib/admin/role-hub-nav";
import { targetsTeamLeads } from "../lib/staff/daily-reminders";
import {
  assembleRuffopsChecklistItems,
  bucketForDueAt,
  isWalkBoardAlarmReminder,
  summarizeChecklist
} from "../lib/ruffops-checklist/assemble";
import {
  alertItemKey,
  medicationItemKey,
  parseChecklistItemKey,
  reminderItemKey,
  serviceItemKey,
  walksItemKey
} from "../lib/ruffops-checklist/keys";
import type { DailyReminderRow } from "../lib/staff/daily-reminders";
import type { StaffPushNotice } from "../lib/staff/push-notices";
import type { WalkBoardCycleView } from "../lib/walks-board/types";
import type { TlBoardAdditionalServiceRow, TlGingrMedicationRecord } from "../lib/tl-digi-board/types";
import type { RuffopsChecklistCompletion } from "../lib/ruffops-checklist/types";

const root = process.cwd();

assert.equal(parseChecklistItemKey(medicationItemKey("med-1", "am", "2026-08-18"))?.kind, "medication");
assert.equal(parseChecklistItemKey(serviceItemKey("res-1", "svc-1", "2026-08-18"))?.kind, "service");
assert.equal(parseChecklistItemKey(reminderItemKey("rem-1", "2026-08-18"))?.kind, "reminder");
assert.equal(parseChecklistItemKey(walksItemKey("cycle-1"))?.kind, "walks");
assert.equal(parseChecklistItemKey(alertItemKey("push-1"))?.kind, "alert");
assert.equal(parseChecklistItemKey("not-a-key"), null);

assert.equal(isWalkBoardAlarmReminder({ internal_notes: "walks_board_alarm" }), true);
assert.equal(isWalkBoardAlarmReminder({ title: "Physical Whiteboard Walk Check · 8:00 AM" }), true);
assert.equal(isWalkBoardAlarmReminder({ title: "Morning Yard Setup", internal_notes: "yard_operations_daily_recurring_v1" }), false);

assert.equal(targetsTeamLeads({ audience: ["team_lead"] }), true);
assert.equal(targetsTeamLeads({ audience: ["dog_handler"] }), false);

{
  const now = new Date("2026-08-18T17:00:00.000Z"); // 10:00 AM PDT
  assert.equal(bucketForDueAt("2026-08-18T16:00:00.000Z", now, false), "overdue");
  assert.equal(bucketForDueAt("2026-08-18T16:55:00.000Z", now, false), "due");
  assert.equal(bucketForDueAt("2026-08-18T18:00:00.000Z", now, false), "upcoming");
  assert.equal(bucketForDueAt("2026-08-18T16:00:00.000Z", now, true), "completed");
}

function reminder(partial: Partial<DailyReminderRow> & Pick<DailyReminderRow, "id" | "title">): DailyReminderRow {
  return {
    message: partial.message ?? "Do the thing.",
    scheduled_time: partial.scheduled_time ?? "10:45:00",
    audience: partial.audience ?? ["dog_handler", "team_lead"],
    shift_group: partial.shift_group ?? "all_handler_shifts",
    priority: partial.priority ?? "normal",
    display_duration_seconds: partial.display_duration_seconds ?? 180,
    active_days: partial.active_days ?? ["tuesday"],
    requires_swing_handler: partial.requires_swing_handler ?? false,
    is_active: partial.is_active ?? true,
    footer_text: partial.footer_text ?? null,
    internal_notes: partial.internal_notes ?? "yard_operations_daily_recurring_v1",
    sort_order: partial.sort_order ?? 1,
    created_at: partial.created_at ?? "2026-08-18T00:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-18T00:00:00.000Z",
    today_status: partial.today_status ?? "pending_today",
    last_sent_at: partial.last_sent_at ?? null,
    last_sent_type: partial.last_sent_type ?? null,
    next_scheduled_send: partial.next_scheduled_send ?? null,
    today_state_id: partial.today_state_id ?? null,
    can_send_early: partial.can_send_early ?? true,
    send_early_disabled_reason: partial.send_early_disabled_reason ?? null,
    ...partial
  };
}

function med(partial: Partial<TlGingrMedicationRecord> & Pick<TlGingrMedicationRecord, "gingrMedicationId" | "dogName">): TlGingrMedicationRecord {
  return {
    gingrAnimalId: partial.gingrAnimalId ?? "a1",
    gingrReservationId: partial.gingrReservationId ?? "r1",
    photoUrl: partial.photoUrl ?? null,
    lodgingLabel: partial.lodgingLabel ?? "DEN 1",
    lodgingAreaKey: partial.lodgingAreaKey ?? "den",
    lodgingRunName: partial.lodgingRunName ?? "1",
    gingrScheduleLabel: partial.gingrScheduleLabel ?? "AM",
    scheduleKind: partial.scheduleKind ?? "am",
    medicationName: partial.medicationName ?? "Apoquel",
    dosage: partial.dosage ?? "1 tab",
    instructions: partial.instructions ?? "Give with food",
    notes: partial.notes ?? null,
    administrationStatus: partial.administrationStatus ?? "not_administered",
    administeredAt: partial.administeredAt ?? null,
    administeredBy: partial.administeredBy ?? null,
    serviceDate: partial.serviceDate ?? "2026-08-18",
    ...partial
  };
}

function service(partial: Partial<TlBoardAdditionalServiceRow> & Pick<TlBoardAdditionalServiceRow, "id" | "dogName">): TlBoardAdditionalServiceRow {
  return {
    gingrServiceId: partial.gingrServiceId ?? "svc-1",
    gingrReservationId: partial.gingrReservationId ?? "res-1",
    gingrAnimalId: partial.gingrAnimalId ?? "a1",
    photoUrl: partial.photoUrl ?? null,
    lodgingLabel: partial.lodgingLabel ?? "Suite 2",
    serviceName: partial.serviceName ?? "Private Walk",
    scheduledAt: partial.scheduledAt ?? null,
    displayStatus: partial.displayStatus ?? "needs_completion",
    completionState: partial.completionState ?? "incomplete",
    completionReliable: partial.completionReliable ?? true,
    completionSource: partial.completionSource ?? "gingr",
    serviceDate: partial.serviceDate ?? "2026-08-18",
    ...partial
  };
}

function cycle(partial: Partial<WalkBoardCycleView> & Pick<WalkBoardCycleView, "id" | "due_at">): WalkBoardCycleView {
  return {
    slot_key: partial.slot_key ?? "2026-08-18-08",
    shift_date: partial.shift_date ?? "2026-08-18",
    scheduled_hour: partial.scheduled_hour ?? 8,
    status: partial.status ?? "pending",
    completed_at: partial.completed_at ?? null,
    completed_by: partial.completed_by ?? null,
    missed_at: partial.missed_at ?? null,
    push_notice_id: partial.push_notice_id ?? null,
    version: partial.version ?? 1,
    created_at: partial.created_at ?? "2026-08-18T15:00:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-18T15:00:00.000Z",
    completed_by_user: partial.completed_by_user ?? null,
    ...partial
  };
}

function notice(partial: Partial<StaffPushNotice> & Pick<StaffPushNotice, "id" | "title">): StaffPushNotice {
  return {
    message: partial.message ?? "Please review.",
    priority: partial.priority ?? "important",
    display_mode: partial.display_mode ?? "normal",
    is_active: partial.is_active ?? true,
    is_default: partial.is_default ?? false,
    notice_type: partial.notice_type ?? "standard",
    created_by: partial.created_by ?? null,
    updated_by: partial.updated_by ?? null,
    pushed_at: partial.pushed_at ?? "2026-08-18T16:50:00.000Z",
    expires_at: partial.expires_at ?? null,
    cleared_at: partial.cleared_at ?? null,
    created_at: partial.created_at ?? "2026-08-18T16:50:00.000Z",
    updated_at: partial.updated_at ?? "2026-08-18T16:50:00.000Z",
    ...partial
  };
}

const now = new Date("2026-08-18T17:00:00.000Z"); // Tuesday 10:00 AM PDT

{
  const completion: RuffopsChecklistCompletion = {
    item_key: reminderItemKey("yard-1", "2026-08-18"),
    source: "reminder",
    source_id: "yard-1",
    shift_date: "2026-08-18",
    completed_at: "2026-08-18T16:40:00.000Z",
    completed_by: "user-1",
    completed_by_name: "Alex Lead",
    undone_at: null,
    metadata: {}
  };

  const items = assembleRuffopsChecklistItems({
    now,
    shiftDate: "2026-08-18",
    timeZone: "America/Los_Angeles",
    dayKey: "tuesday",
    medications: [
      med({
        gingrMedicationId: "med-due",
        dogName: "Maple",
        scheduleKind: "am",
        administrationStatus: "not_administered"
      }),
      med({
        gingrMedicationId: "med-done",
        dogName: "Otto",
        scheduleKind: "am",
        administrationStatus: "administered",
        administeredAt: "2026-08-18T15:10:00.000Z",
        administeredBy: "Gingr Tech"
      })
    ],
    additionalServices: [
      service({ id: "svc-row", dogName: "Nala", serviceName: "Puzzle Playtime" })
    ],
    reminders: [
      reminder({ id: "yard-1", title: "Midday Yard Reset", scheduled_time: "10:45:00" }),
      reminder({
        id: "walk-seed",
        title: "Physical Whiteboard Walk Check · 10:00 AM",
        scheduled_time: "10:00:00",
        internal_notes: "walks_board_alarm"
      })
    ],
    walkCycles: [
      cycle({
        id: "cycle-10",
        due_at: "2026-08-18T17:00:00.000Z",
        scheduled_hour: 10,
        status: "pending"
      })
    ],
    notices: [
      notice({ id: "alert-1", title: "Owner complaint — yard dirty" }),
      notice({
        id: "daily-dup",
        title: "Midday Yard Reset",
        notice_type: "daily_reminder",
        daily_reminder_id: "yard-1"
      })
    ],
    completions: [completion]
  });

  const keys = items.map((item) => item.key);
  assert.equal(keys.includes(reminderItemKey("walk-seed", "2026-08-18")), false, "walk-check daily seeds are replaced by Walks Board rows");
  assert.equal(keys.includes("daily-dup") || keys.some((key) => key.includes("daily-dup")), false);

  const yard = items.find((item) => item.key === reminderItemKey("yard-1", "2026-08-18"));
  assert.ok(yard);
  assert.equal(yard?.completed, true);
  assert.equal(yard?.completedByName, "Alex Lead");
  assert.equal(yard?.completedAt, "2026-08-18T16:40:00.000Z");
  assert.equal(yard?.bucket, "completed");

  const maple = items.find((item) => item.key === medicationItemKey("med-due", "am", "2026-08-18"));
  assert.ok(maple);
  assert.equal(maple?.completed, false);
  assert.equal(maple?.canToggle, true);
  assert.equal(maple?.source, "gingr");
  assert.ok(maple?.gingrUrl?.includes("gingrapp.com"));

  const otto = items.find((item) => item.key === medicationItemKey("med-done", "am", "2026-08-18"));
  assert.ok(otto);
  assert.equal(otto?.completed, true);
  assert.equal(otto?.checkboxLocked, true);
  assert.equal(otto?.canToggle, false);
  assert.equal(otto?.completedSource, "gingr");
  assert.equal(otto?.completedByName, "Gingr Tech");

  const walk = items.find((item) => item.key === walksItemKey("cycle-10"));
  assert.ok(walk);
  assert.equal(walk?.source, "walks");
  assert.equal(walk?.canToggle, true);

  const alert = items.find((item) => item.key === alertItemKey("alert-1"));
  assert.ok(alert);
  assert.equal(alert?.source, "alert");
  assert.equal(alert?.completed, false);

  const puzzle = items.find((item) => item.title.includes("Puzzle Playtime"));
  assert.ok(puzzle);
  assert.equal(puzzle?.source, "gingr");
  assert.equal(puzzle?.completed, false);

  const summary = summarizeChecklist(items);
  assert.equal(summary.total, items.length);
  assert.ok(summary.completed >= 2);
}

assert.equal((ADMIN_TABS as readonly string[]).includes("ruffops_checklist"), true);
assert.equal(getTabLabel("ruffops_checklist"), "RuffOps Checklist");
assert.equal((TEAM_LEADER_TABS as readonly string[]).includes("ruffops_checklist"), true);
assert.equal(
  ROLE_HUB_NAV.team_leader.primary.some((item) => item.tab === "ruffops_checklist"),
  true,
  "Team Leads get RuffOps Checklist on the primary sidebar"
);
assert.equal(parentHubForTab("ruffops_checklist"), "sa_floor_hub");

for (const role of ["team_leader", "assistant_manager", "manager_admin", "owner_admin"] as const) {
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role), "ruffops_checklist", role, "staff"),
    true,
    `${role} can open RuffOps Checklist`
  );
}
for (const role of ["daycare", "groomer", "trainer", "front_desk_coordinator", "marketing"] as const) {
  assert.equal(
    canAccessAdminTab(accessFromLegacyRole(`u-${role}`, `${role}@fitdog.test`, role), "ruffops_checklist", role, "staff"),
    false,
    `${role} cannot open RuffOps Checklist`
  );
}

const dashboard = readFileSync(join(root, "components/admin/AdminDashboard.tsx"), "utf8");
assert.match(dashboard, /tab === "ruffops_checklist" \? <RuffopsChecklistPanel/);
assert.match(dashboard, /ruffops_checklist/);

const panel = readFileSync(join(root, "components/admin/RuffopsChecklistPanel.tsx"), "utf8");
assert.match(panel, /formatDateTime\(item.completedAt\)/);
assert.match(panel, /One shared list/);
assert.match(panel, /Open in Gingr/);

const api = readFileSync(join(root, "app/api/admin/ruffops-checklist/route.ts"), "utf8");
assert.match(api, /markWalkBoardCycleComplete/);
assert.match(api, /upsertChecklistCompletion/);
assert.match(api, /Walks Board alarms cannot be unchecked/);

const migration = readFileSync(join(root, "supabase/migrations/079_ruffops_checklist_completions.sql"), "utf8");
assert.match(migration, /ops_checklist_completions/);
assert.match(migration, /completed_by_name/);

console.log("ruffops-checklist tests passed");
