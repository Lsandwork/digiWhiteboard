"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, ExternalLink, RefreshCw } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import type {
  RuffopsChecklistBucket,
  RuffopsChecklistCompletedSource,
  RuffopsChecklistItem,
  RuffopsChecklistSource,
  RuffopsChecklistState
} from "@/lib/ruffops-checklist/types";

const POLL_MS = 8000;

const SOURCE_LABEL: Record<RuffopsChecklistSource, string> = {
  gingr: "Gingr",
  reminder: "Reminder",
  walks: "Walks",
  alert: "Alert"
};

const BUCKET_LABEL: Record<RuffopsChecklistBucket, string> = {
  overdue: "Overdue",
  due: "Due now",
  upcoming: "Upcoming today",
  completed: "Completed"
};

function formatDateTime(value: string | null) {
  if (!value) return "Not completed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not completed";
  return date.toLocaleString();
}

function formatSync(iso: string | null) {
  if (!iso) return "No Gingr snapshot yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No Gingr snapshot yet";
  return `Gingr snapshot ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function RuffopsChecklistPanel() {
  const { showToast } = useToast();
  const [state, setState] = useState<RuffopsChecklistState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | RuffopsChecklistBucket>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | RuffopsChecklistSource>("all");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/admin/ruffops-checklist", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to load RuffOps Checklist.");
      setState(body as RuffopsChecklistState);
    } catch (error) {
      if (!quiet) {
        showToast(error instanceof Error ? error.message : "Unable to load RuffOps Checklist.", "error");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleItems = useMemo(() => {
    const items = state?.items ?? [];
    return items.filter((item) => {
      if (filter !== "all" && item.bucket !== filter) return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      return true;
    });
  }, [filter, sourceFilter, state?.items]);

  const grouped = useMemo(() => {
    const buckets: Record<RuffopsChecklistBucket, RuffopsChecklistItem[]> = {
      overdue: [],
      due: [],
      upcoming: [],
      completed: []
    };
    for (const item of visibleItems) buckets[item.bucket].push(item);
    return buckets;
  }, [visibleItems]);

  async function toggle(item: RuffopsChecklistItem) {
    if (!item.canToggle || savingKey) return;
    const nextCompleted = !item.completed;
    setSavingKey(item.key);
    setState((current) => {
      if (!current) return current;
      const items = current.items.map((row) => {
        if (row.key !== item.key) return row;
        const completedAt = nextCompleted ? new Date().toISOString() : null;
        const completedSource: RuffopsChecklistCompletedSource = nextCompleted ? "ruffops" : null;
        const bucket: RuffopsChecklistBucket = nextCompleted
          ? "completed"
          : row.dueAt && new Date(row.dueAt).getTime() < Date.now() - 15 * 60 * 1000
            ? "overdue"
            : "due";
        return {
          ...row,
          completed: nextCompleted,
          completedAt,
          completedByName: nextCompleted ? "You" : null,
          completedSource,
          bucket
        };
      });
      return { ...current, items };
    });
    try {
      const response = await fetch("/api/admin/ruffops-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_key: item.key, completed: nextCompleted })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update checklist.");
      setState(body as RuffopsChecklistState);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update checklist.", "error");
      await load(true);
    } finally {
      setSavingKey(null);
    }
  }

  const summary = state?.summary;

  return (
    <section className="crossover-card p-5">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-admin-ink">
            <CheckSquare className="h-5 w-5 text-fitdog-orange" />
            RuffOps Checklist
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-admin-muted">
            One shared list for Team Leads, Managers, and Admins. Checking a box stamps your name and time for everyone.
            Gingr remains the system of record for medications and additional services — RuffOps is the final reminder while you work in both.
          </p>
          <p className="mt-2 text-xs text-admin-muted">
            {state?.shiftDate ? `Shift ${state.shiftDate}` : "Today"}
            {state?.gingrSync ? ` · ${formatSync(state.gingrSync.lastSuccessfulSyncAt)}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-admin-border px-3 py-1.5 text-sm text-admin-ink hover:bg-admin-hover"
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["overdue", "due", "upcoming", "completed"] as const).map((bucket) => (
            <button
              key={bucket}
              type="button"
              onClick={() => setFilter((current) => (current === bucket ? "all" : bucket))}
              className={`rounded-xl border px-3 py-2 text-left ${
                filter === bucket ? "border-fitdog-orange bg-fitdog-orange/10" : "border-admin-border"
              }`}
            >
              <span className="block text-xs text-admin-muted">{BUCKET_LABEL[bucket]}</span>
              <span className="text-lg font-semibold text-admin-ink">{summary[bucket]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "gingr", "reminder", "walks", "alert"] as const).map((source) => (
          <button
            key={source}
            type="button"
            onClick={() => setSourceFilter(source)}
            className={`rounded-full border px-3 py-1 text-xs ${
              sourceFilter === source
                ? "border-fitdog-orange bg-fitdog-orange/10 text-admin-ink"
                : "border-admin-border text-admin-muted"
            }`}
          >
            {source === "all" ? "All sources" : SOURCE_LABEL[source]}
          </button>
        ))}
      </div>

      {loading && !state ? (
        <p className="text-sm text-admin-muted">Loading today&apos;s shared checklist…</p>
      ) : visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-admin-border p-4 text-sm text-admin-muted">
          Nothing on this filter. Yard reminders, walks, Gingr meds/services, and live alerts appear here as they come due.
        </p>
      ) : (
        <div className="space-y-6">
          {(["overdue", "due", "upcoming", "completed"] as const).map((bucket) => {
            const rows = grouped[bucket];
            if (!rows.length) return null;
            return (
              <div key={bucket}>
                <h3 className="mb-2 text-sm font-semibold text-admin-ink">
                  {BUCKET_LABEL[bucket]}
                  <span className="ml-2 text-xs font-normal text-admin-muted">{rows.length}</span>
                </h3>
                <div className="grid gap-2">
                  {rows.map((item) => (
                    <label
                      key={item.key}
                      className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${
                        item.bucket === "overdue"
                          ? "border-red-400/50 bg-red-50/60"
                          : item.completed
                            ? "border-admin-border bg-admin-hover/40"
                            : "border-fitdog-orange/40 bg-fitdog-orange/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={item.completed}
                        disabled={!item.canToggle || savingKey === item.key}
                        onChange={() => void toggle(item)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={`font-medium ${item.completed ? "text-admin-muted line-through" : "text-admin-ink"}`}>
                            {item.title}
                          </span>
                          <span className="rounded-full border border-admin-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-admin-muted">
                            {SOURCE_LABEL[item.source]}
                          </span>
                          {item.lodgingLabel ? (
                            <span className="text-[11px] text-admin-muted">{item.lodgingLabel}</span>
                          ) : null}
                        </span>
                        {item.detail ? <span className="mt-1 block text-admin-muted">{item.detail}</span> : null}
                        <span className="mt-1 block text-xs text-admin-muted">
                          {item.dueLabel ? `${item.dueLabel} · ` : ""}
                          {item.completed
                            ? `${formatDateTime(item.completedAt)}${item.completedByName ? ` · ${item.completedByName}` : ""}${
                                item.completedSource === "gingr" ? " · Gingr" : item.completedSource === "walks" ? " · Walks Board" : ""
                              }`
                            : "Not completed"}
                        </span>
                        {item.actionHint ? <span className="mt-1 block text-xs text-admin-muted">{item.actionHint}</span> : null}
                        {item.gingrUrl ? (
                          <a
                            href={item.gingrUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-fitdog-orange hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Open in Gingr
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
