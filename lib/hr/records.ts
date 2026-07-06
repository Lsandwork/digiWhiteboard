import type { ManagementReport, ManagementReportType } from "@/lib/staff/management-reports";
import { getOwnerComplaintCategoryLabel } from "@/lib/staff/push-notices";

export type HrRecordKind = "write_up" | "complaint";

export type HrRecord = {
  id: string;
  kind: HrRecordKind;
  report_type: ManagementReportType;
  title: string;
  subject_name: string | null;
  department: string | null;
  summary: string;
  status: string;
  priority: string;
  created_at: string;
  created_by: string | null;
  has_pdf: boolean;
  hr_tracked: boolean;
  complaint_category: string | null;
};

const COMPLAINT_TYPES = new Set<ManagementReportType>([
  "owner_complaint_dog_handler",
  "groomer_complaint",
  "trainer_complaint"
]);

export function isHrComplaintReport(report: ManagementReport) {
  return COMPLAINT_TYPES.has(report.report_type);
}

export function isHrWriteUpReport(report: ManagementReport) {
  return report.report_type === "employee_write_up";
}

export function isHrRecord(report: ManagementReport) {
  return isHrWriteUpReport(report) || isHrComplaintReport(report);
}

export function toHrRecord(report: ManagementReport): HrRecord {
  const kind: HrRecordKind = isHrWriteUpReport(report) ? "write_up" : "complaint";
  const writeUp = report.write_up_details;

  let subject_name = report.employee_name ?? report.dog_handler_name ?? report.related_staff_name ?? null;
  if (writeUp?.employee_name) subject_name = writeUp.employee_name;

  let department = report.department ?? writeUp?.employee_department ?? null;
  let summary = report.summary;
  if (writeUp?.text_report) summary = writeUp.text_report.slice(0, 280);
  else if (writeUp?.statement_of_violation) summary = writeUp.statement_of_violation.slice(0, 280);

  return {
    id: report.id,
    kind,
    report_type: report.report_type,
    title: report.title,
    subject_name,
    department,
    summary,
    status: report.admin_status ?? report.status,
    priority: report.priority ?? "Normal",
    created_at: report.created_at,
    created_by: report.created_by,
    has_pdf: Boolean(writeUp?.pdf_filename),
    hr_tracked: writeUp?.hr_tracked ?? kind === "write_up",
    complaint_category: report.complaint_category
      ? getOwnerComplaintCategoryLabel(report.complaint_category)
      : null
  };
}

export function buildHrHubStats(records: HrRecord[]) {
  const writeUps = records.filter((r) => r.kind === "write_up");
  const complaints = records.filter((r) => r.kind === "complaint");
  const open = records.filter((r) => !["Closed", "Resolved", "Reviewed"].includes(r.status));
  const urgent = records.filter((r) => r.priority === "Urgent");

  return {
    total: records.length,
    write_ups: writeUps.length,
    complaints: complaints.length,
    open: open.length,
    urgent: urgent.length
  };
}

export function formatHrReportType(type: ManagementReportType) {
  switch (type) {
    case "employee_write_up":
      return "Employee Write-Up";
    case "owner_complaint_dog_handler":
      return "Owner Complaint";
    case "groomer_complaint":
      return "Groomer Complaint";
    case "trainer_complaint":
      return "Trainer Complaint";
    default:
      return type.replace(/_/g, " ");
  }
}

export function hrRecordContextForConsult(report: ManagementReport) {
  const record = toHrRecord(report);
  const lines = [
    `Record type: ${formatHrReportType(report.report_type)}`,
    `Title: ${report.title}`,
    `Subject: ${record.subject_name ?? "Unknown"}`,
    `Department: ${record.department ?? "Unknown"}`,
    `Status: ${record.status}`,
    `Priority: ${record.priority}`,
    `Created: ${report.created_at}`,
    `Summary: ${report.summary}`
  ];

  if (report.write_up_details?.text_report) {
    lines.push("", "Full write-up text:", report.write_up_details.text_report);
  } else if (report.write_up_details?.statement_of_violation) {
    lines.push("", "Statement of violation:", report.write_up_details.statement_of_violation);
  }

  if (report.groomer_submission_details?.description) {
    lines.push("", "Submission details:", report.groomer_submission_details.description);
  }

  return lines.join("\n");
}
