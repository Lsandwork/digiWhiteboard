import assert from "node:assert/strict";
import type { ManagementReport } from "../lib/staff/management-reports";
import type { StaffOpsState } from "../lib/staff/admin-ops";
import { dispatchStaffOpsNotifications, appendStaffEmailNotification } from "../lib/staff/notifications";
import {
  canonicalSupportStatus,
  managementAlertForNewSubmission,
  planSupportAction,
  redactSupportForSubmitter
} from "../lib/staff/support-workflow";

function report(partial: Partial<ManagementReport> = {}): ManagementReport {
  return {
    id: "report-1",
    report_type: "groomer_request",
    title: "Supplies Request",
    dog_handler_name: null,
    complaint_category: null,
    employee_name: null,
    summary: "Need trash bags",
    write_up_details: null,
    groomer_submission_details: { description: "Need trash bags" },
    source: "groomer_form",
    status: "Needs Review",
    visibility: "admin_management",
    push_notice_id: null,
    related_notes: "secret internal context",
    reviewed_by: null,
    reviewed_at: null,
    created_by: "kat@fitdog.test",
    submitted_by_name: "Kat",
    submitted_by_role: "groomer",
    created_at: "2026-11-13T18:00:00.000Z",
    updated_at: "2026-11-13T18:00:00.000Z",
    item_type: "request",
    priority: "Low",
    admin_status: "New",
    comments: [
      {
        id: "private",
        user_id: null,
        user_name: "Manager",
        user_role: "admin",
        body: "Do not show this to Kat",
        visibility: "internal",
        created_at: "2026-11-13T18:05:00.000Z"
      }
    ],
    audit_history: [
      {
        id: "audit-1",
        action: "add_internal_note",
        previous_value: null,
        new_value: "Do not show this to Kat",
        performed_by: "Manager",
        created_at: "2026-11-13T18:05:00.000Z"
      }
    ],
    ...partial
  };
}

assert.equal(canonicalSupportStatus("Submitted"), "New");
assert.equal(canonicalSupportStatus("In Review"), "In Progress");
assert.equal(canonicalSupportStatus("Needs More Info"), "In Progress");
assert.equal(canonicalSupportStatus("Acknowledged"), "Acknowledged");
assert.equal(canonicalSupportStatus("Resolved"), "Resolved");

const acknowledged = planSupportAction(report(), "acknowledge", {}, "Avery Admin", "2026-11-13T19:00:00.000Z");
assert.equal(acknowledged.unchanged, false);
assert.equal(acknowledged.patch.admin_status, "Acknowledged");
assert.equal(acknowledged.patch.acknowledged_by, "Avery Admin");
assert.equal(acknowledged.notify?.audience, "submitter");
assert.match(acknowledged.notify?.body ?? "", /Kat|request|Supplies Request|acknowledged/i);
assert.match(acknowledged.notify?.title ?? "", /acknowledged/i);

const again = planSupportAction(
  report({ admin_status: "Acknowledged", acknowledged_at: "2026-11-13T19:00:00.000Z" }),
  "acknowledge",
  {},
  "Avery Admin"
);
assert.equal(again.unchanged, true);
assert.equal(again.notify, null);

const progress = planSupportAction(report({ admin_status: "Acknowledged" }), "mark_in_progress", {}, "Avery Admin", "2026-11-13T20:00:00.000Z");
assert.equal(progress.patch.admin_status, "In Progress");
assert.equal(progress.patch.in_progress_by, "Avery Admin");
assert.match(progress.notify?.body ?? "", /actively reviewing/i);

const resolved = planSupportAction(
  report({ admin_status: "In Progress" }),
  "change_status",
  { status: "Resolved", resolution: "Bags are stocked." },
  "Avery Admin",
  "2026-11-13T21:00:00.000Z"
);
assert.equal(resolved.patch.admin_status, "Resolved");
assert.equal(resolved.patch.resolved_by, "Avery Admin");
assert.match(resolved.notify?.body ?? "", /Bags are stocked/);
assert.match(resolved.notify?.body ?? "", /resolved/i);

const note = planSupportAction(report(), "add_internal_note", { body: "Check the closet" }, "Avery Admin");
assert.equal(note.notify, null);
assert.equal(note.patch.comments?.at(-1)?.visibility, "internal");

const reply = planSupportAction(report(), "add_response", { body: "We ordered bags." }, "Avery Admin", "2026-11-13T21:30:00.000Z");
assert.equal(reply.patch.comments?.at(-1)?.visibility, "visible_to_submitter");
assert.equal(reply.notify?.audience, "submitter");
assert.match(reply.notify?.body ?? "", /We ordered bags/);

assert.throws(() => planSupportAction(report(), "add_submitter_reply", { body: "Thanks" }, "someone-else@fitdog.test"), /own submissions/);

const employeeReply = planSupportAction(report(), "add_submitter_reply", { body: "Still need them", user_role: "groomer" }, "kat@fitdog.test");
assert.equal(employeeReply.notify?.audience, "management");
assert.equal(employeeReply.notify?.urgent, true);

const lowAlert = managementAlertForNewSubmission(report({ priority: "Low" }), "Kat");
assert.equal(lowAlert.urgent, true);
assert.equal(lowAlert.priority, "Urgent");
assert.match(lowAlert.body, /Kat/);
assert.match(lowAlert.body, /request/i);
assert.match(lowAlert.body, /Supplies Request/);
assert.match(lowAlert.body, /Management attention is required/);
assert.match(lowAlert.dedupeKey, /:created$/);

const redacted = redactSupportForSubmitter(report());
assert.equal(redacted.comments?.length, 0);
assert.deepEqual(redacted.audit_history, []);
assert.equal(redacted.related_notes, null);

const state = {
  staff_directory: [],
  notifications: []
} as unknown as StaffOpsState;

const first = dispatchStaffOpsNotifications(state, {
  eventType: "auto_issue",
  sourceTable: "management_reports",
  sourceId: "report-1",
  sourceTab: "management_support",
  title: lowAlert.title,
  body: lowAlert.body,
  priority: "Urgent",
  urgent: true,
  needsManagementReview: true,
  actor: "Kat",
  dedupeKey: lowAlert.dedupeKey,
  adminPoolOnly: true
});
assert.equal(first.notifications.length > 0, true);
assert.equal(first.notifications.some((item) => item.target.kind === "coordinator_pool"), false);
assert.equal(first.notifications.some((item) => item.target.kind === "admin_pool"), true);
const second = dispatchStaffOpsNotifications(first, {
  eventType: "auto_issue",
  sourceTable: "management_reports",
  sourceId: "report-1",
  sourceTab: "management_support",
  title: lowAlert.title,
  body: lowAlert.body,
  priority: "Urgent",
  urgent: true,
  needsManagementReview: true,
  actor: "Kat",
  dedupeKey: lowAlert.dedupeKey,
  adminPoolOnly: true
});
assert.equal(second.notifications.length, first.notifications.length);

const emailed = appendStaffEmailNotification(
  state,
  {
    eventType: "reply",
    sourceTable: "management_reports",
    sourceId: "report-1",
    sourceTab: "management_support",
    title: "Management acknowledged your request",
    body: "Avery acknowledged it",
    priority: "Low",
    actor: "Avery Admin",
    dedupeKey: "support-employee:report-1:acknowledged"
  },
  "kat@fitdog.test"
);
const emailedAgain = appendStaffEmailNotification(
  emailed,
  {
    eventType: "reply",
    sourceTable: "management_reports",
    sourceId: "report-1",
    sourceTab: "management_support",
    title: "Management acknowledged your request",
    body: "Avery acknowledged it",
    priority: "Low",
    actor: "Avery Admin",
    dedupeKey: "support-employee:report-1:acknowledged"
  },
  "kat@fitdog.test"
);
assert.equal(emailedAgain.notifications.length, emailed.notifications.length);
assert.equal(emailed.notifications[0]?.target.kind, "staff_email");

console.log("support workflow tests passed");
