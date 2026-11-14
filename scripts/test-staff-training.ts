import assert from "node:assert/strict";
import { STAFF_TRAINING_COURSES, courseForRole, estimatedCourseMinutes } from "../lib/staff-training/catalog";
import { canAccessAdminTab, accessFromLegacyRole } from "../lib/admin/permissions";

function tab(role: string, tab: string) {
  const access = accessFromLegacyRole(null, `${role}@example.com`, role);
  return canAccessAdminTab(access, tab, role, "staff");
}

assert.equal(tab("front_desk_coordinator", "staff_training"), true);
assert.equal(tab("overnight", "staff_training"), true);
assert.equal(tab("daycare", "staff_training"), false);
assert.equal(tab("manager_admin", "staff_training"), true);

const fd = courseForRole("front_desk_coordinator");
const on = courseForRole("overnight");
assert.ok(fd && fd.lessons.length >= 8);
assert.ok(on && on.lessons.length >= 6);
assert.ok(fd.lessons.every((l) => l.narrationScript.length > 40));
assert.ok(on.lessons.every((l) => l.narrationStatus === "pending_human"));
assert.equal(fd.lessons.some((l) => l.verificationNotes?.length), true);
assert.ok(estimatedCourseMinutes(fd) > 30);

console.log("test-staff-training: ok");