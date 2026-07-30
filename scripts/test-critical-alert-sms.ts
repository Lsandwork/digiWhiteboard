import assert from "node:assert/strict";
import {
  formatAlertSmsBody,
  isCriticalAlertSmsRole,
  shouldSendCriticalAlertSms
} from "../lib/admin/alert-sms";
import { normalizeAdminUserPhone } from "../lib/admin/users";

assert.equal(isCriticalAlertSmsRole("owner_admin"), true);
assert.equal(isCriticalAlertSmsRole("super_admin"), true);
assert.equal(isCriticalAlertSmsRole("manager_admin"), true);
assert.equal(isCriticalAlertSmsRole("assistant_manager"), true);
assert.equal(isCriticalAlertSmsRole("front_desk_coordinator"), false);
assert.equal(isCriticalAlertSmsRole("daycare", ["super_admin"]), true);

assert.equal(shouldSendCriticalAlertSms({ priority: "Critical" }), true);
assert.equal(shouldSendCriticalAlertSms({ priority: "Urgent" }), true);
assert.equal(shouldSendCriticalAlertSms({ priority: "urgent" }), true);
assert.equal(shouldSendCriticalAlertSms({ urgent: true, priority: "Medium" }), true);
assert.equal(shouldSendCriticalAlertSms({ displayMode: "urgent", priority: "normal" }), true);
assert.equal(shouldSendCriticalAlertSms({ priority: "High" }), false);
assert.equal(shouldSendCriticalAlertSms({ priority: "Medium" }), false);
assert.equal(shouldSendCriticalAlertSms({ priority: "Low" }), false);

assert.match(formatAlertSmsBody("Declined Payment · Smith", "Dog: Lila · Amount: $42"), /Fitdog ALERT/);
assert.ok(formatAlertSmsBody("x".repeat(400)).length <= 320);

assert.equal(normalizeAdminUserPhone("310-828-3647"), "+13108283647");
assert.equal(normalizeAdminUserPhone("+1 424 786 6539"), "+14247866539");
assert.equal(normalizeAdminUserPhone("  "), null);
assert.equal(normalizeAdminUserPhone(""), null);

console.log("critical alert sms tests passed");
