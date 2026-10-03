import type { StaffOpsPriority, StaffOpsStatus } from "@/lib/staff/admin-ops";
import { resolveStatusForShiftLog } from "@/lib/staff/front-desk-log";
import type { CrossoverMessage } from "@/lib/staff/admin-ops";

/** Closed statuses for employee Open vs Archive (backend values preserved). */
export const CLOSED_STAFF_OPS_STATUSES: StaffOpsStatus[] = [
  "Resolved",
  "Completed",
  "Check Out",
  "Archived"
];

const CLOSED_SET = new Set<string>(CLOSED_STAFF_OPS_STATUSES);

export function isStaffOpsStatusOpen(status: StaffOpsStatus | string | null | undefined): boolean {
  if (!status) return true;
  return !CLOSED_SET.has(String(status));
}

export function isStaffOpsStatusClosed(status: StaffOpsStatus | string | null | undefined): boolean {
  return !isStaffOpsStatusOpen(status);
}

export type EmployeeStatusLabel = "Open" | "In progress" | "Waiting" | "Done";

export function employeeStatusLabel(status: StaffOpsStatus | string | null | undefined): EmployeeStatusLabel {
  const s = String(status ?? "Open");
  if (CLOSED_SET.has(s)) return "Done";
  if (s === "In Progress") return "In progress";
  if (
    s === "Waiting on Owner" ||
    s === "Waiting on Staff" ||
    s === "Pending Review" ||
    s === "Needs Management Review"
  ) {
    return "Waiting";
  }
  return "Open";
}

export function completionStatusForNote(item: Pick<CrossoverMessage, "subject" | "message" | "details" | "log_type" | "template_title">): StaffOpsStatus {
  return resolveStatusForShiftLog(item);
}

export function mapEmployeePriorityToBackend(priority: "Normal" | "High" | "Urgent"): StaffOpsPriority {
  if (priority === "Urgent") return "Urgent";
  if (priority === "High") return "High";
  return "Normal";
}

export function mapBackendPriorityForEmployee(priority: StaffOpsPriority): "Normal" | "High" | "Urgent" {
  if (priority === "Urgent" || priority === "Critical") return "Urgent";
  if (priority === "High") return "High";
  return "Normal";
}

export function needsResolutionNoteOnComplete(priority: StaffOpsPriority, urgent?: boolean): boolean {
  return urgent === true || priority === "High" || priority === "Urgent" || priority === "Critical";
}
