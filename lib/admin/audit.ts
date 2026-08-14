import { getServiceSupabase } from "@/lib/supabase/server";
import { normalizeAdminUserId } from "@/lib/admin/users";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

type AuditInput = {
  actorAdminId?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

const AUDIT_TIMEOUT_MS = 2_000;

export async function writeAdminAuditLog(input: AuditInput) {
  try {
    await withTimeoutFallback(
      (async () => {
        const supabase = getServiceSupabase();
        await supabase.from("admin_audit_logs").insert({
          actor_admin_id: normalizeAdminUserId(input.actorAdminId),
          actor_email: input.actorEmail ?? null,
          action: input.action,
          target_type: input.targetType ?? null,
          target_id: input.targetId ?? null,
          details: input.details ?? null
        });
      })(),
      AUDIT_TIMEOUT_MS,
      undefined
    );
  } catch {
    // Audit logging must not block primary operations.
  }
}
