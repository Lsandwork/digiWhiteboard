type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import type { CommissionActor } from "./types";
import { actorLabel } from "./auth";

export async function writeCommissionAudit(
  supabase: SupabaseClient,
  input: {
    recordId?: string | null;
    entityType?: string;
    entityId?: string | null;
    action: string;
    fieldName?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    reason?: string | null;
    actor: CommissionActor;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("package_commission_audit_events").insert({
    record_id: input.recordId ?? null,
    entity_type: input.entityType ?? "record",
    entity_id: input.entityId ?? null,
    action: input.action,
    field_name: input.fieldName ?? null,
    old_value: input.oldValue ?? null,
    new_value: input.newValue ?? null,
    reason: input.reason ?? null,
    actor_user_id: input.actor.adminUserId ?? null,
    actor_role: input.actor.roleKey ?? input.actor.role ?? null,
    actor_email: input.actor.email ?? null,
    metadata: {
      ...(input.metadata ?? {}),
      actor_label: actorLabel(input.actor)
    }
  });
}

export async function listRecordAudit(supabase: SupabaseClient, recordId: string) {
  const { data, error } = await supabase
    .from("package_commission_audit_events")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}
