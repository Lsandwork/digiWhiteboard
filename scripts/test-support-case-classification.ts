import assert from "node:assert/strict";
import type { ManagementReport } from "../lib/staff/management-reports";
import { mapReportToInboxRow } from "../lib/staff/management-support-admin";
import {
  caseCreationTimelineSummary,
  caseDisplayTitle,
  caseSubjectLine,
  effectiveCategory,
  inferLegacyCategory,
  submissionTypeLabel,
  titleForNewSubmission
} from "../lib/staff/support-case-display";

function mockReport(partial: Partial<ManagementReport> & Pick<ManagementReport, "report_type">): ManagementReport {
  return {
    id: "mr-test",
    title: partial.title ?? "Groomer Request",
    dog_handler_name: null,
    complaint_category: null,
    employee_name: null,
    summary: partial.summary ?? "",
    write_up_details: null,
    groomer_submission_details: partial.groomer_submission_details ?? null,
    source: "groomer_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: null,
    reviewed_by: null,
    reviewed_at: null,
    created_by: "kat@fitdog.test",
    created_at: "2026-11-08T18:00:00.000Z",
    updated_at: "2026-11-08T18:00:00.000Z",
    submitted_by_name: "Kat",
    submitted_by_role: "groomer",
    department: partial.department ?? "Grooming",
    item_type: partial.item_type,
    category: partial.category ?? null,
    report_type: partial.report_type,
    ...partial
  };
}

const suppliesText =
  "Trash bags: blue, clear, black\nToilet paper\nTreats\nClub treats\nPaper towels\nPens\nMarkers";

const legacyGroomerRequest = mockReport({
  report_type: "groomer_request",
  title: "Groomer Request",
  item_type: "request",
  summary: suppliesText,
  groomer_submission_details: { description: suppliesText }
});

assert.equal(submissionTypeLabel(legacyGroomerRequest), "Employee Request");
assert.equal(inferLegacyCategory(legacyGroomerRequest), "Supplies");
assert.equal(caseDisplayTitle(legacyGroomerRequest), "Supplies Request");
assert.match(caseCreationTimelineSummary(legacyGroomerRequest), /New employee request received: Supplies Request/);

const legacyComplaint = mockReport({
  report_type: "groomer_complaint",
  title: "Groomer Complaint",
  item_type: "complaint",
  groomer_submission_details: { description: "Scheduling conflict on Saturday shifts." }
});
assert.equal(submissionTypeLabel(legacyComplaint), "Employee Complaint");
assert.equal(caseDisplayTitle(legacyComplaint), "Scheduling Complaint");

const newRequest = mockReport({
  report_type: "groomer_request",
  title: titleForNewSubmission({ reportType: "groomer_request", category: "Equipment" }),
  category: "Equipment",
  item_type: "request",
  groomer_submission_details: { description: "Need spare clippers." }
});
assert.equal(caseDisplayTitle(newRequest), "Equipment Request");
assert.equal(effectiveCategory(newRequest), "Equipment");

const frontDeskRequest = mockReport({
  report_type: "team_lead_request",
  title: "General Request",
  department: "Front Desk",
  item_type: "request",
  groomer_submission_details: { description: "Front desk pens." }
});
assert.equal(frontDeskRequest.department, "Front Desk");
assert.equal(submissionTypeLabel(frontDeskRequest), "Employee Request");
assert.notEqual(caseDisplayTitle(frontDeskRequest), "Groomer Request");

const inbox = mapReportToInboxRow(legacyGroomerRequest);
assert.equal(inbox.department, "Grooming");
assert.equal(inbox.item_type, "Request");
assert.equal(inbox.category, "Supplies");
assert.notEqual(inbox.subject, "Groomer Request");
assert.ok(caseSubjectLine(legacyGroomerRequest).length > 0);

const missingCategory = mockReport({
  report_type: "trainer_request",
  title: "Trainer Request",
  department: "Training",
  item_type: "request",
  groomer_submission_details: { description: "Hello" }
});
assert.equal(caseDisplayTitle(missingCategory), "General Request");

console.log("support case classification tests passed");
