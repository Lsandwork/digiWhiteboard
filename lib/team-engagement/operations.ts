import type { SupabaseClient } from "@supabase/supabase-js";
import { rbacDepartmentForStaffLabel } from "@/lib/admin/user-access";
import { listStaffOps, type StaffOpsState, type StaffOpsStatus } from "@/lib/staff/admin-ops";
import type { OperationsSnapshot, WorkItem } from "@/lib/team-engagement/context";
import { pacificTodayKey } from "@/lib/user-interactions/pacific";

const CLOSED_STATUSES = new Set<StaffOpsStatus>(["Completed", "Resolved", "Check Out", "Archived"]);
const URGENT_PRIORITIES = new Set(["High", "Urgent", "Critical"]);

export const WORKLOAD_MISSING_DATA = [
  "Shift schedules and time clock hours are not stored in RuffOps, so coverage and hours worked can't be measured.",
  "Gingr reservations and dog counts are not connected to Team Engagement.",
  "Assignments are matched to people by the name typed into Team Log, Owner Follow Up, and Active Issues."
];

function isOverdue(due: string | null | undefined, open: boolean, now: number) {
  if (!open || !due) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(due)) return due < pacificTodayKey(new Date(now));
  const time = Date.parse(due);
  return Number.isFinite(time) && time < now;
}

/** Open and recently closed work from Team Log, Owner Follow Up, and Active Issues. */
export async function loadOperationsSnapshot(supabase: SupabaseClient, now = Date.now()): Promise<OperationsSnapshot> {
  return operationsSnapshotFromState(await listStaffOps(supabase), now);
}

export function operationsSnapshotFromState(
  state: Pick<StaffOpsState, "crossover_messages" | "owner_follow_ups" | "active_issues">,
  now = Date.now()
): OperationsSnapshot {
  const items: WorkItem[] = [];
  for (const message of state.crossover_messages) {
    if (message.archived_at) continue;
    const open = !CLOSED_STATUSES.has(message.status);
    items.push({
      source: "team_log",
      department: rbacDepartmentForStaffLabel(message.to_department),
      assigneeName: message.assigned_to?.trim() || null,
      open,
      urgent: message.urgent || URGENT_PRIORITIES.has(message.priority),
      overdue: isOverdue(message.due_at, open, now),
      createdAt: message.created_at,
      closedAt: message.resolved_at
    });
  }
  for (const followUp of state.owner_follow_ups) {
    const open = !CLOSED_STATUSES.has(followUp.status);
    items.push({
      source: "owner_follow_up",
      department: rbacDepartmentForStaffLabel(followUp.department),
      assigneeName: followUp.assigned_to?.trim() || null,
      open,
      urgent: followUp.urgent || URGENT_PRIORITIES.has(followUp.priority),
      overdue: isOverdue(followUp.due_date, open, now),
      createdAt: followUp.created_at,
      closedAt: followUp.resolved_at
    });
  }
  for (const issue of state.active_issues) {
    const open = !CLOSED_STATUSES.has(issue.status);
    items.push({
      source: "active_issue",
      department: null,
      assigneeName: issue.assigned_to?.trim() || null,
      open,
      urgent: URGENT_PRIORITIES.has(issue.priority),
      overdue: isOverdue(issue.due_at, open, now),
      createdAt: issue.created_at,
      closedAt: issue.resolved_at
    });
  }
  return { items, missing: WORKLOAD_MISSING_DATA };
}
