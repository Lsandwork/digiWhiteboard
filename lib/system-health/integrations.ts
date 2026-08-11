/** Integration + API diagnostic writers (fail-safe). */

import { getServiceSupabase } from "@/lib/supabase/server";
import { sanitizeValue } from "@/lib/system-health/sanitize";
import { emitSystemHealthEvent } from "@/lib/system-health/events";

export async function recordIntegrationCall(params: {
  integration: string;
  action: string;
  success: boolean;
  httpStatus?: number | null;
  latencyMs?: number | null;
  correlationId?: string | null;
  requestId?: string | null;
  feature?: string | null;
  recordCount?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("system_health_integration_calls").insert({
      integration: params.integration,
      action: params.action,
      status: params.success ? "ok" : "error",
      http_status: params.httpStatus ?? null,
      latency_ms: params.latencyMs ?? null,
      success: params.success,
      correlation_id: params.correlationId ?? null,
      request_id: params.requestId ?? null,
      feature: params.feature ?? null,
      record_count: params.recordCount ?? null,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ? String(params.errorMessage).slice(0, 1000) : null,
      metadata_json: sanitizeValue(params.metadata ?? {}, { forDeveloper: false })
    });
    await emitSystemHealthEvent({
      eventType: `integration.${params.integration}.${params.action}`,
      eventCategory: "integration",
      severity: params.success ? "info" : "error",
      integration: params.integration,
      correlationId: params.correlationId,
      requestId: params.requestId,
      status: params.success ? "ok" : "error",
      durationMs: params.latencyMs,
      message: params.success
        ? `${params.integration} ${params.action} ok`
        : `${params.integration} ${params.action} failed: ${params.errorMessage || params.errorCode || "error"}`,
      metadata: { recordCount: params.recordCount, httpStatus: params.httpStatus }
    });
  } catch (error) {
    console.error("[system-health] integration call log failed", error);
  }
}

export async function recordApiLog(params: {
  method: string;
  endpoint: string;
  statusCode?: number | null;
  latencyMs?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
  feature?: string | null;
  integration?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const status = params.statusCode ?? 0;
    const supabase = getServiceSupabase();
    await supabase.from("system_health_api_logs").insert({
      method: params.method,
      endpoint: params.endpoint,
      status_code: params.statusCode ?? null,
      latency_ms: params.latencyMs ?? null,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      request_id: params.requestId ?? null,
      correlation_id: params.correlationId ?? null,
      feature: params.feature ?? null,
      integration: params.integration ?? null,
      error_state: status >= 400,
      metadata_json: sanitizeValue(params.metadata ?? {}, { forDeveloper: false })
    });
  } catch (error) {
    console.error("[system-health] api log failed", error);
  }
}
