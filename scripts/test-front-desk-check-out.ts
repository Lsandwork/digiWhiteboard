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

const openToday = base({
  status: "Open",
  created_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(openToday), true);

const openPast = base({
  status: "Open",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString()
});
assert.equal(belongsInCrossoverLog(openPast), false);

const checkedOutToday = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Ollie",
  status: "Check Out",
  created_at: new Date().toISOString(),
  resolved_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(checkedOutToday), false, "Check Out never stays on today's crossover");
assert.equal(isClosedShiftLogStatus(checkedOutToday.status), true);

const archivedToday = base({
  status: "Archived",
  created_at: new Date().toISOString(),
  archived_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(archivedToday), false, "Archived never stays on today's crossover");

const resolvedToday = base({
  status: "Resolved",
  created_at: new Date().toISOString(),
  resolved_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(resolvedToday), false, "Resolved never stays on today's crossover");

console.log("front desk check-out tests passed");
