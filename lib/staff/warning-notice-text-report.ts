import type { EmployeeWriteUpDetails } from "@/lib/staff/management-reports";
import { WARNING_NOTICE_VIOLATION_TYPES } from "@/lib/staff/warning-notice-constants";

function line(label: string, value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return `${label}: ${trimmed || "—"}`;
}

function checkedTypes(details: EmployeeWriteUpDetails) {
  const selected = details.violation_types?.length
    ? details.violation_types
    : [];
  if (!selected.length) return "—";
  const labels = selected.map((type) =>
    type === "Other" && details.violation_other ? `Other (${details.violation_other})` : type
  );
  return labels.join(", ");
}

export function buildWarningNoticeTextReport(
  details: EmployeeWriteUpDetails,
  meta?: { reportId?: string; submittedAt?: string; submittedBy?: string | null }
) {
  const rows: string[] = [
    "FITDOG SPORTS CLUB, LLC — WARNING NOTICE (HR RECORD)",
    "====================================================",
    meta?.reportId ? `Report ID: ${meta.reportId}` : "",
    meta?.submittedAt ? `Submitted: ${new Date(meta.submittedAt).toLocaleString()}` : "",
    meta?.submittedBy ? `Submitted by: ${meta.submittedBy}` : "",
    "",
    line("Employee", details.employee_name),
    line("Date of Violation", details.violation_date ?? details.incident_date),
    line("Documented by", details.documented_by),
    line("Time of Violation", details.violation_time ?? details.incident_time),
    line("Type of Violation", checkedTypes(details)),
    "",
    "Statement of Violation:",
    details.statement_of_violation ?? details.incident_description ?? "—",
    "",
    "Employee Statement:",
    details.employee_statement ?? "—",
    "",
    "--- Management section ---",
    line("Date of Warning", details.date_of_warning),
    line("Type of Warning", details.type_of_warning),
    line("Employee No.", details.employee_number),
    line("Department", details.employee_department),
    "",
    "Previous Warnings:"
  ];

  const warnings = details.previous_warnings?.length
    ? details.previous_warnings
    : [];
  if (warnings.length) {
    warnings.forEach((row, index) => {
      rows.push(
        `  ${index + 1}. ${line("Date", row.date)} | Verbal: ${row.verbal ? "Yes" : "No"} | Written: ${row.written ? "Yes" : "No"} | By: ${row.by_whom || "—"}`
      );
      if (row.violation_details) rows.push(`     Details: ${row.violation_details}`);
    });
  } else {
    rows.push("  —");
  }

  rows.push(
    "",
    "Action to be Taken:",
    details.action_to_be_taken ?? details.corrective_action ?? "—",
    "",
    line("Employee Signature", details.employee_signature),
    line("Employee Signature Date", details.employee_signature_date),
    line("Manager Signature", details.manager_signature ?? details.team_lead_signature),
    line("Manager Signature Date", details.manager_signature_date),
    "",
    "Violation types available:",
    WARNING_NOTICE_VIOLATION_TYPES.join(", ")
  );

  return rows.filter((row, index, all) => !(row === "" && all[index - 1] === "")).join("\n");
}
