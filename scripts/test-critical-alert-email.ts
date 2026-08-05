import assert from "node:assert/strict";
import {
  buildCriticalAlertEmailRecipients,
  CRITICAL_ALERT_SUPER_ADMIN_EMAIL,
  formatAlertEmailSubject,
  normalizeAlertEmail,
  shouldSendCriticalAlertEmail
} from "../lib/admin/alert-email";

assert.equal(CRITICAL_ALERT_SUPER_ADMIN_EMAIL, "lonnie@fitdog.com");

assert.equal(shouldSendCriticalAlertEmail({ priority: "Critical" }), true);
assert.equal(shouldSendCriticalAlertEmail({ priority: "Urgent" }), true);
assert.equal(shouldSendCriticalAlertEmail({ priority: "urgent" }), true);
assert.equal(shouldSendCriticalAlertEmail({ urgent: true, priority: "Medium" }), true);
assert.equal(shouldSendCriticalAlertEmail({ displayMode: "urgent", priority: "normal" }), true);
assert.equal(shouldSendCriticalAlertEmail({ priority: "High" }), false);
assert.equal(shouldSendCriticalAlertEmail({ priority: "Medium" }), false);
assert.equal(shouldSendCriticalAlertEmail({ priority: "Low" }), false);

assert.deepEqual(buildCriticalAlertEmailRecipients(null), ["lonnie@fitdog.com"]);
assert.deepEqual(buildCriticalAlertEmailRecipients(""), ["lonnie@fitdog.com"]);
assert.deepEqual(buildCriticalAlertEmailRecipients("lonnie@fitdog.com"), ["lonnie@fitdog.com"]);
assert.deepEqual(buildCriticalAlertEmailRecipients("ops@fitdog.com").sort(), [
  "lonnie@fitdog.com",
  "ops@fitdog.com"
]);

assert.equal(normalizeAlertEmail(" Lonnie@Fitdog.com "), "lonnie@fitdog.com");
assert.equal(normalizeAlertEmail("not-an-email"), null);
assert.equal(normalizeAlertEmail("  "), null);

assert.match(formatAlertEmailSubject("Declined Payment · Smith", "Critical"), /\[Fitdog Critical\]/);
assert.ok(formatAlertEmailSubject("x".repeat(400)).length <= 200);

console.log("critical alert email tests passed");
