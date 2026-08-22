import { getServiceSupabase } from "@/lib/supabase/server";
import { OPS_SNAPSHOT_TIMEOUT_MS } from "@/lib/ops-command-center/constants";
import type { OpsActor, OpsDogStatus, OpsDogStatusValue } from "@/lib/ops-command-center/types";
import { writeOpsAuditEvent } from "@/lib/ops-command-center/audit";
import { recordOpsEvent } from "@/lib/ops-command-center/events";

type StatusRow = Record<string, unknown>;

export function mapOpsDogStatus(row: StatusRow): OpsDogStatus {
  const assigned = Array.isArray(row.assigned_employee_ids)
    ? (row.assigned_employee_ids as unknown[]).map(String)
    : [];
  return {
    dogId: String(row.dog_id),
    status: String(row.status) as OpsDogStatusValue,
    subStatus: row.sub_status ? String(row.sub_status) : null,
    locationLabel: row.location_label ? String(row.location_label) : null,
    yardKey: row.yard_key ? String(row.yard_key) : null,
    gingrReservationId: row.gingr_reservation_id ? String(row.gingr_reservation_id) : null,
    transportationState: row.transportation_state ? String(row.transportation_state) : null,
    groomingState: row.grooming_state ? String(row.grooming_state) : null,
    trainingState: row.training_state ? String(row.training_state) : null,
    walkState: row.walk_state ? String(row.walk_state) : null,
    breakState: row.break_state ? String(row.break_state) : null,
    assignedEmployeeIds: assigned,
    statusStartedAt: row.status_started_at ? String(row.status_started_at) : null,
    expectedCheckoutAt: row.expected_checkout_at ? String(row.expected_checkout_at) : null,
    sourceModule: row.source_module ? String(row.source_module) : null,
    metadata: (row.metadata as Record<string, unknown>) || {},
    updatedAt: String(row.updated_at)
  };
}

export async function getOpsDogStatus(dogId: string): Promise<OpsDogStatus | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("ops_dog_status").select("*").eq("dog_id", dogId).maybeSingle();
  return data ? mapOpsDogStatus(data) : null;
}

export type SetOpsDogStatusInput = {
  dogId: string;
  status: OpsDogStatusValue;
  subStatus?: string | null;
  locationLabel?: string | null;
  yardKey?: string | null;
  gingrReservationId?: string | null;
  transportationState?: string | null;
  groomingState?: string | null;
  trainingState?: string | null;
  walkState?: string | null;
  breakState?: string | null;
  expectedCheckoutAt?: string | null;
  sourceModule?: string;
  metadata?: Record<string, unknown>;
  actor?: OpsActor;
  emitEvent?: boolean;
};

export async function setOpsDogStatus(input: SetOpsDogStatusInput): Promise<OpsDogStatus | null> {
  const supabase = getServiceSupabase();
  const previous = await getOpsDogStatus(input.dogId);
  const now = new Date().toISOString();
  const statusChanged = !previous || previous.status !== input.status;

  const row = {
    dog_id: input.dogId,
    status: input.status,
    sub_status: input.subStatus ?? previous?.subStatus ?? null,
    location_label: input.locationLabel ?? previous?.locationLabel ?? null,
    yard_key: input.yardKey ?? previous?.yardKey ?? null,
    gingr_reservation_id: input.gingrReservationId ?? previous?.gingrReservationId ?? null,
    transportation_state: input.transportationState ?? previous?.transportationState ?? null,
    grooming_state: input.groomingState ?? previous?.groomingState ?? null,
    training_state: input.trainingState ?? previous?.trainingState ?? null,
    walk_state: input.walkState ?? previous?.walkState ?? null,
    break_state: input.breakState ?? previous?.breakState ?? null,
    assigned_employee_ids: previous?.assignedEmployeeIds ?? [],
    status_started_at: statusChanged ? now : previous?.statusStartedAt ?? now,
    expected_checkout_at: input.expectedCheckoutAt ?? previous?.expectedCheckoutAt ?? null,
    source_module: input.sourceModule ?? previous?.sourceModule ?? "ops",
    metadata: { ...(previous?.metadata || {}), ...(input.metadata || {}) },
    updated_at: now,
    updated_by_admin_id: input.actor?.adminId ?? null
  };

  const { data, error } = await supabase
    .from("ops_dog_status")
    .upsert(row, { onConflict: "dog_id" })
    .select("*")
    .single();
  if (error || !data) return null;

  const next = mapOpsDogStatus(data);

  if (statusChanged && input.emitEvent !== false) {
    await recordOpsEvent({
      dogId: input.dogId,
      eventType: "status.changed",
      category: "status",
      title: `Status → ${input.status.replace(/_/g, " ")}`,
      summary: previous ? `Changed from ${previous.status}` : "Status set",
      actor: input.actor,
      sourceModule: input.sourceModule || "ops",
      sourceRecordType: "ops_dog_status",
      sourceRecordId: `${input.dogId}:${now}`,
      payload: { previous: previous?.status ?? null, next: input.status }
    });
    await writeOpsAuditEvent({
      actor: input.actor,
      action: "ops.dog_status.changed",
      objectType: "ops_dog",
      objectId: input.dogId,
      previousValue: previous ? { status: previous.status } : null,
      newValue: { status: next.status },
      sourceModule: input.sourceModule || "ops"
    });
  }

  return next;
}

export async function countDogsByStatus(): Promise<Record<string, number>> {
  const supabase = getServiceSupabase({ timeoutMs: OPS_SNAPSHOT_TIMEOUT_MS });
  const { data } = await supabase.from("ops_dog_status").select("status").limit(2000);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = String((row as { status?: string }).status || "other");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
