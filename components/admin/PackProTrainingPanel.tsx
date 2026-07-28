"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { SortableTh } from "@/components/admin/ui/sortable-table";
import type { PackProLearnerRow, PackProSyncRun, PackProTrainingSummary } from "@/lib/pack-pro/types";

type CourseMeta = { id: number; slug: string; title: string };

type ListPayload = {
  rows: PackProLearnerRow[];
  total: number;
  summary: PackProTrainingSummary;
  courses: CourseMeta[];
  credentials_configured: boolean;
  last_synced_at: string | null;
  last_alert_at: string | null;
  canManage?: boolean;
};

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function progressTone(percent: number) {
  if (percent >= 100) return "bg-emerald-500/20 text-emerald-100 border-emerald-400/30";
  if (percent <= 0) return "bg-rose-500/15 text-rose-100 border-rose-400/25";
  return "bg-amber-500/15 text-amber-100 border-amber-400/30";
}

function ProgressCell({ percent }: { percent: number }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-admin-muted">
        <span className={`rounded border px-1.5 py-0.5 font-semibold tabular-nums ${progressTone(percent)}`}>
          {percent}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-400" : percent <= 0 ? "bg-rose-400/70" : "bg-fitdog-orange"}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}

export function PackProTrainingPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<ListPayload | null>(null);
  const [history, setHistory] = useState<PackProSyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [alerting, setAlerting] = useState(false);
  const [status, setStatus] = useState<"all" | "incomplete" | "complete" | "not_started">("incomplete");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "overall" | "incomplete">("incomplete");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, q });
      const [listRes, syncRes] = await Promise.all([
        fetch(`/api/admin/pack-pro-training?${params}`, { cache: "no-store" }),
        fetch("/api/admin/pack-pro-training?view=sync", { cache: "no-store" })
      ]);
      const listJson = (await listRes.json()) as ListPayload & { error?: string };
      const syncJson = (await syncRes.json()) as { history?: PackProSyncRun[]; error?: string };
      if (!listRes.ok) throw new Error(listJson.error || "Failed to load Pack Pro Training.");
      setData(listJson);
      if (syncRes.ok) setHistory(syncJson.history ?? []);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load Pack Pro Training.", "error");
    } finally {
      setLoading(false);
    }
  }, [q, showToast, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      else if (sortBy === "overall") cmp = a.overall_percent - b.overall_percent;
      else cmp = a.incomplete_courses.length - b.incomplete_courses.length || a.overall_percent - b.overall_percent;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data?.rows, sortBy, sortDir]);

  function toggleSort(next: typeof sortBy) {
    if (sortBy === next) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortBy(next);
      setSortDir(next === "name" ? "asc" : "desc");
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/pack-pro-training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" })
      });
      const json = (await res.json()) as { error?: string; summary?: PackProTrainingSummary };
      if (!res.ok) throw new Error(json.error || "Sync failed.");
      showToast(
        `Synced ${json.summary?.learner_count ?? 0} learners · ${json.summary?.incomplete_count ?? 0} incomplete`,
        "success"
      );
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Sync failed.", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function alertNow() {
    setAlerting(true);
    try {
      const res = await fetch("/api/admin/pack-pro-training", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "alert_incomplete" })
      });
      const json = (await res.json()) as { error?: string; sent?: boolean; incomplete_count?: number; reason?: string };
      if (!res.ok) throw new Error(json.error || "Alert failed.");
      if (json.sent) showToast(`Alerted management about ${json.incomplete_count} incomplete employees.`, "success");
      else {
        showToast(
          json.reason === "all_complete"
            ? "Everyone is complete — no alert sent."
            : "Alert already sent for today’s incomplete set.",
          "success"
        );
      }
      await load();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Alert failed.", "error");
    } finally {
      setAlerting(false);
    }
  }

  const summary = data?.summary;
  const courses = data?.courses ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-[rgba(255,166,0,0.12)] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fitdog-orange">Management</p>
          <h2 className="mt-1 font-display text-2xl text-admin-text md:text-3xl">Pack Pro Training</h2>
          <p className="mt-2 text-sm text-admin-muted">
            Live progress from packprotraining.com for Fitdog’s required courses. Sync pulls the facility report,
            tracks completion in this spreadsheet, and alerts admin / management when training is incomplete.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://packprotraining.com/groups-dashboard/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-admin-text hover:bg-white/10"
          >
            Open Pack Pro <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {data?.canManage ? (
            <>
              <button
                type="button"
                onClick={() => void alertNow()}
                disabled={alerting || !summary?.incomplete_count}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 hover:bg-rose-500/20 disabled:opacity-50"
              >
                <BellRing className={`h-3.5 w-3.5 ${alerting ? "animate-pulse" : ""}`} />
                Alert incomplete
              </button>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncing || data?.credentials_configured === false}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fitdog-orange px-3 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync from Pack Pro"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {!data?.credentials_configured ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
          Pack Pro credentials are not configured on the server yet. Set <code className="text-xs">PACK_PRO_EMAIL</code> and{" "}
          <code className="text-xs">PACK_PRO_PASSWORD</code> in Vercel env, then sync.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Learners", value: summary?.learner_count ?? 0 },
          { label: "Complete", value: summary?.complete_count ?? 0 },
          { label: "Incomplete", value: summary?.incomplete_count ?? 0 },
          { label: "Avg progress", value: `${summary?.average_percent ?? 0}%` }
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.14em] text-admin-muted">{card.label}</p>
            <p className="mt-1 font-display text-2xl text-admin-text tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {(summary?.course_completion ?? courses.map((course) => ({
          course_id: course.id,
          course_slug: course.slug,
          course_title: course.title,
          complete_count: 0,
          learner_count: 0,
          percent: 0
        }))).map((course) => (
          <div key={course.course_id} className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-admin-text">{course.course_title}</p>
              <span className="text-xs tabular-nums text-admin-muted">{course.percent}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-fitdog-orange" style={{ width: `${course.percent}%` }} />
            </div>
            <p className="mt-2 text-xs text-admin-muted">
              {course.complete_count}/{course.learner_count || summary?.learner_count || 0} employees complete
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["incomplete", "Incomplete"],
              ["complete", "Complete"],
              ["not_started", "Not started"],
              ["all", "All"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                status === value ? "bg-fitdog-orange text-black font-semibold" : "bg-white/5 text-admin-muted hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search name or email"
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-admin-text outline-none ring-fitdog-orange/40 placeholder:text-admin-muted focus:ring-2 md:w-64"
          />
          <p className="text-xs text-admin-muted">Last sync {formatWhen(data?.last_synced_at ?? null)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.12em] text-admin-muted">
              <tr>
                <SortableTh label="Employee" column="name" sortKey={sortBy} sortDir={sortDir} onToggle={(column) => toggleSort(column as typeof sortBy)} />
                <SortableTh label="Overall" column="overall" sortKey={sortBy} sortDir={sortDir} onToggle={(column) => toggleSort(column as typeof sortBy)} />
                {courses.map((course) => (
                  <th key={course.id} className="whitespace-nowrap px-3 py-3 font-medium">
                    {course.title}
                  </th>
                ))}
                <SortableTh label="Missing" column="incomplete" sortKey={sortBy} sortDir={sortDir} onToggle={(column) => toggleSort(column as typeof sortBy)} />
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <tr>
                  <td colSpan={3 + courses.length} className="px-4 py-10 text-center text-admin-muted">
                    Loading training progress…
                  </td>
                </tr>
              ) : null}
              {!loading && sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={3 + courses.length} className="px-4 py-10 text-center text-admin-muted">
                    {data?.last_synced_at
                      ? "No learners match this filter."
                      : "No Pack Pro data yet. Run Sync from Pack Pro to pull the facility report."}
                  </td>
                </tr>
              ) : null}
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="px-3 py-3 align-top">
                    <div className="font-medium text-admin-text">{row.name}</div>
                    <div className="text-xs text-admin-muted">{row.email}</div>
                    <div className="mt-1 text-[11px] text-admin-muted">
                      {row.completed_count}/{row.required_count} courses
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <ProgressCell percent={row.overall_percent} />
                  </td>
                  {courses.map((course) => {
                    const progress = row.courses.find((item) => item.course_id === course.id);
                    return (
                      <td key={course.id} className="px-3 py-3 align-top">
                        <ProgressCell percent={progress?.percent ?? 0} />
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 align-top text-xs text-admin-muted">
                    {row.is_complete ? (
                      <span className="rounded border border-emerald-400/30 bg-emerald-500/15 px-2 py-1 text-emerald-100">
                        Complete
                      </span>
                    ) : (
                      <span className="leading-relaxed text-rose-100/90">{row.incomplete_courses.join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-admin-text">Recent syncs</h3>
          <p className="text-xs text-admin-muted">Last alert {formatWhen(data?.last_alert_at ?? null)}</p>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-admin-muted">No sync history yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.slice(0, 6).map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0">
                <span className="text-admin-text">
                  {formatWhen(run.started_at)} · {run.trigger}
                  {run.actor ? ` · ${run.actor}` : ""}
                </span>
                <span className="text-xs text-admin-muted">
                  {run.status}
                  {run.status === "success"
                    ? ` · ${run.learner_count} learners · ${run.incomplete_count} incomplete`
                    : run.error
                      ? ` · ${run.error}`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
