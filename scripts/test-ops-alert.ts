import assert from "node:assert/strict";
import { parseChecklistItems } from "../lib/ops-alert/checklist";
import { opsAlertFromStaffPushNotice } from "../lib/ops-alert/from-staff-push";
import { resolveOpsAlertAccent, resolveOpsAlertAction } from "../lib/ops-alert/status";
import type { StaffPushNotice } from "../lib/staff/push-notices";

const checklistMessage = [
  "Rake turf",
  "Refresh water bowls",
  "Clean visible messes",
  "Check x-pen",
  "Check gate setup",
  "Make sure the yard stays guest-ready"
].join("\n");

assert.deepEqual(parseChecklistItems(checklistMessage), [
  "Rake turf",
  "Refresh water bowls",
  "Clean visible messes",
  "Check x-pen",
  "Check gate setup",
  "Make sure the yard stays guest-ready"
]);

assert.deepEqual(parseChecklistItems("✓ Rake turf\n✓ Refresh water bowls"), [
  "Rake turf",
  "Refresh water bowls"
]);

assert.equal(parseChecklistItems("Bring the dog to the front desk when ready.").length, 0);

const notice = {
  id: "reminder-1",
  title: "Evening Yard Reset",
  message: checklistMessage,
  priority: "normal",
  display_mode: "normal",
  is_active: true,
  is_default: false,
  created_at: "2026-08-09T17:30:00.000Z",
  updated_at: "2026-08-09T17:30:00.000Z",
  expires_at: "2026-08-09T17:33:00.000Z",
  created_by: null,
  updated_by: null,
  pushed_at: "2026-08-09T17:30:00.000Z",
  cleared_at: null,
  notice_type: "daily_reminder",
  complaint_category: null,
  dog_handler_name: null,
  daily_reminder_id: "tpl-1",
  daily_reminder_sent_type: "automatic",
  daily_reminder_scheduled_time: "17:30",
  daily_reminder_audience: ["dog_handler", "team_lead"],
  daily_reminder_sent_by_name: null,
  daily_reminder_footer: "Helping the Lead keeps every dog safe, clean, and cared for.",
  source: "daily_reminder",
  source_id: "tpl-1"
} as StaffPushNotice;

const alert = opsAlertFromStaffPushNotice(notice);
assert.equal(alert.alertType, "DAILY REMINDER");
assert.equal(alert.title, "Evening Yard Reset");
assert.equal(alert.audience, "DOG HANDLERS + TEAM LEADS");
assert.equal(alert.metaRows.length, 2);
assert.equal(alert.checklistItems.length, 6);
assert.equal(alert.accent, "blue");
assert.equal(alert.action, "action_required");
assert.equal(alert.actionLabel, "ACTION REQUIRED");
assert.equal(alert.message, null, "checklist absorbs the message body");

assert.equal(resolveOpsAlertAccent({ priority: "urgent" }), "red");
assert.equal(resolveOpsAlertAccent({ status: "completed" }), "green");
assert.equal(resolveOpsAlertAction({ accent: "red" }).actionLabel, "URGENT ACTION");
assert.equal(resolveOpsAlertAction({ accent: "green", status: "completed" }).actionLabel, "COMPLETED");

console.log("ops-alert checks passed");
