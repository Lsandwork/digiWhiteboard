import assert from "node:assert/strict";
import { isCriticalOrUrgentStaffNote } from "../lib/staff/super-admin-sms";

assert.equal(isCriticalOrUrgentStaffNote({ priority: "Critical" }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Urgent" }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "High", urgent: true }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "High" }), false);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Medium", urgent: false }), false);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Normal" }), false);

console.log("super-admin-sms: ok");
