"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { OpsCommandCenterSnapshot } from "@/lib/ops-command-center/snapshot";
import type { OpsDog } from "@/lib/ops-command-center/types";

type Mode = "my_shift" | "ops_command_center";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  attention: "bg-amber-400",
  informational: "bg-sky-400"
};

function formatNow() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

export function OpsCommandCenterPanel({
  mode,
  onNavigate
}: {
  mode: Mode;
  onNavigate?: (tab: string) => void;
}) {
  const [data, setData] = useState<OpsCommandCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dogHits, setDogHits] = useState<OpsDog[]>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [dogProfile, setDogProfile] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ops-command-center", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load command center");
      setData(body as OpsCommandCenterSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!query.trim()) {
      setDogHits([]);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/ops-command-center?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store"
        });
        const body = await res.json();
        if (res.ok) setDogHits((body.dogs || []) as OpsDog[]);
      } catch {
        setDogHits([]);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!selectedDogId) {
      setDogProfile(null);
      return;
    }
    void (async () => {
      const res = await fetch(`/api/admin/ops-command-center/dogs/${selectedDogId}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setDogProfile(body);
    })();
  }, [selectedDogId]);

  const title = mode === "my_shift" ? "My Shift" : "Operations Command Center";
  const clock = useMemo(() => formatNow(), [data?.generatedAt]);

  async function completeTask(taskId: string) {
    await fetch("/api/admin/ops-command-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_task_status", taskId, status: "completed" })
    });
    await load();
  }

  async function acknowledge(notificationId: string) {
    await fetch("/api/admin/ops-command-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge_notification", notificationId })
    });
    await load();
  }

  if (loading && !data) {
    return (
      <section className="space-y-4 p-1">
        <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-medium">{error}</p>
        <button type="button" className="admin-btn-secondary mt-3" onClick={() => void load()}>
          Retry
        </button>
      </section>
    );
  }

  if (!data) return null;

  const liveEntries = Object.entries(data.liveCounts).sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border border-admin-border bg-gradient-to-br from-[#132033] via-[#101826] to-[#0b1220] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-admin-muted">{title}</p>
          <h2 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            Good {greetingBucket()}, {data.greetingName}
          </h2>
          <p className="mt-1 text-sm text-admin-muted">
            {clock} · {data.roleLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              data.gingrHealth.status === "healthy"
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : data.gingrHealth.status === "degraded"
                  ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                  : "border-red-400/40 bg-red-500/10 text-red-100"
            }`}
            title={data.gingrHealth.detail || undefined}
          >
            {data.gingrHealth.label}
          </span>
          <button type="button" className="admin-btn-secondary" onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {data.gingrHealth.status !== "healthy" ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {data.gingrHealth.detail ||
              "Gingr-dependent information may be stale. Gingr remains the business system of record."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Dogs checking out" value={data.shiftSummary.dogsCheckingOut} tone="orange" />
        <SummaryCard label="Tasks due" value={data.shiftSummary.tasksDue} tone="amber" />
        <SummaryCard label="Critical alerts" value={data.shiftSummary.criticalAlerts} tone="red" />
        <SummaryCard label="Owner follow-ups" value={data.shiftSummary.ownerFollowUps} tone="blue" />
        <SummaryCard label="Dogs onsite (ops)" value={data.shiftSummary.dogsOnsite} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Needs Attention</h3>
            <span className="text-xs text-admin-muted">{data.needsAttention.length} items</span>
          </div>
          {data.needsAttention.length ? (
            <ul className="space-y-2">
              {data.needsAttention.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] || "bg-slate-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    {item.detail ? <p className="mt-0.5 text-xs text-admin-muted">{item.detail}</p> : null}
                  </div>
                  {item.hrefTab && onNavigate ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-sky-300 underline"
                      onClick={() => onNavigate(item.hrefTab!)}
                    >
                      Open
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="Nothing urgent right now. Keep monitoring the floor." />
          )}
        </section>

        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">
            {mode === "ops_command_center" ? "Live operating state" : "Board right now"}
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <CountChip label="Arriving" value={data.boardCounts.checkingIn} />
            <CountChip label="Leaving" value={data.boardCounts.checkingOut} />
            {mode === "ops_command_center"
              ? liveEntries.slice(0, 8).map(([status, count]) => (
                  <CountChip key={status} label={status.replace(/_/g, " ")} value={count} />
                ))
              : null}
          </div>
          {mode === "ops_command_center" && !liveEntries.length ? (
            <p className="mt-3 text-xs text-admin-muted">
              Shared ops status fills in as Gingr board events sync into the Command Center foundation.
            </p>
          ) : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">My Tasks</h3>
          {data.myTasks.length ? (
            <ul className="space-y-2">
              {data.myTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{task.title}</p>
                    <p className="text-xs text-admin-muted">
                      {task.priority} · {task.status.replace(/_/g, " ")}
                      {task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleTimeString()}` : ""}
                    </p>
                  </div>
                  {task.status !== "completed" && task.status !== "cancelled" ? (
                    <button
                      type="button"
                      className="admin-btn-secondary shrink-0 px-2 py-1 text-xs"
                      onClick={() => void completeTask(task.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Done
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No open Command Center tasks assigned to you." />
          )}
        </section>

        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Alerts & notifications</h3>
          {data.notifications.length ? (
            <ul className="space-y-2">
              {data.notifications.slice(0, 8).map((note) => (
                <li
                  key={note.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">{note.title}</p>
                    {note.body ? <p className="mt-0.5 text-xs text-admin-muted">{note.body}</p> : null}
                  </div>
                  {!note.acknowledgedAt ? (
                    <button
                      type="button"
                      className="admin-btn-secondary shrink-0 px-2 py-1 text-xs"
                      onClick={() => void acknowledge(note.id)}
                    >
                      Ack
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-300">Ack’d</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No Command Center notifications yet." />
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-white">Find a dog (RuffOps ops profile)</h3>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input
              className="admin-input w-full pl-9"
              placeholder="Search dog, owner, or Gingr animal ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {dogHits.length ? (
          <ul className="mb-3 grid gap-2 sm:grid-cols-2">
            {dogHits.map((dog) => (
              <li key={dog.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-sky-400/40"
                  onClick={() => setSelectedDogId(dog.id)}
                >
                  <p className="text-sm font-medium text-white">{dog.name}</p>
                  <p className="text-xs text-admin-muted">
                    {dog.ownerName || "Owner unknown"}
                    {dog.gingrAnimalId ? ` · Gingr #${dog.gingrAnimalId}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : query.trim() ? (
          <p className="mb-3 text-xs text-admin-muted">No ops dog matches yet. Profiles appear as board events sync.</p>
        ) : null}

        {dogProfile ? (
          <DogProfileCard profile={dogProfile} />
        ) : (
          <p className="text-xs text-admin-muted">
            This is the RuffOps operational view — not a Gingr replacement. Open Gingr for reservations, packages, and
            billing.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Role tools</h3>
        <div className="flex flex-wrap gap-2">
          {data.tools.map((tool) => (
            <button
              key={tool.tab}
              type="button"
              className="admin-btn-secondary"
              onClick={() => onNavigate?.(tool.tab)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">Recent operational events</h3>
        {data.recentEvents.length ? (
          <ul className="space-y-2">
            {data.recentEvents.slice(0, 12).map((event) => (
              <li key={event.id} className="border-b border-white/5 pb-2 text-sm last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-white">{event.title}</p>
                  <time className="text-xs text-admin-muted">
                    {new Date(event.occurredAt).toLocaleTimeString()}
                  </time>
                </div>
                <p className="text-xs text-admin-muted">
                  {event.category.replace(/_/g, " ")} · {event.sourceModule}
                  {event.actorName ? ` · ${event.actorName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState text="Timeline events will appear here as staff workflows and Gingr board updates sync." />
        )}
      </section>
    </section>
  );
}

function greetingBucket() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hour12: false }).format(
      new Date()
    )
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function SummaryCard({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "red" | "orange" | "amber" | "blue" | "green";
}) {
  const tones: Record<string, string> = {
    red: "border-red-400/30 bg-red-500/10",
    orange: "border-orange-400/30 bg-orange-500/10",
    amber: "border-amber-400/30 bg-amber-500/10",
    blue: "border-sky-400/30 bg-sky-500/10",
    green: "border-emerald-400/30 bg-emerald-500/10"
  };
  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs text-admin-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-admin-muted">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-admin-muted">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
      <p>{text}</p>
    </div>
  );
}

function DogProfileCard({ profile }: { profile: Record<string, unknown> }) {
  const dog = profile.dog as OpsDog;
  const status = profile.status as { status?: string; locationLabel?: string | null } | null;
  const timeline = (profile.timeline as Array<{ id: string; title: string; occurredAt: string; actorName?: string | null }>) || [];
  const gingrLink = (profile.gingrLink as string | null) || dog.gingrProfileUrl;

  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-500/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{dog.name}</p>
          <p className="text-sm text-admin-muted">
            {dog.ownerName || "Owner unknown"}
            {status?.status ? ` · ${status.status.replace(/_/g, " ")}` : ""}
            {status?.locationLabel ? ` · ${status.locationLabel}` : ""}
          </p>
          {dog.gingrSyncStale ? (
            <p className="mt-1 text-xs text-amber-200">Gingr sync may be stale for this dog.</p>
          ) : null}
        </div>
        {gingrLink ? (
          <a href={gingrLink} className="admin-btn-primary text-xs">
            Open in Gingr
          </a>
        ) : null}
      </div>
      <div className="mt-3 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Timeline</p>
        {timeline.length ? (
          timeline.slice(0, 8).map((event) => (
            <div key={event.id} className="text-sm text-white/90">
              <span className="text-admin-muted">{new Date(event.occurredAt).toLocaleTimeString()} — </span>
              {event.title}
              {event.actorName ? <span className="text-admin-muted"> — {event.actorName}</span> : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-admin-muted">No timeline events yet.</p>
        )}
      </div>
    </div>
  );
}
