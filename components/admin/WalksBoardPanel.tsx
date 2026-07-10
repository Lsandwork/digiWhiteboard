"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  ChevronDown,
  ChevronUp,
  Clock3,
  Footprints,
  PauseCircle,
  Plus,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";
import { Modal } from "@/components/admin/ui/Modal";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { WALK_BOARD_TYPE_LABELS } from "@/lib/walks-board/constants";
import {
  formatWalkBoardClock,
  formatWalkBoardCountdown,
  formatWalkBoardDateTime,
  getWalkBoardUrgency,
  walkBoardTypeLabel
} from "@/lib/walks-board/display";
import type { WalkBoardEntryView, WalkBoardPermissions, WalkBoardSummary, WalkBoardType } from "@/lib/walks-board/types";

type WalkBoardPayload = {
  entries: WalkBoardEntryView[];
  summary: WalkBoardSummary;
  permissions: WalkBoardPermissions;
  serverTime: string;
  timezone: string;
};

type FilterKey = "all" | "due_now" | WalkBoardType;

const TYPE_ICONS: Record<WalkBoardType, typeof PauseCircle> = {
  no_plays: PauseCircle,
  groomed: Sparkles,
  break_dog: Footprints
};

function displayUserName(user: { full_name?: string | null; display_name?: string | null; email?: string | null } | null | undefined) {
  return user?.display_name ?? user?.full_name ?? user?.email ?? "Staff";
}

function urgencyClass(urgency: ReturnType<typeof getWalkBoardUrgency>) {
  switch (urgency) {
    case "overdue":
      return "walks-board-card--overdue";
    case "walk_due":
      return "walks-board-card--due";
    case "due_soon":
      return "walks-board-card--soon";
    case "snoozed":
      return "walks-board-card--snoozed";
    default:
      return "walks-board-card--on-track";
  }
}

type WalkBoardActivityItem = Array<{
  id: string;
  action: string;
  occurred_at: string;
  actor_user: { display_name?: string | null; email?: string | null } | null;
  previous_due_at: string | null;
  new_due_at: string | null;
}>;

export function WalksBoardPanel() {
  const { showToast } = useToast();
  const [data, setData] = useState<WalkBoardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [dogName, setDogName] = useState("");
  const [walkType, setWalkType] = useState<WalkBoardType>("no_plays");
  const [duplicate, setDuplicate] = useState<WalkBoardEntryView | null>(null);
  const [clearTarget, setClearTarget] = useState<WalkBoardEntryView | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, WalkBoardActivityItem>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [hasLoaded, setHasLoaded] = useState(false);

  async function fetchActivity(entryId: string): Promise<WalkBoardActivityItem> {
    const response = await fetch(`/api/admin/walks-board?entryId=${encodeURIComponent(entryId)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to load activity.");
    return body.activity as WalkBoardActivityItem;
  }

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) setLoading(!hasLoaded);
    try {
      const response = await fetch("/api/admin/walks-board", { cache: "no-store" });
      const body = (await response.json()) as WalkBoardPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Unable to load Walks Board.");
      setData(body);
      setHasLoaded(true);
      setReconnecting(false);
    } catch (error) {
      if (!hasLoaded) {
        showToast(error instanceof Error ? error.message : "Unable to load Walks Board.", "error");
      } else {
        setReconnecting(true);
      }
    } finally {
      setLoading(false);
    }
  }, [hasLoaded, showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    const channel = supabase
      .channel(`walk-board-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "walk_board_entries" }, () => {
        void load({ silent: true });
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") setReconnecting(true);
        if (status === "SUBSCRIBED") setReconnecting(false);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredEntries = useMemo(() => {
    const entries = data?.entries ?? [];
    const query = search.trim().toLocaleLowerCase("en-US");
    return entries.filter((entry) => {
      if (query && !entry.dog_name.toLocaleLowerCase("en-US").includes(query)) return false;
      if (filter === "all") return true;
      if (filter === "due_now") {
        const urgency = getWalkBoardUrgency(entry, nowMs);
        return urgency === "walk_due" || urgency === "overdue";
      }
      return entry.walk_type === filter;
    });
  }, [data?.entries, filter, nowMs, search]);

  const filterCounts = useMemo(() => {
    const entries = data?.entries ?? [];
    return {
      all: entries.length,
      due_now: entries.filter((entry) => {
        const urgency = getWalkBoardUrgency(entry, nowMs);
        return urgency === "walk_due" || urgency === "overdue";
      }).length,
      no_plays: entries.filter((entry) => entry.walk_type === "no_plays").length,
      groomed: entries.filter((entry) => entry.walk_type === "groomed").length,
      break_dog: entries.filter((entry) => entry.walk_type === "break_dog").length
    };
  }, [data?.entries, nowMs]);

  async function postAction(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/walks-board", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 409 && payload.duplicate) {
        setDuplicate(payload.duplicate as WalkBoardEntryView);
      }
      throw new Error(payload.error ?? "Walks Board action failed.");
    }
    return payload;
  }

  async function handleAdd(forceDuplicate = false) {
    setBusyId("add");
    try {
      const payload = await postAction({
        action: "add",
        dogName,
        walkType,
        forceDuplicate
      });
      const entry = payload.entry as WalkBoardEntryView;
      setAddOpen(false);
      setDogName("");
      setDuplicate(null);
      showToast(`${entry.dog_name} was added. First walk due at ${formatWalkBoardClock(entry.next_due_at, data?.timezone)}.`, "success");
      await load({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to add dog.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkWalked(entry: WalkBoardEntryView) {
    setBusyId(entry.id);
    try {
      const payload = await postAction({ action: "mark_walked", entryId: entry.id, version: entry.version });
      const updated = payload.entry as WalkBoardEntryView;
      showToast(
        `${updated.dog_name} marked walked at ${formatWalkBoardClock(updated.last_walked_at ?? new Date().toISOString(), data?.timezone)}.`,
        "success"
      );
      await load({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to mark walked.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSnooze(entry: WalkBoardEntryView) {
    setBusyId(entry.id);
    try {
      await postAction({ action: "snooze", entryId: entry.id, version: entry.version });
      showToast(`${entry.dog_name} snoozed for one hour.`, "success");
      await load({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to snooze.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleClear() {
    if (!clearTarget) return;
    setBusyId(clearTarget.id);
    try {
      await postAction({ action: "clear", entryId: clearTarget.id, version: clearTarget.version });
      showToast(`${clearTarget.dog_name} cleared from the Walks Board.`, "success");
      setClearTarget(null);
      await load({ silent: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to clear dog.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHistory(entryId: string) {
    if (expandedHistory === entryId) {
      setExpandedHistory(null);
      return;
    }
    setExpandedHistory(entryId);
    if (!history[entryId]) {
      try {
        const activity = await fetchActivity(entryId);
        setHistory((current) => ({ ...current, [entryId]: activity }));
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load history.", "error");
      }
    }
  }

  const summary = data?.summary;
  const permissions = data?.permissions;

  return (
    <section className="walks-board-page">
      <header className="walks-board-header admin-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="walks-board-header__icon" aria-hidden="true">
                <Footprints className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white sm:text-3xl">Walks Board</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400 sm:text-base">
                  Track recurring walks for No Plays, Groomed Dogs, and Break Dogs.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {reconnecting ? <span className="admin-badge admin-badge--amber">Reconnecting…</span> : null}
            <button type="button" className="crossover-btn crossover-btn--primary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Dog
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Active Dogs</span>
            <strong>{summary?.activeCount ?? 0}</strong>
          </div>
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Due Now</span>
            <strong>{summary?.dueNowCount ?? 0}</strong>
          </div>
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Overdue</span>
            <strong>{summary?.overdueCount ?? 0}</strong>
          </div>
          <div className="walks-board-stat">
            <span className="walks-board-stat__label">Next Walk</span>
            <strong>{summary?.nextDueAt ? formatWalkBoardClock(summary.nextDueAt, data?.timezone) : "—"}</strong>
          </div>
        </div>
      </header>

      <div className="walks-board-toolbar admin-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All Active"],
                ["due_now", "Due Now"],
                ["no_plays", "No Plays"],
                ["groomed", "Groomed Dogs"],
                ["break_dog", "Break Dogs"]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`walks-board-filter ${filter === key ? "walks-board-filter--active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
                <span>{filterCounts[key]}</span>
              </button>
            ))}
          </div>
          <label className="walks-board-search">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by dog name"
              aria-label="Search by dog name"
            />
          </label>
        </div>
      </div>

      {loading && !hasLoaded ? (
        <div className="admin-card p-8 text-center text-slate-400">Loading Walks Board…</div>
      ) : filteredEntries.length === 0 ? (
        <div className="walks-board-empty admin-card p-8 sm:p-10">
          <Footprints className="mx-auto h-10 w-10 text-fitdog-orange/80" aria-hidden="true" />
          <h2 className="mt-4 text-2xl font-black text-white">No dogs currently need tracked walks.</h2>
          <p className="mt-2 text-slate-400">Add a No Plays, Groomed, or Break Dog to begin hourly walk reminders.</p>
          <button type="button" className="crossover-btn crossover-btn--primary mt-6" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Dog
          </button>
        </div>
      ) : (
        <div className="walks-board-list">
          {filteredEntries.map((entry) => {
            const urgency = getWalkBoardUrgency(entry, nowMs);
            const TypeIcon = TYPE_ICONS[entry.walk_type];
            const historyOpen = expandedHistory === entry.id;
            const entryHistory = history[entry.id] ?? [];
            const isBusy = busyId === entry.id;

            return (
              <article key={entry.id} className={`walks-board-card admin-card ${urgencyClass(urgency)}`}>
                <div className="walks-board-card__grid">
                  <div className="walks-board-card__main">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="walks-board-card__name">{entry.dog_name}</h2>
                      <span className="walks-board-type-badge">
                        <TypeIcon className="h-4 w-4" aria-hidden="true" />
                        {walkBoardTypeLabel(entry.walk_type)}
                      </span>
                      {entry.snooze_used ? <span className="admin-badge admin-badge--amber">Snooze Used</span> : null}
                    </div>

                    <p className="walks-board-card__status">{formatWalkBoardCountdown(entry, nowMs)}</p>
                    <p className="walks-board-card__meta">
                      Next due {formatWalkBoardDateTime(entry.next_due_at, data?.timezone)}
                      {entry.last_walked_at
                        ? ` · Walked ${formatWalkBoardDateTime(entry.last_walked_at, data?.timezone)} by ${displayUserName(entry.last_walked_by_user)}`
                        : ""}
                    </p>
                    <p className="walks-board-card__meta">
                      Added {formatWalkBoardDateTime(entry.created_at, data?.timezone)} by {displayUserName(entry.created_by_user)}
                    </p>
                  </div>

                  <div className="walks-board-card__actions">
                    <button
                      type="button"
                      className="crossover-btn crossover-btn--primary"
                      disabled={isBusy}
                      onClick={() => void handleMarkWalked(entry)}
                    >
                      <Footprints className="h-4 w-4" />
                      Mark Walked
                    </button>
                    {permissions?.canSnooze ? (
                      <button
                        type="button"
                        className="crossover-btn crossover-btn--outline"
                        disabled={isBusy || entry.snooze_used}
                        onClick={() => void handleSnooze(entry)}
                      >
                        <AlarmClock className="h-4 w-4" />
                        {entry.snooze_used ? "Snooze Used" : "Snooze 1 Hour"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="crossover-btn crossover-btn--ghost"
                      disabled={isBusy}
                      onClick={() => setClearTarget(entry)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="walks-board-history-toggle"
                  aria-expanded={historyOpen}
                  onClick={() => void toggleHistory(entry.id)}
                >
                  Activity history
                  {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {historyOpen ? (
                  <ol className="walks-board-history">
                    {entryHistory.length ? (
                      entryHistory.map((item) => (
                        <li key={item.id}>
                          <Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <div>
                            <strong>{item.action.replaceAll("_", " ")}</strong>
                            <span>
                              {formatWalkBoardDateTime(item.occurred_at, data?.timezone)}
                              {item.actor_user ? ` · ${displayUserName(item.actor_user)}` : ""}
                            </span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-400">Loading activity…</li>
                    )}
                  </ol>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        title="Add Dog to Walks Board"
        description="Enter the dog name and choose the walk tracking type."
        onClose={() => {
          setAddOpen(false);
          setDuplicate(null);
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="crossover-btn crossover-btn--primary"
              disabled={busyId === "add"}
              onClick={() => void handleAdd(false)}
            >
              Add to Walks Board
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <label className="admin-field">
            <span>Dog Name</span>
            <input value={dogName} onChange={(event) => setDogName(event.target.value)} maxLength={80} autoFocus />
          </label>

          <div>
            <span className="mb-2 block text-sm font-semibold text-slate-300">Walk Type</span>
            <div className="walks-board-type-grid">
              {(Object.keys(WALK_BOARD_TYPE_LABELS) as WalkBoardType[]).map((type) => {
                const Icon = TYPE_ICONS[type];
                const selected = walkType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`walks-board-type-option ${selected ? "walks-board-type-option--active" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setWalkType(type)}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <strong>{WALK_BOARD_TYPE_LABELS[type].label}</strong>
                    <span>{WALK_BOARD_TYPE_LABELS[type].description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {duplicate ? (
            <div className="walks-board-duplicate-warning" role="alert">
              <p>
                <strong>{duplicate.dog_name}</strong> is already active as {walkBoardTypeLabel(duplicate.walk_type)}.
                Next due {formatWalkBoardDateTime(duplicate.next_due_at, data?.timezone)}.
              </p>
              <button type="button" className="crossover-btn crossover-btn--outline mt-3" onClick={() => void handleAdd(true)}>
                Add anyway
              </button>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(clearTarget)}
        title={clearTarget ? `Clear ${clearTarget.dog_name} from the Walks Board?` : "Clear dog"}
        description="This stops future walk reminders for this entry. The walk history will remain available."
        onClose={() => setClearTarget(null)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="crossover-btn crossover-btn--ghost" onClick={() => setClearTarget(null)}>
              Cancel
            </button>
            <button type="button" className="crossover-btn crossover-btn--primary walks-board-clear-btn" disabled={Boolean(busyId)} onClick={() => void handleClear()}>
              Clear Dog
            </button>
          </div>
        }
      >
        <p className="text-slate-300">The audit history for this dog will remain stored after clearing.</p>
      </Modal>
    </section>
  );
}
