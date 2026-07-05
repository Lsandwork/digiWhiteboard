"use client";

import Image from "next/image";
import { useState } from "react";
import { ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { useToast } from "@/components/admin/ui/ToastProvider";
import { DEMO_DOG_PHOTO, type DemoPushAction } from "@/lib/demo/constants";

const ACTION_CARDS: { action: DemoPushAction; label: string; subtitle: string }[] = [
  { action: "check_in", label: "Check In", subtitle: "Shows on demo whiteboard — Checking In" },
  { action: "check_out", label: "Check Out", subtitle: "Shows on demo whiteboard — Checking Out" },
  { action: "grooming", label: "Grooming", subtitle: "Triggers demo grooming push overlay" }
];

export function DemoPushPanel() {
  const { showToast } = useToast();
  const [dogName, setDogName] = useState("Max Smith");
  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);

  async function push(action: DemoPushAction) {
    setBusy(action);
    try {
      const response = await fetch("/api/demo/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, dog_name: dogName })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to push demo event.");
      setStats(body.stats ?? null);
      showToast(`${dogName} — ${ACTION_CARDS.find((c) => c.action === action)?.label ?? action} sent to demo board.`, "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to push demo event.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function resetDemo() {
    setBusy("reset");
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to reset demo.");
      setStats(body.stats ?? null);
      showToast("Demo sandbox reset to sample data.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to reset demo.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="admin-page-header">
        <div>
          <h2 className="admin-page-title">DEMO Push</h2>
          <p className="admin-page-subtitle">
            Push investor demo events to the isolated demo whiteboard. Live staff and lobby boards are never affected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/demo/board"
            target="_blank"
            rel="noopener noreferrer"
            className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open Demo Whiteboard
          </a>
          <button type="button" className="crossover-btn crossover-btn--ghost inline-flex items-center gap-2" disabled={Boolean(busy)} onClick={() => void resetDemo()}>
            <RotateCcw className="h-4 w-4" />
            Reset Demo Data
          </button>
        </div>
      </header>

      {stats ? (
        <section className="crossover-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[var(--crossover-gold)]" />
            <h3 className="crossover-card__title">Demo Stats (sample)</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <p className="text-sm text-admin-muted">Check-ins today: <span className="font-bold text-white">{stats.dogs_checked_in_today}</span></p>
            <p className="text-sm text-admin-muted">Check-outs today: <span className="font-bold text-white">{stats.dogs_checked_out_today}</span></p>
            <p className="text-sm text-admin-muted">Active daycare: <span className="font-bold text-white">{stats.active_daycare}</span></p>
            <p className="text-sm text-admin-muted">Grooming queue: <span className="font-bold text-white">{stats.grooming_queue}</span></p>
            <p className="text-sm text-admin-muted">Staff on duty: <span className="font-bold text-white">{stats.staff_on_duty}</span></p>
            <p className="text-sm text-admin-muted">Satisfaction: <span className="font-bold text-white">{stats.satisfaction_score}%</span></p>
          </div>
        </section>
      ) : null}

      <section className="crossover-card p-5">
        <label className="grid gap-2">
          <span className="admin-label">Dog name for demo push</span>
          <input
            className="crossover-input max-w-md"
            value={dogName}
            onChange={(event) => setDogName(event.target.value)}
            placeholder="Max Smith"
          />
        </label>
        <p className="mt-2 text-xs text-admin-muted">Type a name above, then tap a card below to trigger that event on the demo whiteboard.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        {ACTION_CARDS.map((card) => (
          <button
            key={card.action}
            type="button"
            className="demo-push-card crossover-card p-5 text-left transition hover:border-fitdog-orange/50"
            disabled={Boolean(busy)}
            onClick={() => void push(card.action)}
          >
            <div className="demo-push-card__photo-wrap">
              <Image src={DEMO_DOG_PHOTO} alt={dogName} width={160} height={160} className="demo-push-card__photo" />
            </div>
            <h3 className="mt-4 text-lg font-black text-white">{dogName || "Max Smith"}</h3>
            <p className="text-sm font-bold text-fitdog-orange">{card.label}</p>
            <p className="mt-2 text-xs text-admin-muted">{card.subtitle}</p>
            <span className="crossover-btn crossover-btn--primary mt-4 inline-flex w-full justify-center">
              {busy === card.action ? "Pushing…" : `Push ${card.label}`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
