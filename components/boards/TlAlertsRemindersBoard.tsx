"use client";

import { useEffect, useState } from "react";
import type { TlDigiBoardSnapshot } from "@/lib/tl-digi-board/types";

const EMPTY_SUMMARY = { due: 0, completed: 0, remaining: 0, overdue: 0 };

export function TlAlertsRemindersBoard() {
  const [snapshot, setSnapshot] = useState<TlDigiBoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/boards/tl-alerts-reminders", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as TlDigiBoardSnapshot & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Failed to load board.");
        }
        if (!cancelled) {
          setSnapshot(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load board.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const summary = snapshot?.summary ?? EMPTY_SUMMARY;
  const meta = snapshot?.meta;

  return (
    <main className="min-h-screen bg-[#0b1220] px-6 py-8 text-white">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">Fitdog · TL Digi Board</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            Team Lead Alerts + Reminders
          </h1>
        </div>
        <div className="text-right text-sm text-white/60">
          <div>{meta?.currentPeriod ? `Period: ${meta.currentPeriod}` : "Outside medication windows"}</div>
          <div>Sync: {meta?.gingrSyncHealth ?? "unknown"}</div>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">{error}</p>
      ) : null}

      {!snapshot && !error ? <p className="text-white/50">Loading board…</p> : null}

      {snapshot ? (
        <section className="grid gap-4 sm:grid-cols-4">
          <Stat label="Due" value={summary.due} />
          <Stat label="Remaining" value={summary.remaining} />
          <Stat label="Completed" value={summary.completed} />
          <Stat label="Overdue" value={summary.overdue} accent />
        </section>
      ) : null}

      {snapshot?.meta.allClear ? (
        <p className="mt-10 text-center text-2xl font-medium text-emerald-300">All clear</p>
      ) : (
        <p className="mt-10 text-center text-white/40">
          Medication rows will appear here once Gingr sync is connected.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-5 ${
        accent ? "border-amber-400/40 bg-amber-400/10" : "border-white/10 bg-white/5"
      }`}
    >
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
