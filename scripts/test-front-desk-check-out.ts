import assert from "node:assert/strict";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";
import {
  belongsInCrossoverLog,
  isAssessmentDogLog,
  isClosedShiftLogStatus,
  resolveStatusForShiftLog
} from "@/lib/staff/front-desk-log";

function base(partial: Partial<CrossoverMessage>): CrossoverMessage {
  return {
    id: "1",
    subject: "Note",
    message: "Details",
    details: "Details",
    from_department: "Front Desk",
    to_department: "Front Desk",
    priority: "Normal",
    status: "Open",
    created_by: "staff",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    template_title: null,
    ...partial
  } as CrossoverMessage;
}

const assessment = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Misa",
  related_dog_name: "Misa"
});
assert.equal(isAssessmentDogLog(assessment), true);
assert.equal(resolveStatusForShiftLog(assessment), "Check Out");

const general = base({ log_type: "General Shift Note", subject: "Water bowls" });
assert.equal(isAssessmentDogLog(general), false);
assert.equal(resolveStatusForShiftLog(general), "Resolved");

const checkedOutToday = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Ollie",
  status: "Check Out",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  resolved_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(checkedOutToday), true);
assert.equal(isClosedShiftLogStatus(checkedOutToday.status), true);

const checkedOutYesterday = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Past",
  status: "Check Out",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  resolved_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  updated_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInCrossoverLog(checkedOutYesterday), false);

const archivedAssessmentToday = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Archived today",
  status: "Archived",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  archived_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(archivedAssessmentToday), true);

console.log("front desk check-out tests passed");
