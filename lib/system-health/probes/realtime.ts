/**
 * Supabase Realtime / board feed probe.
 * Boards, lobby, and cast TV subscribe via postgres_changes — we verify project
 * config + realtime HTTP surface + recent board row activity as functional evidence.
 */

import type { HealthStatus } from "@/lib/system-health/types";
import type { getServiceSupabase } from "@/lib/supabase/server";
import { supabaseProjectUrl } from "@/lib/system-health/probes/storage";

type Supabase = ReturnType<typeof getServiceSupabase>;

export type RealtimeProbeResult = {
  status: HealthStatus;
  detail: string;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  realtimeHttpOk: boolean | null;
  boardFreshestAt: string | null;
};

async function probeRealtimeHttp(projectUrl: string): Promise<{
  ok: boolean;
  latencyMs: number;
  error: string | null;
  statusCode: number | null;
}> {
  const started = Date.now();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!key) {
    return { ok: false, latencyMs: 0, error: "missing_supabase_key", statusCode: null };
  }

  // Prefer dedicated health path; fall back to realtime root.
  const candidates = [
    `${projectUrl.replace(/\/$/, "")}/realtime/v1/api/tenants/realtime-dev/health`,
    `${projectUrl.replace(/\/$/, "")}/realtime/v1/`
  ];

  let lastError: string | null = null;
  let lastStatus: number | null = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        },
        signal: AbortSignal.timeout(8_000)
      });
      lastStatus = res.status;
      // 2xx/4xx (auth/path) still proves the realtime gateway is up; 5xx/network = bad
      if (res.status < 500) {
        return { ok: true, latencyMs: Date.now() - started, error: null, statusCode: res.status };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    ok: false,
    latencyMs: Date.now() - started,
    error: lastError,
    statusCode: lastStatus
  };
}

export async function probeRealtime(supabase: Supabase): Promise<RealtimeProbeResult> {
  const projectUrl = supabaseProjectUrl();
  if (!projectUrl) {
    return {
      status: "FAILED",
      detail: "NEXT_PUBLIC_SUPABASE_URL missing — Realtime cannot run.",
      responseTimeMs: null,
      lastSuccessAt: null,
      lastFailureAt: new Date().toISOString(),
      lastError: "missing_supabase_url",
      realtimeHttpOk: null,
      boardFreshestAt: null
    };
  }

  const [http, board] = await Promise.all([
    probeRealtimeHttp(projectUrl),
    (async () => {
      try {
        const { data, error } = await supabase
          .from("live_transition_dogs")
          .select("updated_at, last_seen_from_gingr_at")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return { at: null as string | null, error: error.message };
        const at =
          (data?.updated_at && String(data.updated_at)) ||
          (data?.last_seen_from_gingr_at && String(data.last_seen_from_gingr_at)) ||
          null;
        return { at, error: null as string | null };
      } catch (err) {
        return { at: null as string | null, error: err instanceof Error ? err.message : String(err) };
      }
    })()
  ]);

  let status: HealthStatus = "HEALTHY";
  let detail = "";
  let lastError: string | null = null;
  let lastFailureAt: string | null = null;

  if (!http.ok && !board.at) {
    status = "DEGRADED";
    detail = `Realtime HTTP probe failed (${http.error || "unknown"}) and no board activity found.`;
    lastError = http.error || board.error;
    lastFailureAt = new Date().toISOString();
  } else if (!http.ok) {
    status = "WARNING";
    detail = `Board table reachable; Realtime HTTP probe failed (${http.error}). Clients may still connect via Supabase JS.`;
    lastError = http.error;
  } else if (!board.at) {
    status = "HEALTHY";
    detail = `Realtime gateway responding (${http.latencyMs} ms). No recent board row updates yet.`;
  } else {
    status = "HEALTHY";
    detail = `Realtime OK (${http.latencyMs} ms). Board feed evidence at ${new Date(board.at).toLocaleString()}.`;
  }

  return {
    status,
    detail,
    responseTimeMs: http.latencyMs || null,
    lastSuccessAt: http.ok || board.at ? new Date().toISOString() : null,
    lastFailureAt,
    lastError,
    realtimeHttpOk: http.ok,
    boardFreshestAt: board.at
  };
}
