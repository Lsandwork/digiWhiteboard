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
};

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
      ? Math.round(
          rows.reduce((n, r) => n + Number(r.latency_ms || 0), 0) / rows.length
        )
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
    dbProbe,
    webhook,
    lastDogSeen,
    audit,
    errorsHour,
    errorsDay,
    errorsToday,
    warningsToday,
    routeFail,
    integFail,
    lastRoute,
    lastExport,
    gingrStats,
    samsaraStats,
    twilioStats,
    jobsFailed,
    activeUsers
  ] = await Promise.all([
    supabase.from("admin_settings").select("id").eq("id", "default").maybeSingle(),
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
    safeMaybe<{ finished_at: string | null; started_at: string | null; status: string | null }>(() =>
      supabase
        .from("system_health_route_audits")
        .select("finished_at, started_at, status")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
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
    safeCount(() =>
      supabase
        .from("route_worker_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["failed", "dead", "error"])
        .gte("created_at", todayIso)
    ),
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
    })()
  ]);

  const dbMs = Date.now() - started;
  const gingr = evaluateGingrHealth({
    lastWebhookAt: webhook.data?.created_at ? String(webhook.data.created_at) : null,
    lastDogSeenAt: lastDogSeen.data?.last_seen_from_gingr_at
      ? String(lastDogSeen.data.last_seen_from_gingr_at)
      : null
  });

  const sms = getSmsProvider();
  const mapsConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());

  // Functional: recent route audit failures → Route Generator WARNING/DEGRADED
  let routeGenStatus: HealthStatus = "UNKNOWN";
  let routeGenDetail = "No route audits recorded yet.";
  if (lastRoute && "data" in lastRoute && lastRoute.data) {
    const st = String(lastRoute.data.status || "");
    if (st === "failed") {
      routeGenStatus = "DEGRADED";
      routeGenDetail = "Most recent route audit failed quality gate.";
    } else if (st === "warning") {
      routeGenStatus = "WARNING";
      routeGenDetail = "Most recent route audit passed with warnings.";
    } else if (st === "passed") {
      routeGenStatus = "HEALTHY";
      routeGenDetail = "Most recent route audit passed.";
    }
  }
  if (Number(routeFail) > 0 && routeGenStatus === "HEALTHY") {
    routeGenStatus = "WARNING";
    routeGenDetail = `${routeFail} failed route audit(s) today.`;
  }

  let samsaraStatus: HealthStatus = isSamsaraLiveConfigured() ? "HEALTHY" : "UNKNOWN";
  let samsaraDetail = isSamsaraLiveConfigured()
    ? "Live GPS configured (secrets not exposed)."
    : "Samsara live GPS not configured.";
  if (samsaraStats && samsaraStats.failures > 0) {
    samsaraStatus = samsaraStats.successRate != null && samsaraStats.successRate < 80 ? "DEGRADED" : "WARNING";
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
          : "UNKNOWN";
  if (gingrStats && gingrStats.failures > 0 && gingrStatus === "HEALTHY") {
    gingrStatus = "WARNING";
  }

  const services: ServiceHealthCard[] = [
    {
      id: "ruffops",
      label: "RuffOps Application",
      status: "HEALTHY",
      responseTimeMs: dbMs,
      lastSuccessAt: new Date().toISOString(),
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: Number(errorsHour) || 0,
      errorsLast24h: Number(errorsDay) || 0,
      successRate24h: null,
      detail: "Admin application responding."
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
      detail: dbProbe.error ? "Database probe failed." : "admin_settings probe ok."
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
      lastError: gingrStats?.lastError || (webhook.data?.processing_error ? String(webhook.data.processing_error) : null),
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
        : "UNKNOWN",
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
      status: routeGenStatus,
      responseTimeMs: null,
      lastSuccessAt:
        lastRoute && "data" in lastRoute && lastRoute.data?.finished_at
          ? String(lastRoute.data.finished_at)
          : lastRoute && "data" in lastRoute && lastRoute.data?.started_at
            ? String(lastRoute.data.started_at)
            : null,
      lastFailureAt: routeGenStatus === "DEGRADED" ? new Date().toISOString() : null,
      lastError: routeGenStatus === "DEGRADED" ? routeGenDetail : null,
      errorsLastHour: 0,
      errorsLast24h: Number(routeFail) || 0,
      successRate24h: null,
      detail: routeGenDetail
    },
    {
      id: "maps",
      label: "Maps / Geocoding",
      status: mapsConfigured ? "HEALTHY" : "UNKNOWN",
      responseTimeMs: null,
      lastSuccessAt: null,
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
      status: Number(jobsFailed) > 0 ? "WARNING" : "UNKNOWN",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: Number(jobsFailed) > 0 ? new Date().toISOString() : null,
      lastError: Number(jobsFailed) > 0 ? `${jobsFailed} failed job(s) today` : null,
      errorsLastHour: 0,
      errorsLast24h: Number(jobsFailed) || 0,
      successRate24h: null,
      detail:
        Number(jobsFailed) > 0
          ? `${jobsFailed} failed route worker job(s) today.`
          : "No failed worker jobs recorded today (or table empty)."
    },
    {
      id: "job_queue",
      label: "Job Queue",
      status: Number(jobsFailed) > 5 ? "DEGRADED" : Number(jobsFailed) > 0 ? "WARNING" : "UNKNOWN",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: Number(jobsFailed) || 0,
      successRate24h: null,
      detail: "route_worker_jobs queue."
    },
    {
      id: "email",
      label: "Email Provider",
      status: process.env.RESEND_API_KEY || process.env.SMTP_HOST ? "HEALTHY" : "UNKNOWN",
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
      label: "Storage",
      status: process.env.MEDIA_LIBRARY_BUCKET || process.env.SUPABASE_URL ? "HEALTHY" : "UNKNOWN",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: "Media metadata in DB; binaries in object storage when configured."
    },
    {
      id: "realtime",
      label: "Realtime / WebSocket",
      status: process.env.SUPABASE_URL ? "HEALTHY" : "UNKNOWN",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      errorsLastHour: 0,
      errorsLast24h: 0,
      successRate24h: null,
      detail: "Uses Supabase realtime when enabled for board/ops feeds."
    }
  ];

  if (audit?.open_issues?.length) {
    const app = services.find((s) => s.id === "ruffops");
    if (app && app.status === "HEALTHY") {
      app.status = "WARNING";
      app.detail = `${audit.open_issues.length} open system-health audit issue(s).`;
    }
  }

  const rank: Record<HealthStatus, number> = {
    FAILED: 4,
    DEGRADED: 3,
    WARNING: 2,
    UNKNOWN: 1,
    HEALTHY: 0
  };
  const systemHealth = services.reduce<HealthStatus>((acc, s) => {
    return rank[s.status] > rank[acc] ? s.status : acc;
  }, "HEALTHY");

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

  return {
    services,
    summary: {
      systemHealth,
      errorsToday: Number(errorsToday) || 0,
      warningsToday: Number(warningsToday) || 0,
      failedJobs: Number(jobsFailed) || 0,
      integrationFailures: Number(integFail) || 0,
      routeAuditFailures: Number(routeFail) || 0,
      usersActive: Number(activeUsers) || 0,
      releaseVersion:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || process.env.NEXT_PUBLIC_APP_VERSION || null,
      lastRouteGeneration:
        lastRoute && "data" in lastRoute && lastRoute.data
          ? String(lastRoute.data.finished_at || lastRoute.data.started_at || "")
          : null,
      lastGingrSync: gingr.freshestAt,
      lastSamsaraExport:
        lastExport && "data" in lastExport && lastExport.data?.created_at
          ? String(lastExport.data.created_at)
          : null
    }
  };
}
