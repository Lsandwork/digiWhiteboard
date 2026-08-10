import { getServiceSupabase } from "@/lib/supabase/server";
import type { OpsActor, OpsEvent, OpsEventCategory, OpsPriority } from "@/lib/ops-command-center/types";

type EventRow = Record<string, unknown>;

export function mapOpsEvent(row: EventRow): OpsEvent {
  return {
    id: String(row.id),
    dogId: row.dog_id ? String(row.dog_id) : null,
    eventType: String(row.event_type),
    category: String(row.category) as OpsEventCategory,
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    actorAdminId: row.actor_admin_id ? String(row.actor_admin_id) : null,
    actorName: row.actor_name ? String(row.actor_name) : null,
    actorRole: row.actor_role ? String(row.actor_role) : null,
    sourceModule: String(row.source_module || "ops"),
    sourceRecordType: row.source_record_type ? String(row.source_record_type) : null,
    sourceRecordId: row.source_record_id ? String(row.source_record_id) : null,
    severity: row.severity ? (String(row.severity) as OpsPriority) : null,
    payload: (row.payload as Record<string, unknown>) || {},
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at)
  };
}

export type RecordOpsEventInput = {
  dogId?: string | null;
  eventType: string;
  category: OpsEventCategory;
  title: string;
  summary?: string | null;
  actor?: OpsActor;
  sourceModule?: string;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  relatedTaskId?: string | null;
  relatedAlertId?: string | null;
  severity?: OpsPriority | null;
  payload?: Record<string, unknown>;
  occurredAt?: string | Date;
};

/** Append-only ops timeline event. Idempotent when source_record_* + eventType are set. */
export async function recordOpsEvent(input: RecordOpsEventInput): Promise<OpsEvent | null> {
  try {
    const supabase = getServiceSupabase();
    const occurredAt =
      input.occurredAt instanceof Date
        ? input.occurredAt.toISOString()
        : input.occurredAt || new Date().toISOString();

    const row = {
      dog_id: input.dogId ?? null,
      event_type: input.eventType,
      category: input.category,
      title: input.title,
      summary: input.summary ?? null,
      actor_admin_id: input.actor?.adminId ?? null,
      actor_name: input.actor?.name ?? input.actor?.email ?? null,
      actor_role: input.actor?.role ?? null,
      source_module: input.sourceModule ?? "ops",
      source_record_type: input.sourceRecordType ?? null,
      source_record_id: input.sourceRecordId ?? null,
      related_task_id: input.relatedTaskId ?? null,
      related_alert_id: input.relatedAlertId ?? null,
      severity: input.severity ?? null,
      payload: input.payload ?? {},
      occurred_at: occurredAt
    };

    const { data, error } = await supabase.from("ops_events").insert(row).select("*").maybeSingle();
    if (error) {
      // Unique idempotency collision — treat as success/no-op.
      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        return null;
      }
      return null;
    }
    return data ? mapOpsEvent(data) : null;
  } catch {
    return null;
  }
}

export async function listOpsEventsForDog(
  dogId: string,
  options?: { limit?: number; since?: string }
): Promise<OpsEvent[]> {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("ops_events")
    .select("*")
    .eq("dog_id", dogId)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 50, 1), 200));
  if (options?.since) query = query.gte("occurred_at", options.since);
  const { data } = await query;
  return (data ?? []).map(mapOpsEvent);
}

export async function listRecentOpsEvents(limit = 30): Promise<OpsEvent[]> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("ops_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  return (data ?? []).map(mapOpsEvent);
}
