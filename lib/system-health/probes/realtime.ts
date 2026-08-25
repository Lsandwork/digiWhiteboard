/**
 * Supabase Realtime / board feed probe.
 * Boards, lobby, and cast TV subscribe via postgres_changes — we verify project
 * config + realtime HTTP surface + recent board row activity as functional evidence.
 */

import type { HealthStatus } from "@/lib/system-health/types";
import type { getServiceSupabase } from "@/lib/supabase/server";
import { supabaseProjectUrl } from "@/lib/system-health/probes/storage";
import { withTimeoutFallback } from "@/lib/server-ttl-cache";

type Supabase = ReturnType<typeof getServiceSupabase>;

/** Board freshness from hung `live_transition_dogs` must never block System Health. */
export const REALTIME_BOARD_FRESH_TIMEOUT_MS = 1_200;

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
        signal: AbortSignal.timeout(3_000)
      });
      lastStatus = res.status;
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

function freshestIso(...values: Array<string | null | undefined>) {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

async function loadBoardFreshest(supabase: Supabase): Promise<{
  at: string | null;
  error: string | null;
}> {
  try {
    // Prefer non-hung evidence first: recent board-related system health events.
    const eventFresh = await withTimeoutFallback(
      Promise.resolve(
        supabase
          .from("system_health_events")
          .select("occurred_at")
          .in("module", ["board", "lobby", "staff_board", "gingr", "whiteboard"])
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).then((row) => ({
        data: row.data ? { occurred_at: String(row.data.occurred_at || "") } : null
      })),
      REALTIME_BOARD_FRESH_TIMEOUT_MS,
      { data: null as { occurred_at: string } | null }
    );
    if (eventFresh.data?.occurred_at) {
      return { at: String(eventFresh.data.occurred_at), error: null };
    }

    // `live_transition_dogs` hangs in production — hard-cap so AbortError never escapes.
    const hung = await withTimeoutFallback(
      (async () => {
        const [byUpdated, bySeen] = await Promise.all([
          supabase
            .from("live_transition_dogs")
            .select("updated_at, last_seen_from_gingr_at")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("live_transition_dogs")
            .select("updated_at, last_seen_from_gingr_at")
            .not("last_seen_from_gingr_at", "is", null)
            .order("last_seen_from_gingr_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);
        const err = byUpdated.error?.message || bySeen.error?.message || null;
        const at = freshestIso(
          byUpdated.data?.updated_at ? String(byUpdated.data.updated_at) : null,
          byUpdated.data?.last_seen_from_gingr_at
            ? String(byUpdated.data.last_seen_from_gingr_at)
            : null,
          bySeen.data?.updated_at ? String(bySeen.data.updated_at) : null,
          bySeen.data?.last_seen_from_gingr_at ? String(bySeen.data.last_seen_from_gingr_at) : null
        );
        return { at, error: at ? null : err };
      })(),
      REALTIME_BOARD_FRESH_TIMEOUT_MS,
      { at: null, error: "board_freshest_timeout" }
    );
    return hung;
  } catch (err) {
    return { at: null, error: err instanceof Error ? err.message : String(err) };
  }
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
    loadBoardFreshest(supabase)
  ]);

  const boardAgeMs = board.at ? Math.max(0, Date.now() - new Date(board.at).getTime()) : null;
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
    detail = `Realtime gateway responding (${http.latencyMs} ms). No board row timestamps yet.`;
  } else if (boardAgeMs != null && boardAgeMs > 24 * 60 * 60_000) {
    // Gateway up, but board evidence is stale — informational, not a hard failure
    // (overnight quiet boards are normal; still call out >24h)
    status = "HEALTHY";
    detail = `Realtime gateway OK (${http.latencyMs} ms). Last board evidence ${Math.round(boardAgeMs / 3600000)}h ago (${new Date(board.at).toLocaleString()}).`;
  } else {
    status = "HEALTHY";
    const mins = boardAgeMs != null ? Math.round(boardAgeMs / 60000) : null;
    detail = `Realtime OK (${http.latencyMs} ms). Board feed evidence ${
      mins != null ? `${mins}m ago` : "present"
    } (${new Date(board.at).toLocaleString()}).`;
  }

  return {
    status,
    detail,
    responseTimeMs: http.latencyMs || null,
    lastSuccessAt: http.ok ? new Date().toISOString() : board.at,
    lastFailureAt,
    lastError,
    realtimeHttpOk: http.ok,
    boardFreshestAt: board.at
  };
}
