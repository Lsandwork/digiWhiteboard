import { getServiceSupabase } from "@/lib/supabase/server";
import type { OpsActor } from "@/lib/ops-command-center/types";

export async function writeOpsAuditEvent(input: {
  actor?: OpsActor;
  action: string;
  objectType: string;
  objectId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  sourceModule?: string;
  deviceInfo?: Record<string, unknown>;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("ops_audit_events").insert({
      actor_admin_id: input.actor?.adminId ?? null,
      actor_email: input.actor?.email ?? null,
      actor_role: input.actor?.role ?? null,
      action: input.action,
      object_type: input.objectType,
      object_id: input.objectId ?? null,
      previous_value: input.previousValue ?? null,
      new_value: input.newValue ?? null,
      source_module: input.sourceModule ?? "ops",
      device_info: input.deviceInfo ?? {}
    });
  } catch {
    // Audit must never block the primary operation.
  }
}
