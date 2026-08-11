/**
 * Functional health checks for RuffOps services.
 * Prefer evidence of successful operations over mere reachability.
 */

import { getServiceSupabase } from "@/lib/supabase/server";
import { isSamsaraLiveConfigured } from "@/lib/route-generator/samsara-live";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { evaluateGingrHealth } from "@/lib/ops-command-center/gingr-health";
import { loadSystemHealthAudit } from "@/lib/admin/system-health-audit";
import type { HealthStatus } from "@/lib/system-health/types";
import { probeCloudStorage } from "@/lib/system-health/probes/storage";
import { probeRealtime } from "@/lib/system-health/probes/realtime";
import { probeBackgroundWorker, probeJobQueue } from "@/lib/system-health/probes/worker";
import { probeRouteGenerator } from "@/lib/system-health/probes/route-generator";
import { checkSystemHealthSchema, SYSTEM_HEALTH_REQUIRED_TABLES } from "@/lib/system-health/ensure-schema";
import type { SchemaReadiness } from "@/lib/system-health/ensure-schema";

export type ServiceHealthCard = {
  id: string;
  label: string;
  status: HealthStatus;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  errorsLastHour: number;
  errorsLast24h: number;
  successRate24h: number | null;
  detail: string;
  logsHref?: string;
  /** Structured probe evidence for UI tools (buckets, queue counts, etc.) */
  meta?: Record<string, unknown>;
};

/** Services that drive the aggregate SYSTEM HEALTH rollup. Optional integrations
 * left UNKNOWN (e.g. email unset) must not poison the header. */
export const AGGREGATE_SERVICE_IDS = new Set([
  "ruffops",
  "database",
  "authentication",
  "gingr",
  "samsara",
  "route_generator",
  "background_worker",
  "job_queue",
  "storage",
  "realtime",
  "observability_schema"
]);

export function aggregateSystemHealth(services: ServiceHealthCard[]): HealthStatus {
  const rank: Record<HealthStatus, number> = {
    FAILED: 4,
    DEGRADED: 3,
    WARNING: 2,
    UNKNOWN: 1,
    HEALTHY: 0
  };
  return services
    .filter((s) => AGGREGATE_SERVICE_IDS.has(s.id))
    .reduce<HealthStatus>((acc, s) => {
      return rank[s.status] > rank[acc] ? s.status : acc;
    }, "HEALTHY");
}

/** Never leave a service card on UNKNOWN — operators need actionable statuses. */
export function coerceServiceStatus(status: HealthStatus): HealthStatus {
  return status === "UNKNOWN" ? "WARNING" : status;
}

async function countErrors(supabase: ReturnType<typeof getServiceSupabase>, sinceIso: string) {
  const { count } = await supabase
    .from("system_health_errors")
    .select("id", { count: "exact", head: true })
    .gte("last_occurrence_at", sinceIso);
  return count ?? 0;
}

async function integrationStats(
  supabase: ReturnType<typeof getServiceSupabase>,
  integration: string,
  sinceIso: string
) {
  const { data } = await supabase
    .from("system_health_integration_calls")
    .select("success, occurred_at, error_message, latency_ms")
    .eq("integration", integration)
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const total = rows.length;
  const failures = rows.filter((r) => r.success === false).length;
  const lastFail = rows.find((r) => r.success === false);
  const lastOk = rows.find((r) => r.success === true);
  const avgLatency =
    rows.length > 0
      ? Math.round(rows.reduce((n, r) => n + Number(r.latency_ms || 0), 0) / rows.length)
      : null;
  return {
    total,
    failures,
    successRate: total ? Math.round(((total - failures) / total) * 1000) / 10 : null,
    lastFailureAt: lastFail?.occurred_at ? String(lastFail.occurred_at) : null,
    lastSuccessAt: lastOk?.occurred_at ? String(lastOk.occurred_at) : null,
    lastError: lastFail?.error_message ? String(lastFail.error_message) : null,
    avgLatency
  };
}

export async function runFunctionalHealthChecks(): Promise<{
  services: ServiceHealthCard[];
  schema: SchemaReadiness;
  summary: {
    systemHealth: HealthStatus;
    errorsToday: number;
    warningsToday: number;
    failedJobs: number;
    integrationFailures: number;
    routeAuditFailures: number;
    usersActive: number;
    releaseVersion: string | null;
    lastRouteGeneration: string | null;
    lastGingrSync: string | null;
    lastSamsaraExport: string | null;
    storageBucketsOk: number | null;
    queueDepth: number | null;
    schemaReady: boolean;
  };
}> {
  const supabase = getServiceSupabase();
  const started = Date.now();
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayIso = startOfDay.toISOString();

  const safeCount = async (fn: () => PromiseLike<{ count: number | null }>) => {
    try {
      const r = await fn();
      return r.count ?? 0;
    } catch {
      return 0;
    }
  };
  const safeMaybe = async <T,>(fn: () => PromiseLike<{ data: T | null }>) => {
    try {
      return await fn();
    } catch {
      return { data: null as T | null };
    }
  };

  const [
    dbProbeTimed,
    webhook,
    lastDogSeen,
    audit,
    errorsHour,
    errorsDay,
    errorsToday,
    warningsToday,
    routeFail,
    integFail,
    lastExport,
    gingrStats,
    samsaraStats,
    twilioStats,
    activeUsers,
    storageProbe,
    realtimeProbe,
    workerProbe,
    queueProbe,
    schema
  ] = await Promise.all([
    (async () => {
      const t0 = Date.now();
      const result = await supabase
        .from("admin_settings")
        .select("id")
        .eq("id", "default")
        .maybeSingle();
      return { ...result, latencyMs: Date.now() - t0 };
    })(),
    supabase
      .from("gingr_webhook_events")
      .select("created_at, processing_error")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("live_transition_dogs")
      .select("last_seen_from_gingr_at")
      .not("last_seen_from_gingr_at", "is", null)
      .order("last_seen_from_gingr_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadSystemHealthAudit(supabase).catch(() => null),
    countErrors(supabase, hourAgo).catch(() => 0),
    countErrors(supabase, dayAgo).catch(() => 0),
    safeCount(() =>
      supabase
        .from("system_health_errors")
        .select("id", { count: "exact", head: true })
        .gte("last_occurrence_at", todayIso)
    ),
    safeCount(() =>
      supabase
        .from("system_health_events")
        .select("id", { count: "exact", head: true })
        .eq("severity", "warning")
        .gte("occurred_at", todayIso)
    ),
    safeCount(() =>
      supabase
        .from("system_health_route_audits")
        .select("id", { count: "exact", head: true })
        .eq("quality_gate", "FAIL")
        .gte("started_at", todayIso)
    ),
    safeCount(() =>
      supabase
        .from("system_health_integration_calls")
        .select("id", { count: "exact", head: true })
        .eq("success", false)
        .gte("occurred_at", todayIso)
    ),
    safeMaybe<{ created_at: string | null; status: string | null }>(() =>
      supabase
        .from("route_export_jobs")
        .select("created_at, status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ),
    integrationStats(supabase, "gingr", dayAgo).catch(() => null),
    integrationStats(supabase, "samsara", dayAgo).catch(() => null),
    integrationStats(supabase, "twilio", dayAgo).catch(() => null),
    (async () => {
      try {
        const r = await supabase
          .from("system_health_events")
          .select("user_id")
          .eq("event_category", "user_activity")
          .gte("occurred_at", hourAgo)
          .not("user_id", "is", null)
          .limit(500);
        return new Set((r.data ?? []).map((row) => row.user_id)).size;
      } catch {
        return 0;
      }
    })(),
    probeCloudStorage(supabase).catch((err) => ({
      status: "FAILED" as HealthStatus,
      detail: err instanceof Error ? err.message : "Storage probe failed",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
      buckets: [],
      recentMediaAt: null
    })),
    probeRealtime(supabase).catch((err) => ({
      status: "FAILED" as HealthStatus,
      detail: err instanceof Error ? err.message : "Realtime probe failed",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
      realtimeHttpOk: null,
      boardFreshestAt: null
    })),
    probeBackgroundWorker(supabase).catch((err) => ({
      status: "FAILED" as HealthStatus,
      detail: err instanceof Error ? err.message : "Worker probe failed",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
      workerUrlConfigured: Boolean(process.env.ROUTE_WORKER_URL),
      httpOk: null
    })),
    probeJobQueue(supabase).catch((err) => ({
      status: "FAILED" as HealthStatus,
      detail: err instanceof Error ? err.message : "Queue probe failed",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
      counts: {
        queued: 0,
        running: 0,
        waitingAuth: 0,
        completed: 0,
        completedWithWarnings: 0,
        failed: 0,
        cancelled: 0,
        stuckRunning: 0
      },
      failedToday: 0
    })),
    checkSystemHealthSchema(supabase).catch(
      (): SchemaReadiness => ({
        ready: false,
        migration: "072_system_health_debugging.sql",
        present: [],
        missing: [...SYSTEM_HEALTH_REQUIRED_TABLES],
        canApplyViaPg: false,
        detail: "Unable to verify System Health schema."
      })
    )
  ]);

  const dbProbe = dbProbeTimed;
  const dbMs = dbProbeTimed.latencyMs;
  const totalProbeMs = Date.now() - started;

  const routeGen = await probeRouteGenerator(supabase, {
    routeFailToday: Number(routeFail) || 0
  }).catch((err) => ({
    status: "WARNING" as HealthStatus,
    detail: err instanceof Error ? err.message : "Route generator probe failed",
    responseTimeMs: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: err instanceof Error ? err.message : String(err),
    errorsLast24h: Number(routeFail) || 0,
    lastRouteGeneration: null,
    source: "module_ready" as const
  }));

  const gingr = evaluateGingrHealth({
    lastWebhookAt: webhook.data?.created_at ? String(webhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null
  });

  const sms = getSmsProvider();
  const mapsConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());

  let samsaraStatus: HealthStatus = isSamsaraLiveConfigured() ? "HEALTHY" : "WARNING";
  let samsaraDetail = isSamsaraLiveConfigured()
    ? "Live GPS configured (secrets not exposed)."
    : "Samsara live GPS not configured.";
  if (samsaraStats && samsaraStats.failures > 0) {
    samsaraStatus =
      samsaraStats.successRate != null && samsaraStats.successRate < 80 ? "DEGRADED" : "WARNING";
    samsaraDetail = `${samsaraStats.failures} export/API failure(s) in last 24h.`;
  }
  if (lastExport && "data" in lastExport && lastExport.data) {
    const st = String(lastExport.data.status || "");
    if (/fail|error/i.test(st)) {
      samsaraStatus = "DEGRADED";
      samsaraDetail = "Latest export job failed.";
    }
  }

  let gingrStatus: HealthStatus =
    gingr.status === "healthy"
      ? "HEALTHY"
      : gingr.status === "degraded"
        ? "DEGRADED"
        : gingr.status === "offline"
          ? "FAILED"
          : "WARNING";
  if (gingrStats && gingrStats.failures > 0 && gingrStatus === "HEALTHY") {
    gingrStatus = "WARNING";
  }

  const services: ServiceHealthCard[] = [
    {
      id: "ruffops",
      label: "RuffOps Application",
      status: "HEALTHY",
      responseTimeMs: totalProbeMs,
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: Number(errorsHour) || 0,
      errorsLast24h: Number(errorsDay) || 0,
      successRate24h: null,
      detail: `Admin application responding (full probe suite ${totalProbeMs} ms).`
    },
    {
      id: "database",
      label: "Database",
      status: dbProbe.error ? "FAILED" : "HEALTHY",
      responseTimeMs: dbMs,
      lastSuccessAt: dbProbe.error ? null : new Date().toISOString(),
      lastFailureAt: dbProbe.error ? new Date().toISOString() : null,
      lastError: dbProbe.error?.message || null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: dbProbe.error ? "Database probe failed." : `admin_settings probe ok (${dbMs} ms).`
    },
    {
      id: "authentication",
      label: "Authentication",
      status: "HEALTHY",
      responseTimeMs: null,
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: "Session auth via existing RuffOps admin sessions."
    },
    {
      id: "gingr",
      label: "Gingr",
      status: gingrStatus,
      responseTimeMs: gingrStats?.avgLatency ?? null,
      lastSuccessAt: gingr.freshestAt || gingrStats?.lastSuccessAt || null,
      lastFailureAt: gingrStats?.lastFailureAt || null,
      lastError:
        gingrStats?.lastError ||
        (webhook.data?.processing_error ? String(webhook.data.processing_error) : null),
      errorsLastHour: 0,
      errorsLast24h: gingrStats?.failures ?? 0,
      successRate24h: gingrStats?.successRate ?? null,
      detail: gingr.detail
    },
    {
      id: "samsara",
      label: "Samsara",
      status: samsaraStatus,
      responseTimeMs: samsaraStats?.avgLatency ?? null,
      lastSuccessAt: samsaraStats?.lastSuccessAt || null,
      lastFailureAt: samsaraStats?.lastFailureAt || null,
      lastError: samsaraStats?.lastError || null,
      errorsLastHour: 0,
      errorsLast24h: samsaraStats?.failures ?? 0,
      successRate24h: samsaraStats?.successRate ?? null,
      detail: samsaraDetail
    },
    {
      id: "twilio",
      label: "Twilio",
      status: sms.isConfigured()
        ? twilioStats && twilioStats.failures > 0
          ? "WARNING"
          : "HEALTHY"
        : "WARNING",
      responseTimeMs: twilioStats?.avgLatency ?? null,
      lastSuccessAt: twilioStats?.lastSuccessAt || null,
      lastFailureAt: twilioStats?.lastFailureAt || null,
      lastError: twilioStats?.lastError || null,
      errorsLastHour: 0,
      errorsLast24h: twilioStats?.failures ?? 0,
      successRate24h: twilioStats?.successRate ?? null,
      detail: sms.isConfigured()
        ? "SMS provider configured (credentials never shown)."
        : "Twilio is not configured."
    },
    {
      id: "route_generator",
      label: "Route Generator",
      status: routeGen.status,
      responseTimeMs: routeGen.responseTimeMs,
      lastSuccessAt: routeGen.lastSuccessAt,
      lastFailureAt: routeGen.lastFailureAt,
      lastError: routeGen.lastError,
      errorsLastHour: 0,
      errorsLast24h: routeGen.errorsLast24h,
      successRate24h: null,
      detail: routeGen.detail,
      meta: { source: routeGen.source }
    },
    {
      id: "maps",
      label: "Maps / Geocoding",
      status: mapsConfigured ? "HEALTHY" : "WARNING",
      responseTimeMs: null,
      lastSuccessAt: mapsConfigured ? new Date().toISOString() : null,
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: mapsConfigured
        ? "GOOGLE_MAPS_API_KEY present (key not exposed)."
        : "Google Maps API key not configured."
    },
    {
      id: "background_worker",
      label: "Background Worker",
      status: workerProbe.status,
      responseTimeMs: workerProbe.responseTimeMs,
      lastSuccessAt: workerProbe.lastSuccessAt,
      lastFailureAt: workerProbe.lastFailureAt,
      lastError: workerProbe.lastError,
      errorsLastHour: 0,
      errorsLast24h: queueProbe.failedToday,
      successRate24h: null,
      detail: workerProbe.detail,
      meta: {
        workerUrlConfigured: workerProbe.workerUrlConfigured,
        httpOk: workerProbe.httpOk
      }
    },
    {
      id: "job_queue",
      label: "Job Queue",
      status: queueProbe.status,
      responseTimeMs: queueProbe.responseTimeMs,
      lastSuccessAt: queueProbe.lastSuccessAt,
      lastFailureAt: queueProbe.lastFailureAt,
      lastError: queueProbe.lastError,
      errorsLastHour: 0,
      errorsLast24h: queueProbe.failedToday,
      successRate24h: null,
      detail: queueProbe.detail,
      meta: { counts: queueProbe.counts, failedToday: queueProbe.failedToday }
    },
    {
      id: "email",
      label: "Email Provider",
      status: process.env.RESEND_API_KEY || process.env.SMTP_HOST ? "HEALTHY" : "WARNING",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail:
        process.env.RESEND_API_KEY || process.env.SMTP_HOST
          ? "Email provider env configured (secrets not exposed)."
          : "No email provider env detected."
    },
    {
      id: "storage",
      label: "Cloud Storage",
      status: storageProbe.status,
      responseTimeMs: storageProbe.responseTimeMs,
      lastSuccessAt: storageProbe.lastSuccessAt || storageProbe.recentMediaAt,
      lastFailureAt: storageProbe.lastFailureAt,
      lastError: storageProbe.lastError,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: storageProbe.detail,
      meta: {
        buckets: storageProbe.buckets,
        recentMediaAt: storageProbe.recentMediaAt,
        backend: "supabase_storage"
      }
    },
    {
      id: "realtime",
      label: "Realtime / WebSocket",
      status: realtimeProbe.status,
      responseTimeMs: realtimeProbe.responseTimeMs,
      lastSuccessAt: realtimeProbe.lastSuccessAt || realtimeProbe.boardFreshestAt,
      lastFailureAt: realtimeProbe.lastFailureAt,
      lastError: realtimeProbe.lastError,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: realtimeProbe.detail,
      meta: {
        realtimeHttpOk: realtimeProbe.realtimeHttpOk,
        boardFreshestAt: realtimeProbe.boardFreshestAt
      }
    },
    {
      id: "observability_schema",
      label: "System Health Schema (072)",
      status: schema.ready ? "HEALTHY" : "DEGRADED",
      responseTimeMs: null,
      lastSuccessAt: schema.ready ? new Date().toISOString() : null,
      lastFailureAt: schema.ready ? null : new Date().toISOString(),
      lastError: schema.ready ? null : schema.detail,
      errorsLastHour: 0,
      errorsLast24h: schema.missing.length,
      successRate24h: null,
      detail: schema.detail,
      meta: {
        migration: schema.migration,
        present: schema.present,
        missing: schema.missing,
        canApplyViaPg: schema.canApplyViaPg
      }
    }
  ];

  // Coerce any residual UNKNOWN so Overview never shows that dead-end label
  for (const svc of services) {
    if (svc.status === "UNKNOWN") {
      svc.status = coerceServiceStatus(svc.status);
      if (!svc.detail) svc.detail = "Status could not be fully determined — treating as warning.";
    }
  }

  if (audit?.open_issues?.length) {
    const app = services.find((s) => s.id === "ruffops");
    if (app && app.status === "HEALTHY") {
      app.status = "WARNING";
      app.detail = `${audit.open_issues.length} open system-health audit issue(s).`;
    }
  }

  const systemHealth = aggregateSystemHealth(services);

  // Persist latest checks (best-effort)
  try {
    const rows = services.map((s) => ({
      service_id: s.id,
      status: s.status,
      response_time_ms: s.responseTimeMs,
      last_success_at: s.lastSuccessAt,
      last_failure_at: s.lastFailureAt,
      last_error: s.lastError,
      errors_last_hour: s.errorsLastHour,
      errors_last_24h: s.errorsLast24h,
      success_rate_24h: s.successRate24h,
      detail: s.detail,
      checked_at: new Date().toISOString()
    }));
    await supabase.from("system_health_service_checks").insert(rows);
  } catch {
    /* ignore */
  }

  const queueDepth =
    queueProbe.counts.queued + queueProbe.counts.running + queueProbe.counts.waitingAuth;

  return {
    services,
    schema,
    summary: {
      systemHealth,
      errorsToday: Number(errorsToday) || 0,
      warningsToday: Number(warningsToday) || 0,
      failedJobs: queueProbe.failedToday,
      integrationFailures: Number(integFail) || 0,
      routeAuditFailures: Number(routeFail) || 0,
      usersActive: Number(activeUsers) || 0,
      releaseVersion:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
        process.env.NEXT_PUBLIC_APP_VERSION ||
        null,
      lastRouteGeneration: routeGen.lastRouteGeneration,
      lastGingrSync: gingr.freshestAt,
      lastSamsaraExport:
        lastExport && "data" in lastExport && lastExport.data?.created_at
          ? String(lastExport.data.created_at)
          : null,
      storageBucketsOk: storageProbe.buckets.filter((b) => b.listOk).length,
      queueDepth,
      schemaReady: schema.ready
    }
  };
}
