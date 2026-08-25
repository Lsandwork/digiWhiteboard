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
import { isHungQueryError } from "@/lib/hung-table-guard";
import { LIVE_DATA_SLOW_MESSAGE } from "@/lib/safe-url";

export const SYSTEM_HEALTH_DASHBOARD_TIMEOUT_MS = 8_000;
export const SYSTEM_HEALTH_SECTION_TIMEOUT_MS = 4_000;

function systemHealthClient() {
  return getServiceSupabase({ timeoutMs: SYSTEM_HEALTH_SECTION_TIMEOUT_MS });
}

export function emptyOverview() {
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

const DEFAULT_SETTINGS: SystemHealthSettings = {
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
};

export function emptySystemHealthViewPayload(view: string, warning = LIVE_DATA_SLOW_MESSAGE) {
  if (view === "dashboard") {
    return {
      overview: emptyOverview(),
      activity: [],
      errors: [],
      audits: [],
      integrations: [],
      settings: DEFAULT_SETTINGS,
      liveDebug: [],
      schema: null,
      degraded: true,
      warning
    };
  }
  if (view === "jobs") {
    return {
      data: { jobs: [], counts: {}, failedToday: 0, note: warning },
      degraded: true,
      warning
    };
  }
  if (view === "storage") {
    return {
      data: {
        status: "WARNING",
        detail: warning,
        responseTimeMs: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: warning,
        buckets: [],
        recentMediaAt: null
      },
      degraded: true,
      warning
    };
  }
  if (view === "audit_issues") {
    return {
      data: {
        last_run_at: null,
        overall_status: "never_run",
        open_issues: [],
        recent_rows: [],
        summary: null
      },
      degraded: true,
      warning
    };
  }
  if (view === "settings") {
    return { settings: DEFAULT_SETTINGS, degraded: true, warning };
  }
  if (view === "schema") {
    return {
      data: {
        ready: false,
        migration: "072_system_health_debugging.sql",
        present: [],
        missing: [],
        canApplyViaPg: false,
        detail: warning
      },
      degraded: true,
      warning
    };
  }
  return { data: view === "route_audit" ? null : [], degraded: true, warning };
}

function emptyJobsPayload(note?: string) {
  return { jobs: [] as unknown[], counts: {} as Record<string, number>, failedToday: 0, note };
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
  try {
    const supabase = systemHealthClient();
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
      if (isHungQueryError(error)) return sanitizeForUi([]);
      throw new Error(error.message);
    }
    return sanitizeForUi(data ?? []);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
    throw error;
  }
}

export async function loadErrors(params?: { status?: string; limit?: number }) {
  try {
    const supabase = systemHealthClient();
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
      if (isHungQueryError(error)) return sanitizeForUi([]);
      throw new Error(error.message);
    }
    return sanitizeForUi(data ?? []);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
    throw error;
  }
}

export async function loadRouteAudits(params?: { limit?: number; status?: string }) {
  try {
    const supabase = systemHealthClient();
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
      if (isHungQueryError(error)) return sanitizeForUi([]);
      throw new Error(error.message);
    }
    return sanitizeForUi(data ?? []);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
    throw error;
  }
}

export async function loadRouteAuditDetail(correlationId: string) {
  try {
    const supabase = systemHealthClient();
    const { data: audit, error } = await supabase
      .from("system_health_route_audits")
      .select("*")
      .eq("correlation_id", correlationId)
      .maybeSingle();
    if (error) {
      if (isHungQueryError(error)) return null;
      throw new Error(error.message);
    }
    if (!audit) return null;
    const { data: traces } = await supabase
      .from("system_health_route_dog_traces")
      .select("*")
      .eq("correlation_id", correlationId)
      .order("dog_name");
    return sanitizeForUi({ audit, traces: traces ?? [] });
  } catch (error) {
    if (isHungQueryError(error)) return null;
    throw error;
  }
}

export async function loadIntegrationCalls(params?: { integration?: string; limit?: number }) {
  try {
    const supabase = systemHealthClient();
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
      if (isHungQueryError(error)) return sanitizeForUi([]);
      throw new Error(error.message);
    }
    return sanitizeForUi(data ?? []);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
    throw error;
  }
}

export async function loadApiLogs(params?: { limit?: number }) {
  try {
    const supabase = systemHealthClient();
    const { data, error } = await supabase
      .from("system_health_api_logs")
      .select(
        "id, method, endpoint, status_code, latency_ms, user_email, request_id, correlation_id, feature, error_state, occurred_at"
      )
      .order("occurred_at", { ascending: false })
      .limit(params?.limit ?? 100);
    if (error) {
      if (isHungQueryError(error)) return sanitizeForUi([]);
      throw new Error(error.message);
    }
    return sanitizeForUi(data ?? []);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
    throw error;
  }
}

export async function loadBackgroundJobs(params?: {
  limit?: number;
  status?: string;
}) {
  try {
    const supabase = systemHealthClient();
    let q = supabase
      .from("route_worker_jobs")
      .select(
        "id, job_type, status, attempts, max_attempts, correlation_id, owned_by_plan_id, error_message, started_at, completed_at, created_at, updated_at"
      )
      .order("created_at", { ascending: false })
      .limit(params?.limit ?? 50);
    if (params?.status) q = q.eq("status", params.status);
    const jobsResult = await withTimeoutFallback(
      Promise.resolve(q).then((row) => ({
        data: (row.data ?? []) as unknown[],
        error: row.error ? { message: row.error.message } : null
      })),
      SYSTEM_HEALTH_SECTION_TIMEOUT_MS,
      { data: [] as unknown[], error: { message: "Background jobs timed out." } }
    );

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
          const result = await withTimeoutFallback(
            Promise.resolve(
              supabase.from("route_worker_jobs").select("id", { count: "exact", head: true }).eq("status", status)
            ).then((row) => ({ count: row.count ?? 0 })),
            1_200,
            { count: 0 }
          );
          counts[status] = result.count ?? 0;
        } catch {
          counts[status] = 0;
        }
      })
    );

    let failedToday = 0;
    try {
      const result = await withTimeoutFallback(
        Promise.resolve(
          supabase
            .from("route_worker_jobs")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed")
            .gte("created_at", todayIso.toISOString())
        ).then((row) => ({ count: row.count ?? 0 })),
        1_200,
        { count: 0 }
      );
      failedToday = result.count ?? 0;
    } catch {
      failedToday = 0;
    }

    if (jobsResult.error) {
      return sanitizeForUi(emptyJobsPayload(jobsResult.error.message));
    }
    return sanitizeForUi({ jobs: jobsResult.data ?? [], counts, failedToday });
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi(emptyJobsPayload("Background jobs timed out."));
    throw error;
  }
}

export async function loadStorageHealth() {
  try {
    const supabase = systemHealthClient();
    const { probeCloudStorage } = await import("@/lib/system-health/probes/storage");
    const probe = await withTimeoutFallback(
      probeCloudStorage(supabase),
      SYSTEM_HEALTH_SECTION_TIMEOUT_MS,
      {
        status: "WARNING" as const,
        detail: "Storage probe timed out.",
        responseTimeMs: null,
        lastSuccessAt: null,
        lastFailureAt: new Date().toISOString(),
        lastError: "probe_timeout",
        buckets: [],
        recentMediaAt: null
      }
    );
    return sanitizeForUi(probe);
  } catch (error) {
    if (isHungQueryError(error)) {
      return sanitizeForUi({
        status: "WARNING",
        detail: "Storage probe timed out.",
        buckets: [],
        recentMediaAt: null
      });
    }
    throw error;
  }
}

export async function loadUserActivity(params?: { limit?: number }) {
  try {
    const supabase = systemHealthClient();
    const { data, error } = await supabase
      .from("system_health_events")
      .select(
        "id, event_type, event_category, severity, occurred_at, user_email, role, module, correlation_id, message, status, entity_type, entity_id, integration"
      )
      .eq("event_category", "user_activity")
      .order("occurred_at", { ascending: false })
      .limit(params?.limit ?? 100);
    if (!error && data) return sanitizeForUi(data);
    if (error && isHungQueryError(error)) return sanitizeForUi([]);
  } catch (error) {
    if (isHungQueryError(error)) return sanitizeForUi([]);
  }
  return loadLiveActivity({ ...params, limit: params?.limit ?? 100 });
}

export async function loadWhiteboardAuditIssues() {
  try {
    const { loadSystemHealthAudit } = await import("@/lib/admin/system-health-audit");
    const supabase = systemHealthClient();
    const state = await withTimeoutFallback(loadSystemHealthAudit(supabase), SYSTEM_HEALTH_SECTION_TIMEOUT_MS, {
      version: 1 as const,
      last_run_at: null,
      last_run_id: null,
      overall_status: "never_run" as const,
      open_issues: [],
      recent_rows: [],
      runs: []
    });
    return sanitizeForUi({
      last_run_at: state.last_run_at,
      overall_status: state.overall_status,
      open_issues: state.open_issues,
      recent_rows: state.recent_rows,
      summary: state.runs[0]?.summary ?? null,
      next_cron_hint: "Auto-audits run twice daily at 7:00 AM and 7:00 PM Pacific."
    });
  } catch (error) {
    if (isHungQueryError(error)) {
      return sanitizeForUi({
        last_run_at: null,
        overall_status: "never_run",
        open_issues: [],
        recent_rows: [],
        summary: null,
        next_cron_hint: "Auto-audits run twice daily at 7:00 AM and 7:00 PM Pacific."
      });
    }
    throw error;
  }
}

export async function loadSystemHealthDashboardBundle() {
  const [overview, activity, errors, audits, integrations, settings, liveDebug] = await Promise.all([
    safeSection("overview", loadSystemHealthOverview(), emptyOverview(), SYSTEM_HEALTH_DASHBOARD_TIMEOUT_MS),
    safeSection("activity", loadLiveActivity({ limit: 40 }), []),
    safeSection("errors", loadErrors({ limit: 30 }), []),
    safeSection("audits", loadRouteAudits({ limit: 20 }), []),
    safeSection("integrations", loadIntegrationCalls({ limit: 30 }), []),
    safeSection("settings", loadSystemHealthSettings(), DEFAULT_SETTINGS),
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
