import assert from "node:assert/strict";
import {
  resolveShellyAlertForPushNotice
} from "../lib/shelly-push-alerts";
import {
  SHELLY_ALERT_TYPES,
  SHELLY_API_TIMEOUT_MS,
  SHELLY_CHECKIN_ALERT_DURATION_SECONDS,
  SHELLY_CHECKOUT_ALERT_DURATION_SECONDS,
  SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS,
  shellyCheckinAlertKey,
  shellyCheckoutAlertKey,
  validateShellyFlashRequest
} from "../lib/shelly-alert";
import type { StaffPushNotice } from "../lib/staff/push-notices";

function notice(partial: Partial<StaffPushNotice> & Pick<StaffPushNotice, "id" | "title">): StaffPushNotice {
  const now = new Date().toISOString();
  return {
    message: null,
    priority: "normal",
    display_mode: "normal",
    is_active: true,
    is_default: false,
    created_by: null,
    updated_by: null,
    pushed_at: null,
    expires_at: null,
    cleared_at: null,
    created_at: now,
    updated_at: now,
    ...partial
  };
}

const engage = resolveShellyAlertForPushNotice(
  notice({ id: "n1", title: "OWNER COMPLAINT - Engage with dogs", priority: "urgent", display_mode: "urgent" })
);
assert.deepEqual(engage, { type: "owner_complaint", eventKey: "push:n1" });

const phone = resolveShellyAlertForPushNotice(
  notice({ id: "n2", title: "OWNER COMPLAINT - Phone Usage", priority: "urgent", display_mode: "urgent" })
);
assert.deepEqual(phone, { type: "phone_usage", eventKey: "push:n2" });

const yard = resolveShellyAlertForPushNotice(
  notice({
    id: "n3",
    title: "OWNER COMPLAINT - Dog not on yard",
    priority: "urgent",
    display_mode: "urgent"
  })
);
assert.deepEqual(yard, { type: "dog_not_on_yard", eventKey: "push:n3" });

const daily = resolveShellyAlertForPushNotice(
  notice({
    id: "n4",
    title: "Swing Handler Reminder",
    notice_type: "daily_reminder",
    daily_reminder_id: "rem-1"
  })
);
assert.deepEqual(daily, { type: "daily_reminder", eventKey: "daily-reminder:rem-1:pending" });

const urgent = resolveShellyAlertForPushNotice(
  notice({ id: "n5", title: "Emergency Yard Alert", priority: "urgent", display_mode: "urgent" })
);
assert.deepEqual(urgent, { type: "urgent_front_desk", eventKey: "push:n5" });

const custom = resolveShellyAlertForPushNotice(notice({ id: "n6", title: "Water bowls refill" }));
assert.deepEqual(custom, { type: "custom_push_notice", eventKey: "push:n6" });

const parsed = validateShellyFlashRequest({ type: "test_light" });
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.equal(parsed.type, "test_light");
  assert.match(parsed.eventKey, /^test-light:\d+$/);
}

assert.equal(SHELLY_ALERT_TYPES.length, 11);
assert.equal((SHELLY_ALERT_TYPES as readonly string[]).includes("dog_check_in"), true);

assert.equal(SHELLY_PUSH_NOTICE_ALERT_DURATION_SECONDS, 300);
assert.equal(SHELLY_CHECKIN_ALERT_DURATION_SECONDS, 120);
assert.equal(SHELLY_CHECKOUT_ALERT_DURATION_SECONDS, 120);
assert.equal(SHELLY_API_TIMEOUT_MS, 8000);
assert.equal(
  shellyCheckinAlertKey({
    id: "dog-row-1",
    gingr_reservation_id: "reservation-1",
    gingr_animal_id: "animal-1",
    status_started_at: "2026-07-09T07:00:00.000Z",
    updated_at: "2026-07-09T07:01:00.000Z"
  }),
  "checkin:reservation:reservation-1"
);
assert.equal(
  shellyCheckinAlertKey({
    id: "dog-row-2",
    gingr_reservation_id: null,
    gingr_animal_id: "animal-2",
    status_started_at: "2026-07-09T07:10:00.000Z",
    updated_at: "2026-07-09T07:11:00.000Z"
  }),
  "checkin:animal:animal-2:2026-07-09T07:10:00.000Z"
);
assert.equal(
  shellyCheckoutAlertKey({
    id: "dog-row-1",
    status_started_at: "2026-07-09T08:00:00.000Z",
    updated_at: "2026-07-09T08:01:00.000Z"
  }),
  "checkout:dog-row-1:2026-07-09T08:00:00.000Z"
);

console.log("shelly alert tests passed");
