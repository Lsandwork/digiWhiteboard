import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChecklistItems } from "../lib/ops-alert/checklist";
import {
  isFighterRotationNotice,
  opsAlertFromStaffPushNotice,
  parseFighterRotationMessage
} from "../lib/ops-alert/from-staff-push";
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

{
  const css = readFileSync(join(process.cwd(), "components/ops-alert/OpsAlert.module.css"), "utf8");
  assert.match(css, /\.cardFullscreen \{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.cardCompact \{[\s\S]*?width:\s*min\(100%, 28rem\)/);
  assert.match(css, /place-items:\s*center stretch/);
  assert.match(css, /@media \(min-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.doesNotMatch(css, /width:\s*min\(100%, 56rem\)/);
  // Fighter/Rotations sub-text + icon notes must be TV-readable, not the small default message size.
  assert.match(css, /\.subtitleLarge \{[\s\S]*?font-size:\s*clamp\(1\.45rem/);
  assert.match(css, /\.messageLarge \{[\s\S]*?font-size:\s*clamp\(1\.5rem/);
  assert.match(css, /\.message \{[\s\S]*?white-space:\s*pre-line/);
}

// Fighter / Rotations: icon comments/notes are the large body; arriving line is the large sub-text.
{
  const fighterMessage = [
    "Rex is checking in.",
    "Named in notes / also checked in: Max, Buddy.",
    "Fighter/Rotations: Max: Separate from Rex — no yard time together",
    "",
    "Rex: Small group only, watch energy at gate"
  ].join("\n");
  const parsed = parseFighterRotationMessage(fighterMessage);
  assert.equal(parsed.subtitle, "Rex is checking in. Named in notes / also checked in: Max, Buddy.");
  assert.match(parsed.comments ?? "", /Separate from Rex/);
  assert.match(parsed.comments ?? "", /Small group only/);

  const fighterNotice = {
    ...notice,
    id: "fighter-1",
    title: "FIGHTER / ROTATIONS",
    message: fighterMessage,
    priority: "urgent",
    display_mode: "urgent",
    notice_type: undefined,
    source: "fighter_rotation",
    source_id: "99:1"
  } as StaffPushNotice;
  assert.equal(isFighterRotationNotice(fighterNotice), true);
  const fighterAlert = opsAlertFromStaffPushNotice(fighterNotice);
  assert.equal(fighterAlert.emphasizeMessage, true);
  assert.equal(fighterAlert.subtitle, parsed.subtitle);
  assert.equal(fighterAlert.checklistItems.length, 0, "icon notes must not be checklist-absorbed");
  assert.match(fighterAlert.message ?? "", /Separate from Rex — no yard time together/);
  assert.match(fighterAlert.message ?? "", /Small group only, watch energy at gate/);
  assert.doesNotMatch(fighterAlert.message ?? "", /Rex is checking in/, "arriving line lives in subtitle, not duplicated in body");
}

console.log("ops-alert checks passed");
