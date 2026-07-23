import assert from "node:assert/strict";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";
import {
  belongsInArchivedLog,
  belongsInCrossoverLog,
  belongsInOpenLog,
  isAssessmentDogLog,
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

const openToday = base({ status: "Open", created_at: new Date().toISOString() });
assert.equal(belongsInCrossoverLog(openToday), true);
assert.equal(belongsInOpenLog(openToday), true);
assert.equal(belongsInArchivedLog(openToday), false);

const inProgressToday = base({ status: "In Progress", created_at: new Date().toISOString() });
assert.equal(belongsInCrossoverLog(inProgressToday), true, "today In Progress stays on crossover");
assert.equal(belongsInOpenLog(inProgressToday), true);

const pendingToday = base({ status: "Pending Review", created_at: new Date().toISOString() });
assert.equal(belongsInCrossoverLog(pendingToday), true);

const resolvedToday = base({
  status: "Resolved",
  created_at: new Date().toISOString(),
  resolved_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(resolvedToday), true, "today Resolved stays on crossover");
assert.equal(belongsInArchivedLog(resolvedToday), false, "today Resolved is not archived until Archive click");

const checkedOutToday = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Ollie",
  status: "Check Out",
  created_at: new Date().toISOString(),
  resolved_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(checkedOutToday), true, "today Check Out stays on crossover");
assert.equal(belongsInArchivedLog(checkedOutToday), false);

const archivedToday = base({
  status: "Archived",
  created_at: new Date().toISOString(),
  archived_at: new Date().toISOString()
});
assert.equal(belongsInCrossoverLog(archivedToday), false, "Archive click removes from crossover");
assert.equal(belongsInArchivedLog(archivedToday), true);

const openPast = base({
  status: "Open",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString()
});
assert.equal(belongsInCrossoverLog(openPast), false);
assert.equal(belongsInOpenLog(openPast), true);
assert.equal(belongsInArchivedLog(openPast), false);

const inProgressPast = base({
  status: "In Progress",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInOpenLog(inProgressPast), true);
assert.equal(belongsInArchivedLog(inProgressPast), false);

const resolvedPast = base({
  status: "Resolved",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  resolved_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInCrossoverLog(resolvedPast), false);
assert.equal(belongsInArchivedLog(resolvedPast), true, "past Resolved goes to archive");

const checkedOutPast = base({
  status: "Check Out",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  resolved_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInArchivedLog(checkedOutPast), true, "past Check Out goes to archive");

console.log("front desk check-out tests passed");
