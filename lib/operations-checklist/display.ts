import {
  OPERATIONS_CHECKLIST_ROLE_LABELS,
  OPERATIONS_CHECKLIST_STATUS_LABELS,
  type OperationsChecklistItemView,
  type OperationsChecklistRole,
  type OperationsChecklistStatus
} from "@/lib/operations-checklist/types";

export function statusLabel(status: OperationsChecklistStatus) {
  return OPERATIONS_CHECKLIST_STATUS_LABELS[status] ?? status;
}

export function roleLabel(role: OperationsChecklistRole) {
  return OPERATIONS_CHECKLIST_ROLE_LABELS[role] ?? role;
}

export function formatDueTime(value: string | null | undefined) {
  if (!value) return "—";
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export function formatCompletedAt(value: string | null | undefined, timeZone = "America/Los_Angeles") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function statusToneClass(status: OperationsChecklistStatus) {
  switch (status) {
    case "completed":
      return "ops-check-status--completed";
    case "in_progress":
      return "ops-check-status--in-progress";
    case "needs_attention":
      return "ops-check-status--needs-attention";
    case "blocked":
      return "ops-check-status--blocked";
    case "not_applicable":
      return "ops-check-status--na";
    default:
      return "ops-check-status--not-started";
  }
}

export function myTaskBucketLabel(bucket: OperationsChecklistItemView["my_task_buckets"][number]) {
  switch (bucket) {
    case "assigned_to_me":
      return "Assigned to me";
    case "assigned_to_role":
      return "My role";
    case "due_soon":
      return "Due within 1 hour";
    case "overdue":
      return "Overdue";
    case "returned":
      return "Returned by management";
    case "needs_ack":
      return "Needs acknowledgment";
    default:
      return bucket;
  }
}
