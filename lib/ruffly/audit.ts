import { getServiceSupabase } from "@/lib/supabase/server";

export async function writeRufflyAuditLog(input: {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ip?: string | null;
}) {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("ruffly_audit_logs").insert({
    actor_user_id: input.actorUserId ?? null,
    actor_email: input.actorEmail ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    details: input.details ?? {},
    ip: input.ip ?? null
  });
  if (error) {
    console.error("[ruffly.audit]", error.message);
  }
}
