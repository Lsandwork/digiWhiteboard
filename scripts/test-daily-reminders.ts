import assert from "node:assert/strict";
import {
  buildDailyReminderPushNoticeInput,
  formatDailyReminderAudience,
  getShiftDate,
  isReminderDue,
  isReminderScheduledToday,
  targetsDogHandlers
} from "../lib/staff/daily-reminders";

function testAudienceLabel() {
  assert.equal(formatDailyReminderAudience(["dog_handler", "team_lead"]), "Dog Handlers + Team Leads");
  assert.equal(formatDailyReminderAudience(["team_lead"]), "Team Leads");
}

function testDogHandlerBefore630() {
  const reminder = {
    scheduled_time: "06:00:00",
    audience: ["dog_handler"] as const
  };
  const zone = "America/Los_Angeles";
  const earlyMorning = new Date("2026-07-06T13:00:00.000Z");
  assert.equal(isReminderDue({ ...reminder, audience: ["dog_handler"] }, zone, earlyMorning), false);
  assert.equal(targetsDogHandlers({ audience: ["dog_handler"] }), true);
}

function testBuildPushNoticeInput() {
  const input = buildDailyReminderPushNoticeInput(
    {
      id: "rem-1",
      title: "Check In",
      message: "Clock in with the Team Lead.",
      scheduled_time: "06:30:00",
      audience: ["dog_handler", "team_lead"],
      shift_group: "am_handler",
      priority: "normal",
      display_duration_seconds: 120,
      active_days: ["monday"],
      requires_swing_handler: false,
      is_active: true,
      footer_text: null,
      internal_notes: null,
      sort_order: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z"
    },
    "early",
    "Taylor"
  );
  assert.equal(input.notice_type, "daily_reminder");
  assert.equal(input.daily_reminder_sent_type, "early");
  assert.equal(input.source, "daily_reminder");
  assert.equal(input.source_id, "rem-1");
}

function testShiftDate() {
  const shiftDate = getShiftDate("America/Los_Angeles", new Date("2026-07-06T20:00:00.000Z"));
  assert.match(shiftDate, /^\d{4}-\d{2}-\d{2}$/);
}

function testScheduledToday() {
  assert.equal(isReminderScheduledToday({ active_days: ["monday"] }, "monday"), true);
  assert.equal(isReminderScheduledToday({ active_days: ["monday"] }, "tuesday"), false);
}

testAudienceLabel();
testDogHandlerBefore630();
testBuildPushNoticeInput();
testShiftDate();
testScheduledToday();

console.log("daily-reminders tests passed");
