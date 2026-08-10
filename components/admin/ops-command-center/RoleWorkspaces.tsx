"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OpsDogCard, type OpsDogCardModel } from "@/components/admin/ops-command-center/DogCard";
import { OpsSidePanel } from "@/components/admin/ops-command-center/SidePanel";
import { OpsPriorityBadge, OpsStatusBadge } from "@/components/admin/ops-command-center/StatusBadge";
import { enqueueOfflineAction, flushOfflineQueue, listOfflineQueue } from "@/lib/ops-command-center/offline-queue";
import { loadAutosave, saveAutosave, clearAutosave } from "@/lib/ops-command-center/autosave";

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

async function fetchBoardDogs() {
  const res = await fetch("/api/board/live?mode=fast_internal", { cache: "no-store" }).catch(() => null);
  if (!res || !res.ok) return { checking_in: [] as BoardDog[], checking_out: [] as BoardDog[] };
  const body = await res.json();
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

export function FrontDeskCommandPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [arriving, setArriving] = useState<BoardDog[]>([]);
  const [leaving, setLeaving] = useState<BoardDog[]>([]);
  const [selected, setSelected] = useState<OpsDogCardModel | null>(null);

  const load = useCallback(async () => {
    const board = await fetchBoardDogs();
    setArriving(board.checking_in);
    setLeaving(board.checking_out);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">Front Desk Command Center</h2>
        <p className="mt-1 text-sm text-admin-muted">
          Speed surface for arriving, ready for pickup, and checkout. Payments/packages stay in Gingr — use Open in Gingr.
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <Lane title="Arriving soon / checking in" dogs={arriving.map((d) => toCard(d, "arrived"))} onOpen={setSelected} />
        <Lane title="Ready / checking out" dogs={leaving.map((d) => toCard(d, "ready_for_pickup"))} onOpen={setSelected} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="admin-btn-secondary" onClick={() => onNavigate?.("fitdog_alerts")}>
          Package / payment attention
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => onNavigate?.("owner_follow_up")}>
          Owner needs contact
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => onNavigate?.("grooming_push")}>
          Grooming ready
        </button>
        <a className="admin-btn-primary" href="/gingr">
          Open in Gingr
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
  onOpen
}: {
  title: string;
  dogs: OpsDogCardModel[];
  onOpen: (dog: OpsDogCardModel) => void;
}) {
  return (
    <section className="rounded-2xl border border-admin-border bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className="text-xs text-admin-muted">{dogs.length}</span>
      </div>
      <div className="space-y-2">
        {dogs.length ? dogs.map((dog) => <OpsDogCard key={dog.id} dog={dog} onOpen={() => onOpen(dog)} />) : (
          <p className="text-sm text-admin-muted">None right now.</p>
        )}
      </div>
    </section>
  );
}

export function YardCommandPanel({ onNavigate }: { onNavigate?: (tab: string) => void }) {
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
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">Yard Command Center</h2>
        <p className="mt-1 text-sm text-admin-muted">Prioritize overdue walks, breaks, and movement — not another report screen.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(groups).map(([label, list]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">{label}</p>
              <span className="text-lg font-semibold text-white">{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.slice(0, 5).map((dog) => (
                <OpsDogCard key={dog.id} dog={toCard(dog, "yard")} compact />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="admin-btn-primary" onClick={() => onNavigate?.("walks_board")}>
        Open Walks Board actions
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
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-2xl font-semibold text-white">Driver / Hiker Mode</h2>
        <p className="mt-1 text-sm text-admin-muted">Large touch targets. Complements Samsara — does not replace fleet management.</p>
      </header>
      <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
        <p className="text-xs uppercase tracking-wide text-sky-100">Next stop</p>
        <p className="mt-2 text-2xl font-semibold text-white">Use Route Generator + Samsara for live stop order</p>
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

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/ops-command-center?view=overnight", { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setRounds(body.rounds || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(roundId: string) {
    await fetch("/api/admin/ops-command-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete_overnight_round", roundId })
    });
    await load();
  }

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">Overnight Command Center</h2>
        <p className="mt-1 text-sm text-admin-muted">Required timestamped rounds with escalation when missed.</p>
      </header>
      {loading ? <div className="h-24 animate-pulse rounded-2xl bg-white/5" /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rounds.map((round) => (
          <div key={String(round.id)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-lg font-semibold text-white">{String(round.round_slot)}</p>
            <div className="mt-2">
              <OpsStatusBadge status={String(round.status)} />
            </div>
            {String(round.status) !== "completed" ? (
              <button
                type="button"
                className="admin-btn-primary mt-3 w-full min-h-11"
                onClick={() => void complete(String(round.id))}
              >
                Complete round
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

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">Trainer Ops</h2>
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
          onClick={async () => {
            await fetch("/api/admin/ops-command-center", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "trainer_session_complete", notes })
            });
            clearAutosave(draftKey);
          }}
        >
          Complete session + timeline event
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

export function ShiftHandoffPanel() {
  const [summary, setSummary] = useState("");
  const [fromShift, setFromShift] = useState("Afternoon");
  const [toShift, setToShift] = useState("Overnight");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ops-command-center?view=handoffs", { cache: "no-store" });
    const body = await res.json();
    if (res.ok) setRows(body.handoffs || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">Shift Handoff</h2>
        <p className="mt-1 text-sm text-admin-muted">Structured handoff with acknowledgement and audit history.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="admin-label">From</span>
          <select className="admin-input mt-1" value={fromShift} onChange={(e) => setFromShift(e.target.value)}>
            {["Morning", "Afternoon", "Overnight"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="admin-label">To</span>
          <select className="admin-input mt-1" value={toShift} onChange={(e) => setToShift(e.target.value)}>
            {["Morning", "Afternoon", "Overnight"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="admin-input min-h-32 w-full"
        placeholder="Unresolved incidents, meds, late pickups, transportation, follow-ups…"
        value={summary}
        onChange={(e) => {
          setSummary(e.target.value);
          saveAutosave("shift_handoff_draft", e.target.value);
        }}
      />
      <button
        type="button"
        className="admin-btn-primary"
        onClick={async () => {
          await fetch("/api/admin/ops-command-center", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create_shift_handoff", fromShift, toShift, summary })
          });
          setSummary("");
          clearAutosave("shift_handoff_draft");
          await load();
        }}
      >
        Submit handoff
      </button>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={String(row.id)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">
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
            <p className="mt-1 text-sm text-admin-muted">{String(row.summary || "")}</p>
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
      const body = await res.json();
      if (res.ok) setData(body);
    })();
  }, []);

  const integrations = (data?.integrations as Array<Record<string, string>>) || [];

  return (
    <section className="space-y-4">
      <header className="rounded-2xl border border-admin-border bg-black/20 p-4">
        <h2 className="text-xl font-semibold text-white">System Health</h2>
        <p className="mt-1 text-sm text-admin-muted">Integration status without exposing secrets or credentials.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {integrations.map((row) => (
          <div key={row.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-white">{row.label}</p>
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
