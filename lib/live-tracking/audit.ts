import { getServiceSupabase } from "@/lib/supabase/server";

export async function writeTrackingAuditEvent(params: {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  correlationId?: string | null;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("transport_tracking_audit_events").insert({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      actor_admin_id: params.actorAdminId ?? null,
      actor_email: params.actorEmail ?? null,
      actor_role: params.actorRole ?? null,
      previous_value: params.previousValue ?? null,
      new_value: params.newValue ?? null,
      reason: params.reason ?? null,
      correlation_id: params.correlationId ?? null
    });
  } catch {
    // Audit must not break primary flows when table is missing pre-migration.
  }
}
