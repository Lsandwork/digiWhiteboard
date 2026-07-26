import { getServiceSupabase } from "@/lib/supabase/server";
import { writeAdminAuditLog } from "@/lib/admin/audit";

export async function writeRouteAuditEvent(params: {
  action: string;
  entityType?: string;
  entityId?: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  correlationId?: string;
}) {
  const supabase = getServiceSupabase();
  try {
    await supabase.from("route_audit_events").insert({
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      actor_admin_id: params.actorAdminId ?? null,
      actor_email: params.actorEmail ?? null,
      actor_role: params.actorRole ?? null,
      previous_value: params.previousValue ?? null,
      new_value: params.newValue ?? null,
      reason: params.reason ?? null,
      correlation_id: params.correlationId ?? null
    });
  } catch (error) {
    console.error("[route-generator] audit insert failed", error);
  }

  await writeAdminAuditLog({
    actorAdminId: params.actorAdminId ?? undefined,
    actorEmail: params.actorEmail ?? undefined,
    action: params.action,
    targetType: params.entityType ?? "route_generator",
    targetId: params.entityId ?? undefined,
    details: {
      reason: params.reason,
      correlationId: params.correlationId
    }
  });
}
