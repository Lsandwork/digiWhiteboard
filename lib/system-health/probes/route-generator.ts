/**
 * Route Generator health from system_health_route_audits, with fallbacks to
 * route_plans / route_audit_events so the card reflects operability — not
 * normal workflow states like needs_review.
 */

import type { HealthStatus } from "@/lib/system-health/types";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export type RouteGeneratorProbeResult = {
  status: HealthStatus;
  detail: string;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  errorsLast24h: number;
  lastRouteGeneration: string | null;
  source: "system_health_route_audits" | "route_plans" | "route_audit_events" | "module_ready";
};

/** Plan statuses that mean the generator ran successfully (ops may still review). */
const HEALTHY_PLAN_STATUSES = new Set([
  "draft",
  "needs_review",
  "ready_for_approval",
  "approved",
  "exported",
  "synced_to_samsara",
  "superseded"
]);

export async function probeRouteGenerator(
  supabase: Supabase,
  options?: { routeFailToday?: number }
): Promise<RouteGeneratorProbeResult> {
  const routeFailToday = options?.routeFailToday ?? 0;
  const started = Date.now();

  // 1) Preferred: system health route audits
  try {
    const { data, error } = await supabase
      .from("system_health_route_audits")
      .select("finished_at, started_at, status, quality_gate, duration_ms")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const st = String(data.status || "");
      const finished = data.finished_at ? String(data.finished_at) : null;
      const startedAt = data.started_at ? String(data.started_at) : null;
      const at = finished || startedAt;
      let status: HealthStatus = "HEALTHY";
      let detail = `Most recent route audit ${st || "recorded"} (${data.quality_gate || "n/a"}).`;
      let lastFailureAt: string | null = null;
      let lastError: string | null = null;

      if (st === "failed") {
        status = "DEGRADED";
        detail = "Most recent route audit failed quality gate.";
        lastFailureAt = at;
        lastError = detail;
      } else if (st === "warning") {
        status = "WARNING";
        detail = "Most recent route audit passed with warnings.";
      } else if (st === "passed" || st === "running") {
        status = "HEALTHY";
        detail =
          st === "running"
            ? "Route audit in progress."
            : "Most recent route audit passed.";
      }

      if (routeFailToday > 0 && status === "HEALTHY") {
        status = "WARNING";
        detail = `${routeFailToday} failed route audit(s) today.`;
      }

      return {
        status,
        detail,
        responseTimeMs: data.duration_ms != null ? Number(data.duration_ms) : Date.now() - started,
        lastSuccessAt: st === "failed" ? null : at,
        lastFailureAt,
        lastError,
        errorsLast24h: routeFailToday,
        lastRouteGeneration: at,
        source: "system_health_route_audits"
      };
    }
  } catch {
    /* fall through */
  }

  // 2) Fallback: latest route plan (needs_review is a normal post-generate state)
  try {
    const { data } = await supabase
      .from("route_plans")
      .select("id, status, created_at, updated_at, operating_date, summary")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const st = String(data.status || "");
      const at = String(data.updated_at || data.created_at || "");
      const summary =
        data.summary && typeof data.summary === "object"
          ? (data.summary as Record<string, unknown>)
          : {};
      const correlationId = summary.correlationId ? String(summary.correlationId) : null;
      const gate = summary.systemHealthQualityGate
        ? String(summary.systemHealthQualityGate)
        : null;

      let status: HealthStatus = "HEALTHY";
      let detail = "";
      let lastFailureAt: string | null = null;
      let lastError: string | null = null;

      if (st === "failed") {
        status = "DEGRADED";
        detail = "Latest route plan status is failed.";
        lastFailureAt = at;
        lastError = detail;
      } else if (st === "generating") {
        // In-progress generate is fine unless we later detect stuck jobs via queue probe
        status = "HEALTHY";
        detail = `Route plan generating for ${data.operating_date || "n/a"}.`;
      } else if (HEALTHY_PLAN_STATUSES.has(st)) {
        status = "HEALTHY";
        const reviewNote =
          st === "needs_review" || st === "ready_for_approval"
            ? " awaiting management review"
            : "";
        detail = correlationId
          ? `Latest plan ${st} for ${data.operating_date || "n/a"}${reviewNote} (${correlationId}${gate ? `, gate ${gate}` : ""}).`
          : `Latest plan ${st} for ${data.operating_date || "n/a"}${reviewNote}. System Health audit row not found yet (generate again to backfill, or check audit persistence).`;
      } else {
        status = "WARNING";
        detail = `Latest plan has unexpected status "${st}".`;
      }

      if (routeFailToday > 0 && status === "HEALTHY") {
        status = "WARNING";
        detail = `${routeFailToday} failed route audit(s) today. Latest plan ${st}.`;
      }

      return {
        status,
        detail,
        responseTimeMs: Date.now() - started,
        lastSuccessAt: st === "failed" ? null : at,
        lastFailureAt,
        lastError,
        errorsLast24h: routeFailToday,
        lastRouteGeneration: at,
        source: "route_plans"
      };
    }
  } catch {
    /* fall through */
  }

  // 3) Fallback: route_audit_events
  try {
    const { data } = await supabase
      .from("route_audit_events")
      .select("created_at, action, correlation_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const at = String(data.created_at || "");
      return {
        status: "HEALTHY",
        detail: `Route activity via audit event "${data.action}"${data.correlation_id ? ` (${data.correlation_id})` : ""}.`,
        responseTimeMs: Date.now() - started,
        lastSuccessAt: at,
        lastFailureAt: null,
        lastError: null,
        errorsLast24h: routeFailToday,
        lastRouteGeneration: at,
        source: "route_audit_events"
      };
    }
  } catch {
    /* fall through */
  }

  // 4) Module ready: settings / maps imply generator can run
  const mapsOk = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());
  let settingsOk = false;
  try {
    const { data } = await supabase
      .from("route_generator_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    settingsOk = Boolean(data);
  } catch {
    settingsOk = false;
  }

  if (settingsOk || mapsOk) {
    return {
      status: "HEALTHY",
      detail: mapsOk
        ? "Route Generator ready (settings/maps present). No audited generations yet — first generate will create a system health audit."
        : "Route Generator settings present. No audited generations yet.",
      responseTimeMs: Date.now() - started,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      errorsLast24h: routeFailToday,
      lastRouteGeneration: null,
      source: "module_ready"
    };
  }

  return {
    status: "WARNING",
    detail: "Route Generator tables/settings not detected and no generation history found.",
    responseTimeMs: Date.now() - started,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    errorsLast24h: routeFailToday,
    lastRouteGeneration: null,
    source: "module_ready"
  };
}
