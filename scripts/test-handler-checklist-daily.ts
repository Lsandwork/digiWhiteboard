import assert from "node:assert/strict";
import {
  dailyPushNoticeChecklistKey,
  dailyReminderChecklistKey,
  isHandlerDailyChecklistKey
} from "../lib/staff/handler-checklist-daily";

assert.equal(dailyReminderChecklistKey("rem-1", "2026-07-17"), "daily_reminder:rem-1:2026-07-17");
assert.equal(dailyPushNoticeChecklistKey("pn-1", "2026-07-17"), "push_notice_day:pn-1:2026-07-17");
assert.equal(isHandlerDailyChecklistKey("daily_reminder:rem-1:2026-07-17"), true);
assert.equal(isHandlerDailyChecklistKey("push_notice_day:pn-1:2026-07-17"), true);
assert.equal(isHandlerDailyChecklistKey("Clock in and confirm yard assignment."), false);

console.log("handler-checklist-daily tests passed");
