"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Search, ShieldAlert } from "lucide-react";
import type { OpsCommandCenterSnapshot } from "@/lib/ops-command-center/snapshot";
import type { OpsWorkItem } from "@/lib/ops-command-center/adapters/staff-ops-feed";
import type { OpsDog } from "@/lib/ops-command-center/types";
import {
  availableActionsForKind,
  workItemActionLabel,
  type WorkItemAction
} from "@/lib/ops-command-center/work-item-actions";

type Mode = "my_shift" | "ops_command_center";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  attention: "bg-amber-400",
  informational: "bg-sky-400"
};

const ACTION_BUTTON_CLASS: Record<WorkItemAction, string> = {
  clear: "border-sky-400/30 text-sky-100 hover:bg-sky-500/10",
  hide: "border-slate-400/30 text-slate-100 hover:bg-slate-500/10",
  archive: "border-violet-400/30 text-violet-100 hover:bg-violet-500/10",
  in_progress: "border-amber-400/30 text-amber-100 hover:bg-amber-500/10",
  resolved: "border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/10",
  delete: "border-rose-400/30 text-rose-100 hover:bg-rose-500/10"
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
  const [dogHits, setDogHits] = useState<Array<OpsDog | BoardSearchHit>>([]);
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [dogProfile, setDogProfile] = useState<Record<string, unknown> | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    const boot = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 45_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/ops-command-center?q=${encodeURIComponent(term)}`, {
          cache: "no-store"
        });
        const body = await res.json();
        if (res.ok) {
          const opsDogs = (body.dogs || []) as OpsDog[];
          const boardDogs = (body.boardDogs || []) as BoardSearchHit[];
          setDogHits([...opsDogs, ...boardDogs]);
        }
      } catch {
        setDogHits([]);
      }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!selectedDogId || selectedDogId.startsWith("board:")) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/ops-command-center/dogs/${selectedDogId}`, { cache: "no-store" });
      const body = await res.json();
      if (!cancelled && res.ok) setDogProfile(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDogId]);

  const title = mode === "my_shift" ? "My Shift" : "Operations Command Center";
  const clock = formatNow();

  async function runWorkItemAction(itemId: string, workAction: WorkItemAction, itemTitle?: string | null) {
    setBusyItemId(itemId);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/ops-command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "work_item_action", itemId, workAction, title: itemTitle || null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Unable to update row");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to update row");
    } finally {
      setBusyItemId(null);
    }
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

  const liveEntries = Object.entries(data.liveCounts)
    .filter(([key]) => !["arriving", "leaving"].includes(key))
    .sort((a, b) => b[1] - a[1]);

  const openWork = data.openWork?.length ? data.openWork : data.myTasks.map(taskFallbackWorkItem);
  const alertFeed = data.alertFeed?.length
    ? data.alertFeed
    : data.notifications.map((note) => ({
        id: `notif:${note.id}`,
        kind: "ops_notification" as const,
        title: note.title,
        detail: note.body,
        priority: note.priority,
        statusLabel: note.acknowledgedAt ? "Acknowledged" : "Unread",
        dueAt: null,
        hrefTab: note.hrefTab,
        completable: false
      }));

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
        <SummaryCard
          label="Leaving now"
          value={data.shiftSummary.dogsCheckingOut}
          tone="orange"
          onClick={onNavigate ? () => onNavigate("front_desk_command") : undefined}
        />
        <SummaryCard
          label="Arriving now"
          value={data.shiftSummary.dogsArriving ?? data.boardCounts.checkingIn}
          tone="blue"
          onClick={onNavigate ? () => onNavigate("front_desk_command") : undefined}
        />
        <SummaryCard
          label="Open work"
          value={data.shiftSummary.openWork ?? data.shiftSummary.tasksDue}
          tone="amber"
          onClick={onNavigate ? () => onNavigate("active_issues") : undefined}
        />
        <SummaryCard
          label="Critical alerts"
          value={data.shiftSummary.criticalAlerts}
          tone="red"
          onClick={
            onNavigate
              ? () =>
                  onNavigate(
                    data.teamLeadView?.enabled
                      ? "active_issues"
                      : data.groomerView?.enabled
                        ? "crossover_communication"
                        : "fitdog_alerts"
                  )
              : undefined
          }
        />
        <SummaryCard
          label="Owner follow-ups"
          value={data.shiftSummary.ownerFollowUps}
          tone="green"
          onClick={onNavigate ? () => onNavigate("owner_follow_up") : undefined}
        />
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{actionError}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Needs attention</h3>
            <span className="text-xs text-admin-muted">{data.needsAttention.length} items</span>
          </div>
          {data.needsAttention.length ? (
            <ul className="space-y-2">
              {data.needsAttention.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-start"
                >
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${SEVERITY_DOT[item.severity] || "bg-slate-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    {item.detail ? <p className="mt-0.5 text-xs text-admin-muted">{item.detail}</p> : null}
                    {item.dogName ? <p className="mt-0.5 text-xs text-sky-200/80">{item.dogName}</p> : null}
                    <WorkItemActionButtons
                      itemId={item.id}
                      title={item.title}
                      actions={item.actions?.length ? item.actions : availableActionsForKind(item.kind || inferKind(item.id))}
                      busy={busyItemId === item.id}
                      onAction={runWorkItemAction}
                      onNavigate={item.hrefTab && onNavigate ? () => onNavigate(item.hrefTab!) : undefined}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              text={
                (data.teamLeadView?.enabled || data.groomerView?.enabled) && mode === "my_shift"
                  ? "Nothing assigned to you in Open Log or Active Issues."
                  : "Nothing urgent right now. Keep monitoring the floor."
              }
            />
          )}
        </section>

        {mode === "my_shift" && data.teamLeadView?.enabled ? (
          <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Previous team lead notes</h3>
              {onNavigate ? (
                <button type="button" className="text-xs text-sky-300 underline" onClick={() => onNavigate("crossover_communication")}>
                  Team Log
                </button>
              ) : null}
            </div>
            {data.teamLeadView.previousLeadName ? (
              <p className="mb-3 text-xs text-admin-muted">
                From {data.teamLeadView.previousLeadName} · Team Log
              </p>
            ) : null}
            {data.teamLeadView.shiftNotes.length ? (
              <ul className="space-y-2">
                {data.teamLeadView.shiftNotes.map((note) => (
                  <li key={note.id} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                    <p className="text-sm font-medium text-white">{note.title}</p>
                    {note.detail ? <p className="mt-0.5 text-xs text-admin-muted">{note.detail}</p> : null}
                    {note.dogName ? <p className="mt-0.5 text-xs text-sky-200/80">{note.dogName}</p> : null}
                    <p className="mt-1 text-[11px] text-admin-muted">
                      {formatDue(note.createdAt)}
                      {note.status ? ` · ${note.status}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState text="No previous Team Lead shift notes in the Team Log yet." />
            )}
          </section>
        ) : mode === "my_shift" && data.groomerView?.enabled ? (
          <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Today’s additional services</h3>
              <span className="text-xs text-admin-muted">{data.groomerView.additionalServices.length}</span>
            </div>
            <p className="mb-3 text-xs text-admin-muted">
              Gingr facility calendar{data.groomerView.serviceDate ? ` · ${data.groomerView.serviceDate}` : ""} · Walks, taxi, food, enrichment, and training add-ons excluded
            </p>
            {data.groomerView.additionalServices.length ? (
              <ul className="max-h-[28rem] space-y-2 overflow-auto pr-1">
                {data.groomerView.additionalServices.map((service) => (
                  <li key={service.id} className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                    <p className="text-sm font-medium text-white">{service.serviceName}</p>
                    {service.dogName ? <p className="mt-0.5 text-xs text-sky-200/80">{service.dogName}</p> : null}
                    {service.ownerName ? <p className="mt-0.5 text-xs text-admin-muted">{service.ownerName}</p> : null}
                    <p className="mt-1 text-[11px] text-admin-muted">
                      {service.scheduledAt ? formatDue(service.scheduledAt) : "Scheduled today"}
                      {service.reservationType ? ` · ${service.reservationType}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState text="No additional services on today’s Gingr facility calendar (walks, taxi, food, enrichment, and training add-ons excluded)." />
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Live board right now</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <CountChip label="Arriving" value={data.boardCounts.checkingIn} />
              <CountChip label="Leaving" value={data.boardCounts.checkingOut} />
              <CountChip label="On floor" value={data.shiftSummary.dogsOnFloor ?? data.shiftSummary.dogsOnsite} />
              {mode === "ops_command_center"
                ? liveEntries.slice(0, 5).map(([status, count]) => (
                    <CountChip key={status} label={status.replace(/_/g, " ")} value={count} />
                  ))
                : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <LaneList
                title="Arriving"
                dogs={data.boardLanes?.arriving || []}
                empty="No dogs in the arrival basket."
              />
              <LaneList
                title="Leaving"
                dogs={data.boardLanes?.leaving || []}
                empty="No dogs waiting for pickup."
              />
            </div>
          </section>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Open work queue</h3>
            <span className="text-xs text-admin-muted">{openWork.length}</span>
          </div>
          {openWork.length ? (
            <ul className="space-y-2">
              {openWork.slice(0, 12).map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{item.title}</p>
                    <p className="text-xs text-admin-muted">
                      {kindLabel(item.kind)} · {item.priority}
                      {item.dueAt ? ` · due ${formatDue(item.dueAt)}` : ""}
                    </p>
                  </div>
                  <WorkItemActionButtons
                    itemId={item.id}
                    title={item.title}
                    actions={availableActionsForKind(item.kind)}
                    busy={busyItemId === item.id}
                    onAction={runWorkItemAction}
                    onNavigate={item.hrefTab && onNavigate ? () => onNavigate(item.hrefTab!) : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No open follow-ups, issues, or Command Center tasks right now." />
          )}
        </section>

        <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Alerts feed</h3>
            <span className="text-xs text-admin-muted">{alertFeed.length}</span>
          </div>
          {alertFeed.length ? (
            <ul className="space-y-2">
              {alertFeed.slice(0, 10).map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white">{item.title}</p>
                    {item.detail ? <p className="mt-0.5 text-xs text-admin-muted">{item.detail}</p> : null}
                  </div>
                  <WorkItemActionButtons
                    itemId={item.id}
                    title={item.title}
                    actions={availableActionsForKind(item.kind)}
                    busy={busyItemId === item.id}
                    onAction={runWorkItemAction}
                    onNavigate={item.hrefTab && onNavigate ? () => onNavigate(item.hrefTab!) : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState text="No payment alerts or Command Center notifications right now." />
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-white">Find a dog</h3>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted" />
            <input
              className="admin-input w-full pl-9"
              placeholder="Search dog, owner, or Gingr animal ID"
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                setQuery(next);
                if (!next.trim()) {
                  setDogHits([]);
                  setSelectedDogId(null);
                  setDogProfile(null);
                }
              }}
            />
          </label>
        </div>
        {dogHits.length ? (
          <ul className="mb-3 grid gap-2 sm:grid-cols-2">
            {dogHits.map((dog) => {
              const id = "id" in dog ? dog.id : "";
              const name = "name" in dog ? dog.name : "";
              const owner = "ownerName" in dog ? dog.ownerName : null;
              const isBoard = id.startsWith("board:");
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-sky-400/40"
                    onClick={() => {
                      if (isBoard) {
                        setSelectedDogId(null);
                        setDogProfile(null);
                        onNavigate?.("front_desk_command");
                        return;
                      }
                      setDogProfile(null);
                      setSelectedDogId(id);
                    }}
                  >
                    <p className="text-sm font-medium text-white">{name}</p>
                    <p className="text-xs text-admin-muted">
                      {owner || "Owner unknown"}
                      {isBoard ? " · Live board" : ""}
                      {"gingrAnimalId" in dog && dog.gingrAnimalId ? ` · Gingr #${dog.gingrAnimalId}` : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : query.trim() ? (
          <p className="mb-3 text-xs text-admin-muted">No dog matches on ops profiles or the live board.</p>
        ) : null}

        {selectedDogId && !selectedDogId.startsWith("board:") && dogProfile ? (
          <DogProfileCard profile={dogProfile} />
        ) : (
          <p className="text-xs text-admin-muted">
            Search pulls RuffOps dog profiles and live Gingr board rows. Open Gingr for reservations, packages, and
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

type BoardSearchHit = {
  id: string;
  name: string;
  ownerName: string | null;
  room?: string | null;
  gingrAnimalId?: string | null;
  displayStatus?: string | null;
};

function inferKind(id: string): OpsWorkItem["kind"] {
  if (id.startsWith("task:")) return "ops_task";
  if (id.startsWith("followup:")) return "owner_follow_up";
  if (id.startsWith("issue:")) return "active_issue";
  if (id.startsWith("payment:")) return "payment_alert";
  if (id.startsWith("openlog:")) return "open_log";
  return "ops_notification";
}

function WorkItemActionButtons({
  itemId,
  title,
  actions,
  busy,
  onAction,
  onNavigate
}: {
  itemId: string;
  title?: string | null;
  actions: WorkItemAction[];
  busy?: boolean;
  onAction: (itemId: string, action: WorkItemAction, title?: string | null) => Promise<void>;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {onNavigate ? (
        <button type="button" className="text-xs text-sky-300 underline" onClick={onNavigate} disabled={busy}>
          Open
        </button>
      ) : null}
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={busy}
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${ACTION_BUTTON_CLASS[action]}`}
          onClick={() => void onAction(itemId, action, title)}
        >
          {busy ? "…" : workItemActionLabel(action)}
        </button>
      ))}
    </div>
  );
}

function taskFallbackWorkItem(task: {
  id: string;
  title: string;
  notes: string | null;
  priority: OpsWorkItem["priority"];
  status: string;
  dueAt: string | null;
}): OpsWorkItem {
  return {
    id: `task:${task.id}`,
    kind: "ops_task",
    title: task.title,
    detail: task.notes,
    priority: task.priority,
    statusLabel: task.status.replace(/_/g, " "),
    dueAt: task.dueAt,
    hrefTab: "my_shift",
    completable: task.status !== "completed" && task.status !== "cancelled",
    taskId: task.id
  };
}

function kindLabel(kind: OpsWorkItem["kind"]) {
  switch (kind) {
    case "owner_follow_up":
      return "Follow-up";
    case "active_issue":
      return "Issue";
    case "payment_alert":
      return "Payment";
    case "ops_notification":
      return "Notice";
    case "open_log":
      return "Open log";
    default:
      return "Task";
  }
}

function formatDue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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
  tone,
  onClick
}: {
  label: string;
  value: number;
  tone: "red" | "orange" | "amber" | "blue" | "green";
  onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    red: "border-red-400/30 bg-red-500/10",
    orange: "border-orange-400/30 bg-orange-500/10",
    amber: "border-amber-400/30 bg-amber-500/10",
    blue: "border-sky-400/30 bg-sky-500/10",
    green: "border-emerald-400/30 bg-emerald-500/10"
  };
  const className = `rounded-2xl border px-3 py-3 text-left ${tones[tone]} ${onClick ? "cursor-pointer transition hover:brightness-110" : ""}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <p className="text-xs text-admin-muted">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      </button>
    );
  }
  return (
    <div className={className}>
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

function LaneList({
  title,
  dogs,
  empty
}: {
  title: string;
  dogs: Array<{ id: string; name: string; ownerName: string | null; room: string | null }>;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-admin-muted">{title}</p>
      {dogs.length ? (
        <ul className="space-y-1.5">
          {dogs.slice(0, 6).map((dog) => (
            <li key={dog.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <p className="truncate text-sm text-white">{dog.name}</p>
              <p className="truncate text-[11px] text-admin-muted">
                {dog.ownerName || "Owner unknown"}
                {dog.room ? ` · ${dog.room}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-admin-muted">{empty}</p>
      )}
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
