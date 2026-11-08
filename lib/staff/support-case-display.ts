import type { ManagementReport } from "@/lib/staff/management-reports";

/** Legacy titles that conflated department/role with the case category. */
export const LEGACY_ROLE_TITLES = new Set([
  "Groomer Complaint",
  "Groomer Request",
  "Trainer Complaint",
  "Trainer Request",
  "Team Lead Request"
]);

export const SUPPORT_REQUEST_CATEGORIES = [
  "Supplies",
  "Facility",
  "Maintenance",
  "Scheduling",
  "Equipment",
  "Other"
] as const;

export const SUPPORT_COMPLAINT_CATEGORIES = [
  "Operational Issue",
  "Workplace Concern",
  "Client Interaction",
  "Other"
] as const;

export type SupportRequestCategory = (typeof SUPPORT_REQUEST_CATEGORIES)[number];
export type SupportComplaintCategory = (typeof SUPPORT_COMPLAINT_CATEGORIES)[number];

function isRequest(report: ManagementReport) {
  if (report.item_type === "request") return true;
  if (report.item_type === "complaint") return false;
  return report.report_type.includes("request");
}

function detailsText(report: ManagementReport) {
  return (report.groomer_submission_details?.description ?? report.summary ?? "").toLowerCase();
}

/** Best-effort category for legacy rows that never stored `category`. */
export function inferLegacyCategory(report: ManagementReport): string | null {
  const text = detailsText(report);
  if (!text) return null;
  if (/\b(suppl|trash bag|toilet paper|paper towel|treat|pen|marker|club treat|restock|inventory)\b/.test(text)) {
    return "Supplies";
  }
  if (/\b(schedul\w*|shift|coverage|time off|pto)\b/.test(text)) return "Scheduling";
  if (/\b(equipment|tool|machine|dryer|tub)\b/.test(text)) return "Equipment";
  if (/\b(maintenance|repair|broken|fix)\b/.test(text)) return "Maintenance";
  if (/\b(facility|building|door|gate|plumbing)\b/.test(text)) return "Facility";
  return null;
}

export function effectiveCategory(report: ManagementReport): string {
  const stored = report.category?.trim();
  if (stored) return stored;
  return inferLegacyCategory(report) ?? "General";
}

export function submissionTypeLabel(report: ManagementReport): string {
  if (report.report_type === "owner_complaint_dog_handler") return "Client complaint";
  if (report.report_type === "employee_write_up") return "Performance concern";
  return isRequest(report) ? "Employee Request" : "Employee Complaint";
}

/** Heading for timeline, modal, alerts — never the legacy role name alone. */
export function caseDisplayTitle(report: ManagementReport): string {
  if (report.title && !LEGACY_ROLE_TITLES.has(report.title)) {
    return report.title;
  }
  const category = effectiveCategory(report);
  return isRequest(report) ? `${category} Request` : `${category} Complaint`;
}

export function caseSubjectLine(report: ManagementReport): string {
  if (report.title && !LEGACY_ROLE_TITLES.has(report.title)) {
    return report.title;
  }
  const custom = detailsText(report);
  if (custom.length >= 12) {
    const raw = report.groomer_submission_details?.description ?? report.summary ?? "";
    return raw.slice(0, 80) || caseDisplayTitle(report);
  }
  return caseDisplayTitle(report);
}

export function caseCreationTimelineSummary(report: ManagementReport): string {
  const type = submissionTypeLabel(report);
  return `New ${type.toLowerCase()} received: ${caseDisplayTitle(report)}`;
}

export function normalizeSupportCategory(
  value: unknown,
  kind: "request" | "complaint"
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const allowed = kind === "request" ? SUPPORT_REQUEST_CATEGORIES : SUPPORT_COMPLAINT_CATEGORIES;
  const match = allowed.find((c) => c.toLowerCase() === raw.toLowerCase());
  return match ?? "Other";
}

export function titleForNewSubmission(input: {
  reportType: ManagementReport["report_type"];
  category: string | null;
}): string {
  const isReq = input.reportType.endsWith("_request");
  const category = input.category?.trim() || "General";
  return isReq ? `${category} Request` : `${category} Complaint`;
}
