import assert from "node:assert/strict";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";
import {
  belongsInArchivedLog,
  belongsInCrossoverLog,
  belongsInOpenLog,
  isAssessmentDogLog,
  isPacificMidnightHour,
  resolveStatusForShiftLog,
  shouldAutoArchivePreviousDayCrossover
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
assert.equal(shouldAutoArchivePreviousDayCrossover(openToday), false);

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
assert.equal(belongsInArchivedLog(resolvedToday), false, "today Resolved is not archived until midnight/Archive");

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
assert.equal(belongsInOpenLog(openPast), false, "previous-day Open leaves Open Log");
assert.equal(belongsInArchivedLog(openPast), true, "previous-day Open lands in Archived Log");
assert.equal(shouldAutoArchivePreviousDayCrossover(openPast), true);

const inProgressPast = base({
  status: "In Progress",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInOpenLog(inProgressPast), false);
assert.equal(belongsInArchivedLog(inProgressPast), true);
assert.equal(shouldAutoArchivePreviousDayCrossover(inProgressPast), true);

const resolvedPast = base({
  status: "Resolved",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  resolved_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(belongsInCrossoverLog(resolvedPast), false);
assert.equal(belongsInArchivedLog(resolvedPast), true, "past Resolved goes to archive");
assert.equal(shouldAutoArchivePreviousDayCrossover(resolvedPast), true);

const checkedOutPast = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - Remy",
  status: "Check Out",
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  resolved_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(isAssessmentDogLog(checkedOutPast), true);
assert.equal(belongsInCrossoverLog(checkedOutPast), false, "previous-day assessment leaves Crossover");
assert.equal(belongsInArchivedLog(checkedOutPast), true, "past assessment Check Out goes to archive");
assert.equal(
  shouldAutoArchivePreviousDayCrossover(checkedOutPast),
  true,
  "previous-day assessment must auto-archive at Pacific midnight"
);

const openAssessmentPast = base({
  log_type: "New Dog Assessment",
  subject: "New dog assessment - still open",
  status: "Open",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(isAssessmentDogLog(openAssessmentPast), true);
assert.equal(belongsInOpenLog(openAssessmentPast), false);
assert.equal(shouldAutoArchivePreviousDayCrossover(openAssessmentPast), true);

const alreadyArchivedPast = base({
  status: "Archived",
  created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  archived_at: new Date(Date.now() - 2 * 86400000).toISOString()
});
assert.equal(shouldAutoArchivePreviousDayCrossover(alreadyArchivedPast), false);

assert.equal(isPacificMidnightHour(new Date("2026-08-02T07:15:00.000Z")), true);
assert.equal(isPacificMidnightHour(new Date("2026-08-02T15:00:00.000Z")), false);

console.log("front desk check-out tests passed");
