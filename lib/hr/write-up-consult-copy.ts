export const UPLOADED_WRITE_UP_SCAN_PROMPT =
  "Scan the attached uploaded write-up. Summarize the key facts, then recommend the best next step and practical advice for Fitdog managers and admins.";

export function isUploadedHrWriteUp(report: { report_type?: string | null; source?: string | null } | null | undefined) {
  return report?.report_type === "employee_write_up" && report?.source === "hr_upload";
}
