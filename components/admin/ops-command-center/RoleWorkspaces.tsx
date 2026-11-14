"use client";

import { readResponseJson } from "@/lib/http/read-response-json";

import { useCallback, useEffect, useMemo, useState } from "react";
import { startVisibilityAwareInterval } from "@/lib/visibility-poll";
import { ClipboardList } from "lucide-react";
import { OpsDogCard, type OpsDogCardModel } from "@/components/admin/ops-command-center/DogCard";
import { OpsSidePanel } from "@/components/admin/ops-command-center/SidePanel";
import { OpsPriorityBadge, OpsStatusBadge } from "@/components/admin/ops-command-center/StatusBadge";
import { BulkEntryComposer } from "@/components/admin/ui/BulkEntryComposer";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { enqueueOfflineAction, flushOfflineQueue, listOfflineQueue } from "@/lib/ops-command-center/offline-queue";
import { loadAutosave, saveAutosave, clearAutosave } from "@/lib/ops-command-center/autosave";
import {
  compileShiftHandoff,
  emptyShiftHandoffItem,
  isShiftHandoffItemEmpty,
  parseShiftHandoffItems,
  SHIFT_HANDOFF_CATEGORIES,
  type ShiftHandoffItem
} from "@/lib/ops-command-center/shift-handoff-items";

type BoardDog = {
  id: string;
  animal_name: string;
  owner_name?: string | null;
  photo_url?: string | null;
  display_status?: string | null;
  current_status?: string | null;
  room?: string | null;
  gingr_animal_id?: string | null;
};

/** Admin-only lanes — never call /api/board/checkouts (shared with Gingr live board). */
async function fetchBoardDogs() {
  const res = await fetch("/api/admin/ops-command-center?view=board_lanes", { cache: "no-store" }).catch(
    () => null
  );
  if (!res || !res.ok) return { checking_in: [] as BoardDog[], checking_out: [] as BoardDog[] };
  const body = await readResponseJson(res);
  return {
    checking_in: (body.checking_in || []) as BoardDog[],
    checking_out: (body.checking_out || []) as BoardDog[]
  };
}

function toCard(dog: BoardDog, status?: string | null): OpsDogCardModel {
  return {
    id: dog.gingr_animal_id || dog.id,
    name: dog.animal_name,
    ownerName: dog.owner_name,
    photoUrl: dog.photo_url,
    status: status || dog.display_status || dog.current_status,
    locationLabel: dog.room,
    gingrAnimalId: dog.gingr_animal_id
  };
}

export function FrontDeskCommandPanel({
  onNavigate,
  theme = "admin"
}: {
  onNavigate?: (tab: string) => void;
  theme?: "admin" | "floor";
}) {
  const floor = theme === "floor";
  const [arriving, setArriving] = useState<BoardDog[]>([]);
  const [leaving, setLeaving] = useState<BoardDog[]>([]);
  const [selected, setSelected] = useState<OpsDogCardModel | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ops-command-center?view=board_lanes", { cache: "no-store" }).catch(
      () => null
    );
    if (!res || !res.ok) {
      setFeedError("Unable to refresh arriving/leaving dogs. Showing last known board state.");
      return;
    }
    const body = await readResponseJson(res).catch(() => null);
    if (!body || body.error) {
      setFeedError(
        typeof body?.error === "string"
          ? body.error
          : "Unable to refresh arriving/leaving dogs. Showing last known board state."
      );
      if (!Array.isArray(body?.checking_in) && !Array.isArray(body?.checking_out)) return;
    } else {
      setFeedError(null);
    }
    if (Array.isArray(body.checking_in)) setArriving(body.checking_in as BoardDog[]);
    if (Array.isArray(body.checking_out)) setLeaving(body.checking_out as BoardDog[]);
  }, []);

  useEffect(() => {
    void load();
    // Admin lanes are cheaper than the public board route — 30s is enough for the desk.
    return startVisibilityAwareInterval(() => void load(), 30_000);
  }, [load]);

  return (
    <section className={floor ? "ops-floor__station" : "space-y-4"}>
      <header className={floor ? "ops-floor__station-head" : "rounded-2xl border border-admin-border bg-admin-card p-4"}>
        <h2 className={floor ? undefined : "admin-text-emphasis text-xl font-semibold"}>Front desk</h2>
        <p className={floor ? undefined : "mt-1 text-sm text-admin-muted"}>
          Arriving on the left, leaving on the right. Check in and checkout happen in Gingr — use Team Log here for owner
          notes.
        </p>
        {feedError ? (
          <p className={floor ? "ops-floor__sub" : "mt-2 text-xs text-amber-200"} style={floor ? { marginTop: 8 } : undefined}>
            {feedError}
          </p>
        ) : null}
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <Lane
          title="Arriving soon / checking in"
          dogs={arriving.map((d) => toCard(d, "arrived"))}
          onOpen={setSelected}
          theme={theme}
        />
        <Lane title="Ready / checking out" dogs={leaving.map((d) => toCard(d, "ready_for_pickup"))} onOpen={setSelected} theme={theme} />
      </div>
      <div className={floor ? "ops-floor__quick-links" : "flex flex-wrap gap-2"}>
        <button
          type="button"
          className={floor ? undefined : "admin-btn-secondary"}
          onClick={() => onNavigate?.("owner_follow_up")}
        >
          Owner follow-up
        </button>
        <button type="button" className={floor ? undefined : "admin-btn-secondary"} onClick={() => onNavigate?.("grooming_push")}>
          Grooming ready
        </button>
        <a className={floor ? undefined : "admin-btn-primary"} href="/gingr">
          Open Gingr
        </a>
      </div>
      <OpsSidePanel open={Boolean(selected)} title={selected?.name || "Dog"} onClose={() => setSelected(null)}>
        {selected ? (
          <div className="space-y-3">
            <OpsDogCard dog={selected} />
            <p className="text-sm text-admin-muted">1–2 action Front Desk flow: confirm board state, then open Gingr if billing/reservation changes are required.</p>
            {selected.gingrAnimalId ? (
              <a className="admin-btn-primary inline-flex" href={`/gingr?animalId=${encodeURIComponent(selected.gingrAnimalId)}`}>
                Open Gingr profile
              </a>
            ) : null}
          </div>
        ) : null}
      </OpsSidePanel>
    </section>
  );
}

function Lane({
  title,
  dogs,
  onOpen,
  theme = "admin"
}: {
  title: string;
  dogs: OpsDogCardModel[];
  onOpen: (dog: OpsDogCardModel) => void;
  theme?: "admin" | "floor";
}) {
  const floor = theme === "floor";
  return (
    <section className={floor ? "ops-floor__lane" : "rounded-2xl border border-admin-border bg-admin-card p-4"}>
      <div className={floor ? "ops-floor__lane-head" : "mb-3 flex items-center justify-between"}>
        <h3 className={floor ? undefined : "admin-text-emphasis text-sm font-semibold"}>{title}</h3>
        <span className={floor ? "ops-floor__sub" : "text-xs text-admin-muted"}>{dogs.length}</span>
      </div>
      <div className="space-y-2">
        {dogs.length ? (
          dogs.map((dog) => <OpsDogCard key={dog.id} dog={dog} theme={theme} onOpen={() => onOpen(dog)} />)
        ) : (
          <p className={floor ? "ops-floor__sub" : "text-sm text-admin-muted"}>None right now.</p>
        )}
      </div>
    </section>
  );
}

export function YardCommandPanel({
  onNavigate,
  theme = "admin"
}: {
  onNavigate?: (tab: string) => void;
  theme?: "admin" | "floor";
}) {
  const floor = theme === "floor";
  const [dogs, setDogs] = useState<BoardDog[]>([]);
  useEffect(() => {
    void (async () => {
      const board = await fetchBoardDogs();
      setDogs([...board.checking_in, ...board.checking_out]);
    })();
  }, []);

  const groups = useMemo(() => {
    const buckets: Record<string, BoardDog[]> = {
      "Small Yard": [],
      "Large Yard": [],
      Break: [],
      Grooming: [],
      Training: [],
      Outing: [],
      Other: []
    };
    for (const dog of dogs) {
      const room = (dog.room || "").toLowerCase();
      if (room.includes("small")) buckets["Small Yard"].push(dog);
      else if (room.includes("large")) buckets["Large Yard"].push(dog);
      else if (room.includes("break")) buckets.Break.push(dog);
      else if (room.includes("groom")) buckets.Grooming.push(dog);
      else if (room.includes("train")) buckets.Training.push(dog);
      else if (room.includes("beach") || room.includes("hike") || room.includes("outing")) buckets.Outing.push(dog);
      else buckets.Other.push(dog);
    }
    return buckets;
  }, [dogs]);

  return (
    <section className={floor ? "ops-floor__station" : "space-y-4"}>
      <header className={floor ? "ops-floor__station-head" : "rounded-2xl border border-admin-border bg-admin-card p-4"}>
        <h2 className={floor ? undefined : "admin-text-emphasis text-xl font-semibold"}>Yard</h2>
        <p className={floor ? undefined : "mt-1 text-sm text-admin-muted"}>
          Where on-site dogs are standing. Log moves in Team Log — room changes still follow Gingr and board state.
        </p>
      </header>
      <div className={floor ? "ops-floor__yard-grid" : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>
        {Object.entries(groups).map(([label, list]) => (
          <div key={label} className={floor ? "ops-floor__yard-tile" : "rounded-2xl border border-white/10 bg-white/[0.03] p-3"}>
            <div className={floor ? "ops-floor__lane-head" : "mb-2 flex items-center justify-between"}>
              <p className={floor ? "ops-floor__dog" : "admin-text-emphasis text-sm font-semibold"}>{label}</p>
              <span className={floor ? "ops-floor__sub" : "admin-text-emphasis text-lg font-semibold"}>{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.slice(0, 8).map((dog) => (
                <OpsDogCard key={dog.id} dog={toCard(dog, "yard")} theme={theme} compact />
              ))}
              {list.length > 8 ? <p className="ops-floor__sub">+{list.length - 8} more on floor list</p> : null}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={floor ? "ops-floor__act" : "admin-btn-primary"}
        onClick={() => onNavigate?.("walks_board")}
      >
        Walks board
      </button>
    </section>
  );
}

export function DriverModePanel() {
  const [queue, setQueue] = useState(listOfflineQueue());
  const [note, setNote] = useState("");

  useEffect(() => {
    function onOnline() {
      void flushOfflineQueue(async (item) => {
        const res = await fetch("/api/admin/ops-command-center", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "driver_event",
            ...item.payload
          })
        });
        return { ok: res.ok, error: res.ok ? undefined : "Sync failed" };
      }).then(setQueue);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  function queueStop(action: string) {
    const item = enqueueOfflineAction({
      module: "driver_mode",
      action,
      payload: { eventType: action, notes: note || null }
    });
    setQueue(listOfflineQueue());
    if (navigator.onLine) {
      void flushOfflineQueue(async (queued) => {
        if (queued.id !== item.id && queued.status === "synced") return { ok: true };
        const res = await fetch("/api/admin/ops-command-center", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "driver_event",
            eventType: queued.payload.eventType,
            notes: queued.payload.notes
          })
        });
        return { ok: res.ok, error: res.ok ? undefined : "Sync failed" };
      }).then(setQueue);
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <header className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h2 className="admin-text-emphasis text-2xl font-semibold">Driver / Hiker Mode</h2>
        <p className="mt-1 text-sm text-admin-muted">Large touch targets. Complements Samsara — does not replace fleet management.</p>
      </header>
      <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
        <p className="text-xs uppercase tracking-wide text-sky-100">Next stop</p>
        <p className="admin-text-emphasis mt-2 text-2xl font-semibold">Use Route Generator + Samsara for live stop order</p>
        <p className="mt-1 text-sm text-admin-muted">Confirm arrival / load / complete here so RuffOps keeps the operational timeline.</p>
      </div>
      <textarea
        className="admin-input min-h-24 w-full"
        placeholder="Driver notes (autosaved locally)"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          saveAutosave("driver_mode_notes", event.target.value);
        }}
      />
      <div className="grid gap-3">
        {["ARRIVED", "DOG LOADED", "COMPLETE STOP"].map((label) => (
          <button
            key={label}
            type="button"
            className="admin-btn-primary min-h-14 text-base font-semibold"
            onClick={() => queueStop(label.toLowerCase().replace(/\s+/g, "_"))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 p-3 text-sm text-admin-muted">
        Sync queue: {queue.filter((q) => q.status !== "synced").length} waiting ·{" "}
        {navigator.onLine ? "Online" : "Offline — actions queued"}
      </div>
    </section>
  );
}

export function OvernightCommandPanel() {
  const [rounds, setRounds] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busyRoundId, setBusyRoundId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/ops-command-center?view=overnight", { cache: "no-store" });
    const body = await readResponseJson(res);
    if (res.ok) setRounds(body.rounds || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(roundId: string) {
    if (busyRoundId) return;
    setBusyRoundId(roundId);
    try {
      await fetch("/api/admin/ops-command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_overnight_round", roundId })
      });
      await load();
    } finally {
      setBusyRoundId(null);
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h2 className="admin-text-emphasis text-xl font-semibold">Overnight Command Center</h2>
        <p className="mt-1 text-sm text-admin-muted">Required timestamped rounds with escalation when missed.</p>
      </header>
      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/5" /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rounds.map((round) => (
          <div key={String(round.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="admin-text-emphasis text-lg font-semibold">{String(round.round_slot)}</p>
            <div className="mt-2">
              <OpsStatusBadge status={String(round.status)} />
            </div>
            {String(round.status) !== "completed" ? (
              <button
                type="button"
                className="admin-btn-primary mt-3 w-full min-h-11"
                disabled={busyRoundId === String(round.id)}
                onClick={() => void complete(String(round.id))}
              >
                {busyRoundId === String(round.id) ? "Saving…" : "Complete round"}
              </button>
            ) : (
              <p className="mt-3 text-xs text-emerald-300">Completed</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function TrainerOpsPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const draftKey = "trainer_session_notes";
  const saved = loadAutosave<{ value?: string }>(draftKey);
  const [notes, setNotes] = useState(typeof saved?.value === "string" ? saved.value : "");
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h2 className="admin-text-emphasis text-xl font-semibold">Trainer Ops</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Built around Gingr bookings/packages. RuffOps stores operational notes, media, homework, and timeline events.
        </p>
      </header>
      <textarea
        className="admin-input min-h-40 w-full"
        placeholder="Today's lesson notes / homework draft (autosaves)"
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          saveAutosave(draftKey, event.target.value);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="admin-btn-primary"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              const res = await fetch("/api/admin/ops-command-center", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "trainer_session_complete", notes })
              });
              if (!res.ok) throw new Error("Unable to complete training session.");
              clearAutosave(draftKey);
              setNotes("");
              showToast("Training session recorded.", "success");
            } catch (error) {
              showToast(error instanceof Error ? error.message : "Unable to complete training session.", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Complete session + timeline event"}
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => onNavigate?.("trainer_push")}>
          Trainer push
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => onNavigate?.("package_commissions")}>
          Sessions / packages (Gingr-linked)
        </button>
        <a className="admin-btn-secondary" href="/gingr">
          Open Gingr
        </a>
      </div>
    </section>
  );
}

type ShiftHandoffDraft = {
  fromShift?: string;
  toShift?: string;
  items?: unknown;
};

function readHandoffDraft(): ShiftHandoffDraft | null {
  const stored = loadAutosave<ShiftHandoffDraft | { value?: ShiftHandoffDraft } | string>("shift_handoff_draft");
  if (!stored) return null;
  if (typeof stored === "string") return { items: [{ note: stored, category: "other" }] };
  if (typeof stored === "object" && stored && "value" in stored && stored.value) return stored.value;
  return stored as ShiftHandoffDraft;
}

export function ShiftHandoffPanel() {
  const { showToast } = useToast();
  const [fromShift, setFromShift] = useState("Afternoon");
  const [toShift, setToShift] = useState("Overnight");
  const [items, setItems] = useState<ShiftHandoffItem[]>([emptyShiftHandoffItem()]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const readyCount = compileShiftHandoff(items).count;

  const persistDraft = useCallback((nextFrom: string, nextTo: string, nextItems: ShiftHandoffItem[]) => {
    saveAutosave("shift_handoff_draft", { fromShift: nextFrom, toShift: nextTo, items: nextItems });
  }, []);

  useEffect(() => {
    const draft = readHandoffDraft();
    if (!draft) return;
    if (draft.fromShift) setFromShift(draft.fromShift);
    if (draft.toShift) setToShift(draft.toShift);
    if (draft.items) setItems(parseShiftHandoffItems(draft.items));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ops-command-center?view=handoffs", { cache: "no-store" });
    const body = await readResponseJson(res);
    if (res.ok) setRows(body.handoffs || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h2 className="admin-text-emphasis text-xl font-semibold">Shift Handoff</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Record every item the incoming shift needs. Press Enter to add another row, then submit them together.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="admin-label">From</span>
          <select
            className="admin-input mt-1"
            value={fromShift}
            onChange={(e) => {
              setFromShift(e.target.value);
              persistDraft(e.target.value, toShift, items);
            }}
          >
            {["Morning", "Afternoon", "Overnight"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="admin-label">To</span>
          <select
            className="admin-input mt-1"
            value={toShift}
            onChange={(e) => {
              setToShift(e.target.value);
              persistDraft(fromShift, e.target.value, items);
            }}
          >
            {["Morning", "Afternoon", "Overnight"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <BulkEntryComposer
          rows={items}
          onChange={(next) => {
            setItems(next);
            persistDraft(fromShift, toShift, next);
          }}
          createEmpty={emptyShiftHandoffItem}
          isEmpty={isShiftHandoffItemEmpty}
          busy={busy}
          title="Handoff items"
          description="Each row is one item for the incoming shift. Press Enter to add another row. Shift+Enter starts a new line in a note."
          addLabel="Add handoff item"
          columns={[
            {
              key: "category",
              label: "Category",
              kind: "select",
              className: "bulk-entry-col--category",
              options: SHIFT_HANDOFF_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))
            },
            {
              key: "note",
              label: "Note",
              kind: "textarea",
              placeholder: "What the next shift needs to know"
            }
          ]}
          footer={
            <button
              type="button"
              className="admin-btn-primary"
              disabled={busy || readyCount === 0}
              onClick={async () => {
                const compiled = compileShiftHandoff(items);
                if (!compiled.count) {
                  showToast("Add at least one handoff item.", "error");
                  return;
                }
                setBusy(true);
                try {
                  const res = await fetch("/api/admin/ops-command-center", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "create_shift_handoff",
                      fromShift,
                      toShift,
                      items: items.filter((item) => !isShiftHandoffItemEmpty(item)),
                      summary: compiled.summary,
                      fields: compiled.fields
                    })
                  });
                  const body = await readResponseJson(res).catch(() => ({}));
                  if (!res.ok) throw new Error(body.error ?? "Unable to submit shift handoff.");
                  setItems([emptyShiftHandoffItem()]);
                  clearAutosave("shift_handoff_draft");
                  showToast(
                    compiled.count === 1 ? "Shift handoff submitted." : `Shift handoff submitted with ${compiled.count} items.`,
                    "success"
                  );
                  await load();
                } catch (error) {
                  showToast(error instanceof Error ? error.message : "Unable to submit shift handoff.", "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              {busy ? "Submitting…" : `Submit handoff (${readyCount})`}
            </button>
          }
        />
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={String(row.id)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="admin-text-emphasis text-sm font-medium">
                {String(row.from_shift)} → {String(row.to_shift)}
              </p>
              {row.acknowledged_at ? (
                <span className="text-xs text-emerald-300">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  className="admin-btn-secondary px-2 py-1 text-xs"
                  onClick={async () => {
                    await fetch("/api/admin/ops-command-center", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "ack_shift_handoff", handoffId: row.id })
                    });
                    await load();
                  }}
                >
                  Acknowledge
                </button>
              )}
            </div>
            <p className="shift-handoff-history mt-1 text-sm text-admin-muted">{String(row.summary || "")}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OpsSystemHealthPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/ops-command-center?view=system_health", { cache: "no-store" });
      const body = await readResponseJson(res);
      if (res.ok) setData(body);
    })();
  }, []);

  const integrations = (data?.integrations as Array<Record<string, string>>) || [];

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-admin-card p-4">
        <h2 className="admin-text-emphasis text-xl font-semibold">System Health</h2>
        <p className="mt-1 text-sm text-admin-muted">Integration status without exposing secrets or credentials.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map((row) => (
          <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="admin-text-emphasis font-semibold">{row.label}</p>
              <OpsPriorityBadge
                priority={
                  row.status === "operational"
                    ? "informational"
                    : row.status === "degraded"
                      ? "attention"
                      : "critical"
                }
              />
            </div>
            <p className="mt-2 text-sm text-admin-muted">{row.detail}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-sm text-admin-muted">
        {((data?.notes as string[]) || []).map((note) => (
          <li key={note}>• {note}</li>
        ))}
      </ul>
    </section>
  );
}
