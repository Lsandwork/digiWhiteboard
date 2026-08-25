/**
 * Route worker HTTP health + route_worker_jobs queue depth / stuck-job probe.
 */

import type { HealthStatus } from "@/lib/system-health/types";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export type WorkerProbeResult = {
  status: HealthStatus;
  detail: string;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  workerUrlConfigured: boolean;
  httpOk: boolean | null;
};

export type QueueProbeResult = {
  status: HealthStatus;
  detail: string;
  responseTimeMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  counts: {
    queued: number;
    running: number;
    waitingAuth: number;
    completed: number;
    completedWithWarnings: number;
    failed: number;
    cancelled: number;
    stuckRunning: number;
  };
  failedToday: number;
};

const STUCK_RUNNING_MS = 60 * 60 * 1000; // 1 hour

export async function probeBackgroundWorker(
  supabase: Supabase
): Promise<WorkerProbeResult> {
  const workerUrl = process.env.ROUTE_WORKER_URL?.trim().replace(/\/$/, "") || "";
  const workerUrlConfigured = Boolean(workerUrl);

  let httpOk: boolean | null = null;
  let responseTimeMs: number | null = null;
  let httpError: string | null = null;

  if (workerUrl) {
    const started = Date.now();
    try {
      const res = await fetch(`${workerUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3_000)
      });
      responseTimeMs = Date.now() - started;
      httpOk = res.ok;
      if (!res.ok) httpError = `HTTP ${res.status}`;
    } catch (err) {
      responseTimeMs = Date.now() - started;
      httpOk = false;
      httpError = err instanceof Error ? err.message : String(err);
    }
  }

  // Functional evidence from jobs table
  let lastCompletedAt: string | null = null;
  let failedToday = 0;
  const todayIso = new Date();
  todayIso.setHours(0, 0, 0, 0);
  try {
    const [completed, failed] = await Promise.all([
      supabase
        .from("route_worker_jobs")
        .select("completed_at, updated_at, created_at, status")
        .in("status", ["completed", "completed_with_warnings"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("route_worker_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", todayIso.toISOString())
    ]);
    const row = completed.data;
    lastCompletedAt = row
      ? String(row.completed_at || row.updated_at || row.created_at || "")
      : null;
    failedToday = failed.count ?? 0;
  } catch {
    /* table may be empty / missing columns */
  }

  let status: HealthStatus = "HEALTHY";
  let detail = "";
  let lastFailureAt: string | null = null;
  let lastError: string | null = null;

  if (workerUrlConfigured && httpOk === false) {
    status = lastCompletedAt ? "DEGRADED" : "FAILED";
    detail = `Worker /health failed (${httpError}).${lastCompletedAt ? " Recent job completions still observed." : ""}`;
    lastError = httpError;
    lastFailureAt = new Date().toISOString();
  } else if (workerUrlConfigured && httpOk) {
    status = failedToday > 0 ? "WARNING" : "HEALTHY";
    detail =
      failedToday > 0
        ? `Worker /health OK (${responseTimeMs} ms); ${failedToday} failed job(s) today.`
        : `Worker /health OK (${responseTimeMs} ms).`;
  } else if (lastCompletedAt) {
    status = failedToday > 0 ? "WARNING" : "HEALTHY";
    detail = `ROUTE_WORKER_URL unset here; last successful job ${new Date(lastCompletedAt).toLocaleString()}.`;
  } else {
    status = "WARNING";
    detail =
      "ROUTE_WORKER_URL not set and no completed route_worker_jobs yet. Configure worker URL for live probes.";
  }

  return {
    status,
    detail,
    responseTimeMs,
    lastSuccessAt: lastCompletedAt || (httpOk ? new Date().toISOString() : null),
    lastFailureAt,
    lastError,
    workerUrlConfigured,
    httpOk
  };
}

export async function probeJobQueue(supabase: Supabase): Promise<QueueProbeResult> {
  const started = Date.now();
  const todayIso = new Date();
  todayIso.setHours(0, 0, 0, 0);
  const stuckBefore = new Date(Date.now() - STUCK_RUNNING_MS).toISOString();

  const counts = {
    queued: 0,
    running: 0,
    waitingAuth: 0,
    completed: 0,
    completedWithWarnings: 0,
    failed: 0,
    cancelled: 0,
    stuckRunning: 0
  };
  let failedToday = 0;
  let lastSuccessAt: string | null = null;
  let lastFailureAt: string | null = null;
  let lastError: string | null = null;
  let tableError: string | null = null;

  try {
    const statuses: Array<{ key: keyof typeof counts; status: string }> = [
      { key: "queued", status: "queued" },
      { key: "running", status: "running" },
      { key: "waitingAuth", status: "waiting_for_authentication" },
      { key: "completed", status: "completed" },
      { key: "completedWithWarnings", status: "completed_with_warnings" },
      { key: "failed", status: "failed" },
      { key: "cancelled", status: "cancelled" }
    ];

    const results = await Promise.all(
      statuses.map(async ({ key, status }) => {
        const { count, error } = await supabase
          .from("route_worker_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", status);
        return { key, count: count ?? 0, error: error?.message || null };
      })
    );

    for (const r of results) {
      counts[r.key] = r.count;
      if (r.error) tableError = r.error;
    }

    const [stuck, failedTodayRes, lastOk, lastFail] = await Promise.all([
      supabase
        .from("route_worker_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .lt("updated_at", stuckBefore),
      supabase
        .from("route_worker_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", todayIso.toISOString()),
      supabase
        .from("route_worker_jobs")
        .select("completed_at, updated_at, created_at")
        .in("status", ["completed", "completed_with_warnings"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("route_worker_jobs")
        .select("created_at, error_message")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    // stuck may fail if updated_at missing — try created_at / started_at
    if (stuck.error) {
      const stuck2 = await supabase
        .from("route_worker_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running")
        .lt("created_at", stuckBefore);
      counts.stuckRunning = stuck2.count ?? 0;
    } else {
      counts.stuckRunning = stuck.count ?? 0;
    }

    failedToday = failedTodayRes.count ?? 0;
    if (lastOk.data) {
      lastSuccessAt = String(
        lastOk.data.completed_at || lastOk.data.updated_at || lastOk.data.created_at || ""
      );
    }
    if (lastFail.data) {
      lastFailureAt = String(lastFail.data.created_at || "");
      lastError = String(lastFail.data.error_message || "job failed");
    }
  } catch (err) {
    tableError = err instanceof Error ? err.message : String(err);
  }

  const depth = counts.queued + counts.running + counts.waitingAuth;
  let status: HealthStatus = "HEALTHY";
  let detail = "";

  if (tableError && counts.completed + counts.failed + depth === 0) {
    status = "WARNING";
    detail = `Could not fully read route_worker_jobs (${tableError}).`;
  } else if (counts.stuckRunning > 0) {
    status = "DEGRADED";
    detail = `${counts.stuckRunning} job(s) stuck in running >1h. Queue depth ${depth}; failed today ${failedToday}.`;
  } else if (failedToday > 5) {
    status = "DEGRADED";
    detail = `${failedToday} failed jobs today. Depth: queued=${counts.queued} running=${counts.running}.`;
  } else if (failedToday > 0) {
    status = "WARNING";
    detail = `${failedToday} failed job(s) today. Depth: queued=${counts.queued} running=${counts.running} waiting_auth=${counts.waitingAuth}.`;
  } else if (depth > 20) {
    status = "WARNING";
    detail = `Elevated queue depth (${depth}). Completions observed: ${counts.completed + counts.completedWithWarnings}.`;
  } else {
    status = "HEALTHY";
    detail = `Queue healthy — depth ${depth} (queued=${counts.queued}, running=${counts.running}). Completed ${counts.completed + counts.completedWithWarnings}; failed today ${failedToday}.`;
  }

  return {
    status,
    detail,
    responseTimeMs: Date.now() - started,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    counts,
    failedToday
  };
}
