import { getServiceSupabase } from "@/lib/supabase/server";
import { OPS_SNAPSHOT_TIMEOUT_MS } from "@/lib/ops-command-center/constants";
import type { OpsActor, OpsPriority, OpsTask, OpsTaskStatus } from "@/lib/ops-command-center/types";
import { writeOpsAuditEvent } from "@/lib/ops-command-center/audit";
import { recordOpsEvent } from "@/lib/ops-command-center/events";

type TaskRow = Record<string, unknown>;

export function mapOpsTask(row: TaskRow): OpsTask {
  return {
    id: String(row.id),
    title: String(row.title),
    dogId: row.dog_id ? String(row.dog_id) : null,
    relatedEventId: row.related_event_id ? String(row.related_event_id) : null,
    assignedAdminId: row.assigned_admin_id ? String(row.assigned_admin_id) : null,
    assignedRole: row.assigned_role ? String(row.assigned_role) : null,
    dueAt: row.due_at ? String(row.due_at) : null,
    priority: String(row.priority || "attention") as OpsPriority,
    status: String(row.status || "open") as OpsTaskStatus,
    createdByAdminId: row.created_by_admin_id ? String(row.created_by_admin_id) : null,
    createdFrom: row.created_from ? String(row.created_from) : null,
    completedByAdminId: row.completed_by_admin_id ? String(row.completed_by_admin_id) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    snoozedUntil: row.snoozed_until ? String(row.snoozed_until) : null,
    notes: row.notes ? String(row.notes) : null,
    escalationNotes: row.escalation_notes ? String(row.escalation_notes) : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export async function createOpsTask(input: {
  title: string;
  dogId?: string | null;
  relatedEventId?: string | null;
  assignedAdminId?: string | null;
  assignedRole?: string | null;
  dueAt?: string | null;
  priority?: OpsPriority;
  createdFrom?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  actor?: OpsActor;
}): Promise<OpsTask | null> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("ops_tasks")
    .insert({
      title: input.title.trim(),
      dog_id: input.dogId ?? null,
      related_event_id: input.relatedEventId ?? null,
      assigned_admin_id: input.assignedAdminId ?? null,
      assigned_role: input.assignedRole ?? null,
      due_at: input.dueAt ?? null,
      priority: input.priority ?? "attention",
      status: "open",
      created_by_admin_id: input.actor?.adminId ?? null,
      created_from: input.createdFrom ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {}
    })
    .select("*")
    .single();
  if (error || !data) return null;
  const task = mapOpsTask(data);
  await recordOpsEvent({
    dogId: task.dogId,
    eventType: "task.created",
    category: "task",
    title: `Task created: ${task.title}`,
    actor: input.actor,
    sourceModule: "ops_tasks",
    sourceRecordType: "ops_task",
    sourceRecordId: task.id,
    relatedTaskId: task.id,
    severity: task.priority
  });
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.task.created",
    objectType: "ops_task",
    objectId: task.id,
    newValue: { title: task.title, status: task.status },
    sourceModule: "ops_tasks"
  });
  return task;
}

export async function updateOpsTaskStatus(input: {
  taskId: string;
  status: OpsTaskStatus;
  actor?: OpsActor;
  notes?: string | null;
  snoozedUntil?: string | null;
  escalationNotes?: string | null;
}): Promise<OpsTask | null> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.from("ops_tasks").select("*").eq("id", input.taskId).maybeSingle();
  if (!existing) return null;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now
  };
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.snoozedUntil !== undefined) patch.snoozed_until = input.snoozedUntil;
  if (input.escalationNotes !== undefined) patch.escalation_notes = input.escalationNotes;
  if (input.status === "completed") {
    patch.completed_at = now;
    patch.completed_by_admin_id = input.actor?.adminId ?? null;
  }

  const { data, error } = await supabase
    .from("ops_tasks")
    .update(patch)
    .eq("id", input.taskId)
    .select("*")
    .single();
  if (error || !data) return null;
  const task = mapOpsTask(data);
  await recordOpsEvent({
    dogId: task.dogId,
    eventType: `task.${input.status}`,
    category: "task",
    title: `Task ${input.status.replace(/_/g, " ")}: ${task.title}`,
    actor: input.actor,
    sourceModule: "ops_tasks",
    sourceRecordType: "ops_task",
    sourceRecordId: `${task.id}:${input.status}:${now}`,
    relatedTaskId: task.id,
    severity: task.priority
  });
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.task.status_changed",
    objectType: "ops_task",
    objectId: task.id,
    previousValue: { status: existing.status },
    newValue: { status: task.status },
    sourceModule: "ops_tasks"
  });
  return task;
}

export async function listOpenOpsTasks(options?: {
  assignedAdminId?: string | null;
  assignedRole?: string | null;
  limit?: number;
}): Promise<OpsTask[]> {
  const supabase = getServiceSupabase({ timeoutMs: OPS_SNAPSHOT_TIMEOUT_MS });
  let query = supabase
    .from("ops_tasks")
    .select("*")
    .in("status", ["open", "in_progress", "snoozed", "escalated"])
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(Math.min(Math.max(options?.limit ?? 40, 1), 100));
  if (options?.assignedAdminId) query = query.eq("assigned_admin_id", options.assignedAdminId);
  else if (options?.assignedRole) query = query.eq("assigned_role", options.assignedRole);
  const { data } = await query;
  return (data ?? []).map(mapOpsTask);
}
