/** Dashboard query helpers for System Health UI. */

import { getServiceSupabase } from "@/lib/supabase/server";
import { runFunctionalHealthChecks } from "@/lib/system-health/health-checks";
import { sanitizeForUi } from "@/lib/system-health/sanitize";
import {
  loadSystemHealthSettings,
  listActiveLiveDebugSessions,
  type SystemHealthSettings
} from "@/lib/system-health/settings";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

export const SYSTEM_HEALTH_DASHBOARD_TIMEOUT_MS = 8_000;
export const SYSTEM_HEALTH_SECTION_TIMEOUT_MS = 4_000;

function emptyOverview() {
  return {
    services: [],
    schema: {
      ready: false,
      migration: "072_system_health_debugging.sql",
      present: [],
      missing: [] as string[],
      canApplyViaPg: false,
      detail: "System Health overview timed out."
    },
    summary: {
      systemHealth: "WARNING" as const,
      errorsToday: 0,
      warningsToday: 0,
      failedJobs: 0,
      integrationFailures: 0,
      routeAuditFailures: 0,
      usersActive: 0,
      releaseVersion: null,
      lastRouteGeneration: null,
      lastGingrSync: null,
      lastSamsaraExport: null,
      storageBucketsOk: null,
      queueDepth: null,
      schemaReady: false
    }
  };
}

async function safeSection<T>(label: string, work: Promise<T>, fallback: T, ms = SYSTEM_HEALTH_SECTION_TIMEOUT_MS) {
  try {
    return await withTimeoutFallback(work, ms, fallback);
  } catch (error) {
    console.error(`[system-health] ${label} unavailable:`, error);
    return fallback;
  }
}

export async function loadSystemHealthOverview() {
  const health = await safeSection("overview checks", runFunctionalHealthChecks(), emptyOverview(), SYSTEM_HEALTH_DASHBOARD_TIMEOUT_MS);
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
  if (error) {
    if (/aborted|abort|timed out|timeout/i.test(error.message || "")) return sanitizeForUi([]);
    throw new Error(error.message);
  }
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
  if (error) {
    if (/aborted|abort|timed out|timeout/i.test(error.message || "")) return sanitizeForUi([]);
    throw new Error(error.message);
  }
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
  if (error) {
    if (/aborted|abort|timed out|timeout/i.test(error.message || "")) return sanitizeForUi([]);
    throw new Error(error.message);
  }
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
  if (error) {
    if (/aborted|abort|timed out|timeout/i.test(error.message || "")) return sanitizeForUi([]);
    throw new Error(error.message);
  }
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
  if (error) {
    if (/aborted|abort|timed out|timeout/i.test(error.message || "")) return sanitizeForUi([]);
    throw new Error(error.message);
  }
  return sanitizeForUi(data ?? []);
}

export async function loadBackgroundJobs(params?: {
  limit?: number;
  status?: string;
}) {
  const supabase = getServiceSupabase();
  let q = supabase
    .from("route_worker_jobs")
    .select(
      "id, job_type, status, attempts, max_attempts, correlation_id, owned_by_plan_id, error_message, started_at, completed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 50);
  if (params?.status) q = q.eq("status", params.status);
  const { data, error } = await q;

  const todayIso = new Date();
  todayIso.setHours(0, 0, 0, 0);
  const statusKeys = [
    "queued",
    "running",
    "waiting_for_authentication",
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled"
  ] as const;
  const counts: Record<string, number> = {};
  await Promise.all(
    statusKeys.map(async (status) => {
      try {
        const { count } = await supabase
          .from("route_worker_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        counts[status] = count ?? 0;
      } catch {
        counts[status] = 0;
      }
    })
  );

  let failedToday = 0;
  try {
    const { count } = await supabase
      .from("route_worker_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", todayIso.toISOString());
    failedToday = count ?? 0;
  } catch {
    failedToday = 0;
  }

  if (error) {
    return sanitizeForUi({
      jobs: [],
      counts,
      failedToday,
      note: error.message
    });
  }
  return sanitizeForUi({ jobs: data ?? [], counts, failedToday });
}

export async function loadStorageHealth() {
  const supabase = getServiceSupabase();
  const { probeCloudStorage } = await import("@/lib/system-health/probes/storage");
  const probe = await probeCloudStorage(supabase);
  return sanitizeForUi(probe);
}

export async function loadUserActivity(params?: { limit?: number }) {
  const supabase = getServiceSupabase();
  try {
    const { data, error } = await supabase
      .from("system_health_events")
      .select(
        "id, event_type, event_category, severity, occurred_at, user_email, role, module, correlation_id, message, status, entity_type, entity_id, integration"
      )
      .eq("event_category", "user_activity")
      .order("occurred_at", { ascending: false })
      .limit(params?.limit ?? 100);
    if (!error && data) return sanitizeForUi(data);
  } catch {
    /* fall through */
  }
  return loadLiveActivity({ ...params, limit: params?.limit ?? 100 });
}

export async function loadWhiteboardAuditIssues() {
  const { loadSystemHealthAudit } = await import("@/lib/admin/system-health-audit");
  const supabase = getServiceSupabase();
  const state = await loadSystemHealthAudit(supabase);
  return sanitizeForUi({
    last_run_at: state.last_run_at,
    overall_status: state.overall_status,
    open_issues: state.open_issues,
    recent_rows: state.recent_rows,
    summary: state.runs[0]?.summary ?? null,
    next_cron_hint: "Auto-audits run twice daily at 7:00 AM and 7:00 PM Pacific."
  });
}

export async function loadSystemHealthDashboardBundle() {
  const [overview, activity, errors, audits, integrations, settings, liveDebug] = await Promise.all([
    safeSection("overview", loadSystemHealthOverview(), emptyOverview(), SYSTEM_HEALTH_DASHBOARD_TIMEOUT_MS),
    safeSection("activity", loadLiveActivity({ limit: 40 }), []),
    safeSection("errors", loadErrors({ limit: 30 }), []),
    safeSection("audits", loadRouteAudits({ limit: 20 }), []),
    safeSection("integrations", loadIntegrationCalls({ limit: 30 }), []),
    safeSection(
      "settings",
      loadSystemHealthSettings(),
      {
        debugLoggingEnabled: true,
        verboseLogging: false,
        routeDecisionTracing: true,
        apiDiagnostics: true,
        integrationDiagnostics: true,
        liveActivityEnabled: true,
        developerBridgeEnabled: true,
        cursorBridgeEnabled: true,
        productionDiagnosticAccess: false,
        piiMasking: true,
        healthCheckIntervalSeconds: 300,
        retentionEventsDays: 90,
        retentionApiLogsDays: 30,
        retentionRouteAuditsDays: 365,
        retentionErrorsDays: 180
      } satisfies SystemHealthSettings
    ),
    safeSection("live debug", listActiveLiveDebugSessions(), [])
  ]);
  return {
    overview,
    activity,
    errors,
    audits,
    integrations,
    settings,
    liveDebug,
    schema: (overview as { schema?: unknown })?.schema ?? null,
    degraded: !(overview as { services?: unknown[] })?.services?.length
  };
}
