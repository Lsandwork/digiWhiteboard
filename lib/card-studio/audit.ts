import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function writeCardStudioAudit(input: {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  role?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string;
  result?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  details?: Record<string, unknown>;
}) {
  await writeAdminAuditLog({
    actorAdminId: input.actorAdminId,
    actorEmail: input.actorEmail,
    action: `card_studio.${input.action}`,
    targetType: input.resourceType,
    targetId: input.resourceId,
    details: {
      role: input.role ?? null,
      result: input.result ?? "ok",
      before: input.before ?? null,
      after: input.after ?? null,
      ...(input.details ?? {})
    }
  });

  try {
    const supabase = getServiceSupabase();
    await supabase.from("card_studio_audit_events").insert({
      actor_admin_id: input.actorAdminId ?? null,
      actor_email: input.actorEmail ?? null,
      actor_role: input.role ?? null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      result: input.result ?? "ok",
      details: {
        before: input.before ?? null,
        after: input.after ?? null,
        ...(input.details ?? {})
      }
    });
  } catch {
    // Card Studio audit must not block the primary operation.
  }
}
