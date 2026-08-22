import { getServiceSupabase } from "@/lib/supabase/server";
import { OPS_SNAPSHOT_TIMEOUT_MS } from "@/lib/ops-command-center/constants";
import type { OpsActor, OpsNotification, OpsPriority } from "@/lib/ops-command-center/types";
import { writeOpsAuditEvent } from "@/lib/ops-command-center/audit";

type NotificationRow = Record<string, unknown>;

export function mapOpsNotification(row: NotificationRow): OpsNotification {
  return {
    id: String(row.id),
    userAdminId: row.user_admin_id ? String(row.user_admin_id) : null,
    roleKey: row.role_key ? String(row.role_key) : null,
    dogId: row.dog_id ? String(row.dog_id) : null,
    taskId: row.task_id ? String(row.task_id) : null,
    eventId: row.event_id ? String(row.event_id) : null,
    title: String(row.title),
    body: row.body ? String(row.body) : null,
    priority: String(row.priority || "attention") as OpsPriority,
    readAt: row.read_at ? String(row.read_at) : null,
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    hrefTab: row.href_tab ? String(row.href_tab) : null,
    hrefPath: row.href_path ? String(row.href_path) : null,
    payload: (row.payload as Record<string, unknown>) || {},
    createdAt: String(row.created_at)
  };
}

export async function createOpsNotification(input: {
  userAdminId?: string | null;
  roleKey?: string | null;
  teamKey?: string | null;
  dogId?: string | null;
  taskId?: string | null;
  eventId?: string | null;
  alertKey?: string | null;
  title: string;
  body?: string | null;
  priority?: OpsPriority;
  dedupeKey?: string | null;
  hrefTab?: string | null;
  hrefPath?: string | null;
  payload?: Record<string, unknown>;
}): Promise<OpsNotification | null> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ops_notifications")
      .insert({
        user_admin_id: input.userAdminId ?? null,
        role_key: input.roleKey ?? null,
        team_key: input.teamKey ?? null,
        dog_id: input.dogId ?? null,
        task_id: input.taskId ?? null,
        event_id: input.eventId ?? null,
        alert_key: input.alertKey ?? null,
        title: input.title,
        body: input.body ?? null,
        priority: input.priority ?? "attention",
        dedupe_key: input.dedupeKey ?? null,
        href_tab: input.hrefTab ?? null,
        href_path: input.hrefPath ?? null,
        payload: input.payload ?? {}
      })
      .select("*")
      .maybeSingle();
    if (error) {
      if (String(error.message || "").toLowerCase().includes("duplicate")) return null;
      return null;
    }
    return data ? mapOpsNotification(data) : null;
  } catch {
    return null;
  }
}

export async function listOpsNotificationsForUser(
  userAdminId: string,
  options?: { roleKey?: string | null; limit?: number; unreadOnly?: boolean }
): Promise<OpsNotification[]> {
  const supabase = getServiceSupabase({ timeoutMs: OPS_SNAPSHOT_TIMEOUT_MS });
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 100);
  let query = supabase
    .from("ops_notifications")
    .select("*")
    .or(
      [
        `user_admin_id.eq.${userAdminId}`,
        options?.roleKey ? `role_key.eq.${options.roleKey}` : null
      ]
        .filter(Boolean)
        .join(",")
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (options?.unreadOnly) query = query.is("read_at", null);
  const { data } = await query;
  return (data ?? []).map(mapOpsNotification);
}

export async function acknowledgeOpsNotification(input: {
  notificationId: string;
  actor?: OpsActor;
}): Promise<OpsNotification | null> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ops_notifications")
    .update({
      read_at: now,
      acknowledged_at: now,
      acknowledged_by_admin_id: input.actor?.adminId ?? null
    })
    .eq("id", input.notificationId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.notification.acknowledged",
    objectType: "ops_notification",
    objectId: input.notificationId,
    sourceModule: "ops_notifications"
  });
  return mapOpsNotification(data);
}

export async function resolveOpsNotification(input: {
  notificationId: string;
  actor?: OpsActor;
  resolutionNotes?: string | null;
}): Promise<OpsNotification | null> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("ops_notifications")
    .update({
      read_at: now,
      acknowledged_at: now,
      resolved_at: now,
      resolved_by_admin_id: input.actor?.adminId ?? null,
      resolution_notes: input.resolutionNotes ?? null
    })
    .eq("id", input.notificationId)
    .select("*")
    .maybeSingle();
  if (error || !data) return null;
  await writeOpsAuditEvent({
    actor: input.actor,
    action: "ops.notification.resolved",
    objectType: "ops_notification",
    objectId: input.notificationId,
    newValue: { resolutionNotes: input.resolutionNotes ?? null },
    sourceModule: "ops_notifications"
  });
  return mapOpsNotification(data);
}
