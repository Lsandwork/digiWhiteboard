/**
 * Unified Command Center row actions — maps UI verbs onto source-system statuses
 * so My Shift / OCC / Staff Ops / Fitdog Alerts stay in sync.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { updateOpsTaskStatus } from "@/lib/ops-command-center/tasks";
import {
  acknowledgeOpsNotification,
  resolveOpsNotification
} from "@/lib/ops-command-center/notifications";
import { recordOpsEvent } from "@/lib/ops-command-center/events";
import { writeOpsAuditEvent } from "@/lib/ops-command-center/audit";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { updateOwnerFollowUp, updateActiveIssue } from "@/lib/staff/admin-ops";
import { updateOperationsAlert } from "@/lib/fitdog-ops/store";
import type { OpsWorkItem } from "@/lib/ops-command-center/adapters/staff-ops-feed";

export const WORK_ITEM_ACTIONS = [
  "clear",
  "hide",
  "archive",
  "in_progress",
  "resolved",
  "delete"
] as const;

export type WorkItemAction = (typeof WORK_ITEM_ACTIONS)[number];

export type WorkItemKind = OpsWorkItem["kind"];

export type WorkItemActor = {
  adminId?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
};

const ACTION_LABELS: Record<WorkItemAction, string> = {
  clear: "Clear",
  hide: "Hide",
  archive: "Archive",
  in_progress: "In Progress",
  resolved: "Resolved",
  delete: "Delete"
};

export function workItemActionLabel(action: WorkItemAction) {
  return ACTION_LABELS[action];
}

export function parseWorkItemId(rawId: string): { kind: WorkItemKind; sourceId: string } | null {
  const id = String(rawId || "").trim();
  if (id.startsWith("task:")) return { kind: "ops_task", sourceId: id.slice(5) };
  if (id.startsWith("followup:")) return { kind: "owner_follow_up", sourceId: id.slice(9) };
  if (id.startsWith("issue:")) return { kind: "active_issue", sourceId: id.slice(6) };
  if (id.startsWith("payment:")) return { kind: "payment_alert", sourceId: id.slice(8) };
  if (id.startsWith("notif:")) return { kind: "ops_notification", sourceId: id.slice(6) };
  return null;
}

export function availableActionsForKind(kind: WorkItemKind): WorkItemAction[] {
  switch (kind) {
    case "ops_task":
      return ["clear", "hide", "in_progress", "resolved", "delete"];
    case "owner_follow_up":
    case "active_issue":
      return ["clear", "hide", "archive", "in_progress", "resolved", "delete"];
    case "payment_alert":
      return ["clear", "hide", "in_progress", "resolved", "delete"];
    case "ops_notification":
      return ["clear", "hide", "resolved", "delete"];
    default:
      return [];
  }
}

function actorLabel(actor?: WorkItemActor) {
  return actor?.name || actor?.email || "Staff";
}

async function logWorkItemAction(input: {
  actor?: WorkItemActor;
  action: WorkItemAction;
  kind: WorkItemKind;
  sourceId: string;
  title?: string | null;
  resultStatus: string;
}) {
  const label = workItemActionLabel(input.action);
  const title = input.title?.trim() || input.sourceId;
  await Promise.all([
    recordOpsEvent({
      eventType: `work_item.${input.action}`,
      category: "task",
      title: `${label}: ${title}`,
      summary: `${input.kind.replace(/_/g, " ")} → ${input.resultStatus}`,
      actor: {
        adminId: input.actor?.adminId,
        email: input.actor?.email,
        name: actorLabel(input.actor),
        role: input.actor?.role
      },
      sourceModule: "ops_command_center",
      sourceRecordType: input.kind,
      sourceRecordId: `${input.sourceId}:${input.action}:${Date.now()}`,
      severity: "informational",
      payload: {
        action: input.action,
        kind: input.kind,
        sourceId: input.sourceId,
        resultStatus: input.resultStatus
      }
    }).catch(() => null),
    writeOpsAuditEvent({
      actor: {
        adminId: input.actor?.adminId,
        email: input.actor?.email,
        name: actorLabel(input.actor),
        role: input.actor?.role
      },
      action: `ops.work_item.${input.action}`,
      objectType: input.kind,
      objectId: input.sourceId,
      newValue: { status: input.resultStatus, uiAction: input.action },
      sourceModule: "ops_command_center"
    }).catch(() => null),
    writeAdminAuditLog({
      actorAdminId: input.actor?.adminId,
      actorEmail: input.actor?.email,
      action: `ops.work_item.${input.action}`,
      targetType: input.kind,
      targetId: input.sourceId,
      details: {
        uiAction: input.action,
        resultStatus: input.resultStatus,
        title
      }
    }).catch(() => null)
  ]);
}

export async function applyWorkItemAction(input: {
  itemId: string;
  action: WorkItemAction;
  actor?: WorkItemActor;
  title?: string | null;
}): Promise<{ ok: true; kind: WorkItemKind; sourceId: string; resultStatus: string }> {
  const parsed = parseWorkItemId(input.itemId);
  if (!parsed) throw new Error("Unknown work item id");
  if (!WORK_ITEM_ACTIONS.includes(input.action)) throw new Error("Unknown action");

  const allowed = availableActionsForKind(parsed.kind);
  if (!allowed.includes(input.action)) {
    throw new Error(`${workItemActionLabel(input.action)} is not available for this item`);
  }

  const supabase = getServiceSupabase();
  const actorName = actorLabel(input.actor);
  let resultStatus = "";

  if (parsed.kind === "ops_task") {
    const statusMap: Record<WorkItemAction, "snoozed" | "in_progress" | "completed" | "cancelled" | null> = {
      clear: "snoozed",
      hide: "snoozed",
      archive: "cancelled",
      in_progress: "in_progress",
      resolved: "completed",
      delete: "cancelled"
    };
    const status = statusMap[input.action];
    if (!status) throw new Error("Unsupported task action");
    const snoozedUntil =
      status === "snoozed" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined;
    const task = await updateOpsTaskStatus({
      taskId: parsed.sourceId,
      status,
      actor: {
        adminId: input.actor?.adminId,
        email: input.actor?.email,
        name: actorName,
        role: input.actor?.role
      },
      notes: input.action === "clear" || input.action === "hide" ? `Command Center: ${workItemActionLabel(input.action)}` : undefined,
      snoozedUntil
    });
    if (!task) throw new Error("Task not found");
    resultStatus = task.status;
  } else if (parsed.kind === "owner_follow_up") {
    const statusMap: Record<WorkItemAction, string> = {
      clear: "Resolved",
      hide: "Archived",
      archive: "Archived",
      in_progress: "In Progress",
      resolved: "Resolved",
      delete: "Archived"
    };
    const status = statusMap[input.action];
    const row = await updateOwnerFollowUp(supabase, parsed.sourceId, { status }, actorName);
    resultStatus = row.status;
  } else if (parsed.kind === "active_issue") {
    const statusMap: Record<WorkItemAction, string> = {
      clear: "Resolved",
      hide: "Archived",
      archive: "Archived",
      in_progress: "In Progress",
      resolved: "Resolved",
      delete: "Archived"
    };
    const status = statusMap[input.action];
    const row = await updateActiveIssue(supabase, parsed.sourceId, { status }, actorName);
    resultStatus = row.status;
  } else if (parsed.kind === "ops_notification") {
    if (input.action === "clear" || input.action === "hide" || input.action === "resolved" || input.action === "delete") {
      const note = await resolveOpsNotification({
        notificationId: parsed.sourceId,
        actor: {
          adminId: input.actor?.adminId,
          email: input.actor?.email,
          name: actorName,
          role: input.actor?.role
        },
        resolutionNotes: `Command Center: ${workItemActionLabel(input.action)}`
      });
      if (!note) throw new Error("Notification not found");
      resultStatus = "resolved";
    } else if (input.action === "in_progress") {
      const note = await acknowledgeOpsNotification({
        notificationId: parsed.sourceId,
        actor: {
          adminId: input.actor?.adminId,
          email: input.actor?.email,
          name: actorName,
          role: input.actor?.role
        }
      });
      if (!note) throw new Error("Notification not found");
      resultStatus = "acknowledged";
    } else {
      throw new Error("Unsupported notification action");
    }
  } else if (parsed.kind === "payment_alert") {
    const now = new Date().toISOString();
    if (input.action === "in_progress" || input.action === "clear") {
      await updateOperationsAlert(
        supabase,
        parsed.sourceId,
        { status: "acknowledged", acknowledged_at: now },
        {
          type: "status_change",
          message: `Command Center: ${workItemActionLabel(input.action)}`,
          actor_user_id: input.actor?.adminId,
          actor_name: actorName
        }
      );
      resultStatus = "acknowledged";
    } else if (input.action === "hide") {
      await updateOperationsAlert(
        supabase,
        parsed.sourceId,
        {
          status: "false_positive",
          resolved_at: now,
          resolution_type: "false_positive",
          resolution_notes: "Hidden from Command Center"
        },
        {
          type: "status_change",
          message: "Command Center: Hide (marked false positive)",
          actor_user_id: input.actor?.adminId,
          actor_name: actorName
        }
      );
      resultStatus = "false_positive";
    } else if (input.action === "resolved") {
      await updateOperationsAlert(
        supabase,
        parsed.sourceId,
        {
          status: "resolved",
          resolved_at: now,
          resolution_type: "manual_resolve",
          resolution_notes: "Resolved from Command Center"
        },
        {
          type: "status_change",
          message: "Command Center: Resolved",
          actor_user_id: input.actor?.adminId,
          actor_name: actorName
        }
      );
      resultStatus = "resolved";
    } else if (input.action === "delete" || input.action === "archive") {
      await updateOperationsAlert(
        supabase,
        parsed.sourceId,
        {
          status: "waived",
          resolved_at: now,
          resolution_type: "waived",
          resolution_notes: `Command Center: ${workItemActionLabel(input.action)}`
        },
        {
          type: "status_change",
          message: `Command Center: ${workItemActionLabel(input.action)}`,
          actor_user_id: input.actor?.adminId,
          actor_name: actorName
        }
      );
      resultStatus = "waived";
    } else {
      throw new Error("Unsupported payment alert action");
    }
  } else {
    throw new Error("Unsupported work item kind");
  }

  await logWorkItemAction({
    actor: input.actor,
    action: input.action,
    kind: parsed.kind,
    sourceId: parsed.sourceId,
    title: input.title,
    resultStatus
  });

  return { ok: true, kind: parsed.kind, sourceId: parsed.sourceId, resultStatus };
}
