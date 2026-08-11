/** Dashboard query helpers for System Health UI. */

import { getServiceSupabase } from "@/lib/supabase/server";
import { runFunctionalHealthChecks } from "@/lib/system-health/health-checks";
import { sanitizeForUi } from "@/lib/system-health/sanitize";
import {
  loadSystemHealthSettings,
  listActiveLiveDebugSessions
} from "@/lib/system-health/settings";

export async function loadSystemHealthOverview() {
  const health = await runFunctionalHealthChecks();
  return sanitizeForUi(health);
}

export async function loadLiveActivity(params?: {
  limit?: number;
  severity?: string;
  module?: string;
  correlationId?: string;
  userEmail?: string;
}) {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("system_health_events")
    .select(
      "id, event_type, event_category, severity, occurred_at, user_email, role, module, correlation_id, message, status, entity_type, entity_id, integration"
    )
    .order("occurred_at", { ascending: false })
    .limit(params?.limit ?? 100);
  if (params?.severity) q = q.eq("severity", params.severity);
  if (params?.module) q = q.eq("module", params.module);
  if (params?.correlationId) q = q.eq("correlation_id", params.correlationId);
  if (params?.userEmail) q = q.ilike("user_email", `%${params.userEmail}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return sanitizeForUi(data ?? []);
}

export async function loadErrors(params?: { status?: string; limit?: number }) {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("system_health_errors")
    .select(
      "id, fingerprint, error_type, error_message, severity, application_module, page, endpoint, occurrence_count, first_occurrence_at, last_occurrence_at, status, correlation_id, affected_operation, release_version, internal_notes"
    )
    .order("last_occurrence_at", { ascending: false })
    .limit(params?.limit ?? 100);
  if (params?.status) q = q.eq("status", params.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return sanitizeForUi(data ?? []);
}

export async function loadRouteAudits(params?: { limit?: number; status?: string }) {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("system_health_route_audits")
    .select(
      "id, correlation_id, operating_date, actor_email, quality_gate, status, expected_dogs, generated_dogs, missing_dogs, destination_mismatches, validation_failures, warnings, started_at, finished_at, duration_ms, plan_id"
    )
    .order("started_at", { ascending: false })
    .limit(params?.limit ?? 50);
  if (params?.status) q = q.eq("status", params.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return sanitizeForUi(data ?? []);
}

export async function loadRouteAuditDetail(correlationId: string) {
  const supabase = getServiceSupabase();
  const { data: audit, error } = await supabase
    .from("system_health_route_audits")
    .select("*")
    .eq("correlation_id", correlationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!audit) return null;
  const { data: traces } = await supabase
    .from("system_health_route_dog_traces")
    .select("*")
    .eq("correlation_id", correlationId)
    .order("dog_name");
  return sanitizeForUi({ audit, traces: traces ?? [] });
}

export async function loadIntegrationCalls(params?: { integration?: string; limit?: number }) {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("system_health_integration_calls")
    .select(
      "id, integration, action, status, http_status, latency_ms, success, correlation_id, feature, record_count, error_code, error_message, occurred_at"
    )
    .order("occurred_at", { ascending: false })
    .limit(params?.limit ?? 100);
  if (params?.integration) q = q.eq("integration", params.integration);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return sanitizeForUi(data ?? []);
}

export async function loadApiLogs(params?: { limit?: number }) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("system_health_api_logs")
    .select(
      "id, method, endpoint, status_code, latency_ms, user_email, request_id, correlation_id, feature, error_state, occurred_at"
    )
    .order("occurred_at", { ascending: false })
    .limit(params?.limit ?? 100);
  if (error) throw new Error(error.message);
  return sanitizeForUi(data ?? []);
}

export async function loadBackgroundJobs(params?: { limit?: number }) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("route_worker_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 50);
  if (error) {
    return sanitizeForUi({ jobs: [], note: error.message });
  }
  return sanitizeForUi({ jobs: data ?? [] });
}

export async function loadUserActivity(params?: { limit?: number }) {
  return loadLiveActivity({ ...params, limit: params?.limit ?? 100 });
}

export async function loadSystemHealthDashboardBundle() {
  const [overview, activity, errors, audits, integrations, settings, liveDebug] = await Promise.all([
    loadSystemHealthOverview(),
    loadLiveActivity({ limit: 40 }),
    loadErrors({ limit: 30 }),
    loadRouteAudits({ limit: 20 }),
    loadIntegrationCalls({ limit: 30 }),
    loadSystemHealthSettings(),
    listActiveLiveDebugSessions()
  ]);
  return {
    overview,
    activity,
    errors,
    audits,
    integrations,
    settings,
    liveDebug
  };
}
