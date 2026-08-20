import assert from "node:assert/strict";
import {
  findSuperAdminSmsKeyword,
  isCriticalOrUrgentStaffNote,
  isUrgentPushAlert,
  resolveSuperAdminPhones,
  staffContentNeedsSuperAdminSms,
  textTriggersSuperAdminSms
} from "../lib/staff/super-admin-sms";

assert.equal(isCriticalOrUrgentStaffNote({ priority: "Critical" }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Urgent" }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "High", urgent: true }), true);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "High" }), false);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Medium", urgent: false }), false);
assert.equal(isCriticalOrUrgentStaffNote({ priority: "Normal" }), false);

assert.equal(findSuperAdminSmsKeyword("Possible puncture wound on paw"), "puncture");
assert.equal(findSuperAdminSmsKeyword("There was a dog fight in yard 2"), "dog fight");
assert.equal(findSuperAdminSmsKeyword("Dogs started to fight near the gate"), "fight");
assert.equal(findSuperAdminSmsKeyword("Angry owner at front desk"), "angry owner");
assert.equal(findSuperAdminSmsKeyword("Sick dog — lethargic"), "sick dog");
assert.equal(findSuperAdminSmsKeyword("Remy is not eating breakfast"), "not eating");
assert.equal(findSuperAdminSmsKeyword("Missing meds for Osita"), "missing meds");
assert.equal(findSuperAdminSmsKeyword("Missing medication this morning"), "missing meds");
assert.equal(findSuperAdminSmsKeyword("Please write up the handler"), "write up");
assert.equal(findSuperAdminSmsKeyword("Handler was written up yesterday"), "write up");
assert.equal(findSuperAdminSmsKeyword("Normal daycare note about playgroup"), null);
assert.equal(textTriggersSuperAdminSms("All good today"), false);

assert.equal(
  staffContentNeedsSuperAdminSms({ priority: "Normal", subject: "Sick dog in medical", details: "Monitor" }),
  true
);
assert.equal(
  staffContentNeedsSuperAdminSms({ priority: "Normal", subject: "Pickup reminder", details: "Owner late" }),
  false
);
assert.equal(staffContentNeedsSuperAdminSms({ priority: "Critical", subject: "Anything" }), true);

assert.equal(isUrgentPushAlert({ priority: "urgent", display_mode: "normal" }), true);
assert.equal(isUrgentPushAlert({ priority: "normal", display_mode: "urgent" }), true);
assert.equal(isUrgentPushAlert({ priority: "emergency" }), true);
assert.equal(isUrgentPushAlert({ priority: "important", display_mode: "normal" }), false);

void (async () => {
  const phones = await resolveSuperAdminPhones();
  assert.equal(phones.length, 3);
  assert.deepEqual(
    phones.sort(),
    ["+12139131391", "+14152509297", "+14044683303"].sort()
  );
  console.log("super-admin-sms: ok");
})();
