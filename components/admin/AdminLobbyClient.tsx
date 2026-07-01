"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import type { LobbyEvent, LobbyPromotion, LobbySettings, LobbyStatusResponse } from "@/lib/lobby/types";
import type { LobbyCheckoutsResponse } from "@/lib/lobby/types";

type AdminLobbyData = {
  settings: LobbySettings;
  checkouts: LobbyCheckoutsResponse;
  promotions: LobbyPromotion[];
  events: LobbyEvent[];
  status: LobbyStatusResponse;
};

export function AdminLobbyClient() {
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [data, setData] = useState<AdminLobbyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = useMemo(
    () => ({
      "content-type": "application/json",
      "x-admin-password": adminPassword
    }),
    [adminPassword]
  );

  const load = useCallback(
    async (passwordOverride?: string) => {
      const credential = passwordOverride ?? adminPassword;
      if (!credential) return;
      setBusy(true);
      setError(null);
      try {
        const [settingsRes, checkoutsRes, promotionsRes, eventsRes, statusRes] = await Promise.all([
          fetch("/api/lobby/settings", { headers: { "x-admin-password": credential }, cache: "no-store" }),
          fetch("/api/lobby/checkouts", { headers: { "x-admin-password": credential }, cache: "no-store" }),
          fetch("/api/lobby/promotions", { headers: { "x-admin-password": credential }, cache: "no-store" }),
          fetch("/api/lobby/events", { headers: { "x-admin-password": credential }, cache: "no-store" }),
          fetch("/api/lobby/status", { headers: { "x-admin-password": credential }, cache: "no-store" })
        ]);

      const settingsBody = await settingsRes.json();
      const checkoutsBody = await checkoutsRes.json();
      const promotionsBody = await promotionsRes.json();
      const eventsBody = await eventsRes.json();
      const statusBody = await statusRes.json();

      if (!settingsRes.ok) throw new Error(settingsBody.error ?? "Unable to load lobby admin.");

      setData({
        settings: settingsBody.settings,
        checkouts: checkoutsBody,
        promotions: promotionsBody.promotions ?? [],
        events: eventsBody.events ?? [],
        status: statusBody
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load lobby admin.");
    } finally {
      setBusy(false);
    }
  }, [adminPassword]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAdminPassword(password);
    await load(password);
  }

  async function saveSettings(patch: Partial<LobbySettings>) {
    setBusy(true);
    try {
      const response = await fetch("/api/lobby/settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify(patch)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to save settings.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save settings.");
      setBusy(false);
    }
  }

  async function togglePromotion(promotion: LobbyPromotion) {
    setBusy(true);
    try {
      const response = await fetch(`/api/lobby/promotions/${promotion.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ active: !promotion.active })
      });
      if (!response.ok) throw new Error("Unable to update promotion.");
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update promotion.");
      setBusy(false);
    }
  }

  async function toggleEvent(event: LobbyEvent) {
    setBusy(true);
    try {
      const response = await fetch(`/api/lobby/events/${event.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ active: !event.active })
      });
      if (!response.ok) throw new Error("Unable to update event.");
      await load();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update event.");
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-10">
        <div className="rounded-3xl border border-white/10 bg-ink-900/80 p-8 shadow-2xl">
          <div className="mb-6 flex items-center gap-3 text-fitdog-orange">
            <ShieldCheck className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold text-white">Lobby Board Admin</h1>
              <p className="text-sm text-slate-400">Manage the lobby checkout display.</p>
            </div>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Admin password"
              className="w-full rounded-xl border border-white/10 bg-ink-950 px-4 py-3 text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-fitdog-orange px-4 py-3 font-semibold text-ink-950 disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Sign In"}
            </button>
          </form>
          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8 text-white">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Lobby Whiteboard Admin</h1>
          <p className="text-slate-400">Manage promotions, events, and lobby display settings.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href="/lobby/checkouts?display=tv"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-fitdog-orange/40 bg-fitdog-orange/10 px-4 py-2 font-semibold text-orange-100"
          >
            <ExternalLink className="h-4 w-4" />
            Open Lobby Whiteboard
          </a>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-red-200">{error}</p> : null}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <p className="text-sm uppercase tracking-wide text-slate-400">Sync Status</p>
          <p className="mt-2 text-2xl font-bold">{data.status.healthy ? "Healthy" : "Refreshing"}</p>
          <p className="mt-2 text-sm text-slate-400">
            Last checkout activity: {data.status.last_successful_sync_at ?? "None"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <p className="text-sm uppercase tracking-wide text-slate-400">Active Checkouts</p>
          <p className="mt-2 text-2xl font-bold">{data.status.active_checkout_count}</p>
          <p className="mt-2 text-sm text-slate-400">Prompted checkout records only</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <p className="text-sm uppercase tracking-wide text-slate-400">Data Source</p>
          <p className="mt-2 text-lg font-semibold">Supabase cached sync</p>
          <p className="mt-2 text-sm text-slate-400">Read-only. No direct Gingr calls.</p>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-white/10 bg-ink-900/70 p-5">
        <h2 className="text-xl font-bold">Board Settings</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm text-slate-400">Max queue count</span>
            <input
              type="number"
              min={3}
              max={6}
              defaultValue={data.settings.max_queue_count}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2"
              onBlur={(event) => void saveSettings({ max_queue_count: Number(event.target.value) })}
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-400">Refresh interval (ms)</span>
            <input
              type="number"
              min={10000}
              step={1000}
              defaultValue={data.settings.refresh_interval_ms}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2"
              onBlur={(event) => void saveSettings({ refresh_interval_ms: Number(event.target.value) })}
            />
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={data.settings.show_promotions}
              onChange={(event) => void saveSettings({ show_promotions: event.target.checked })}
            />
            <span>Show promotions</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              defaultChecked={data.settings.show_events}
              onChange={(event) => void saveSettings({ show_events: event.target.checked })}
            />
            <span>Show events</span>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm text-slate-400">Lobby message</span>
            <input
              type="text"
              defaultValue={data.settings.lobby_message ?? ""}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2"
              onBlur={(event) => void saveSettings({ lobby_message: event.target.value })}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm text-slate-400">Footer message</span>
            <input
              type="text"
              defaultValue={data.settings.footer_message ?? ""}
              className="mt-1 w-full rounded-xl border border-white/10 bg-ink-950 px-3 py-2"
              onBlur={(event) => void saveSettings({ footer_message: event.target.value })}
            />
          </label>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <h2 className="text-xl font-bold">Promotions</h2>
          <div className="mt-4 space-y-3">
            {data.promotions.map((promotion) => (
              <div key={promotion.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="font-semibold">{promotion.title}</p>
                  <p className="text-sm text-slate-400">{promotion.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void togglePromotion(promotion)}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    promotion.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {promotion.active ? "Active" : "Hidden"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-ink-900/70 p-5">
          <h2 className="text-xl font-bold">Class Schedule</h2>
          <p className="mt-2 text-sm text-slate-400">
            The lobby TV displays the fixed weekly Class Schedule (Monday–Friday). Database events below are optional
            for future admin use.
          </p>
          <div className="mt-4 space-y-3">
            {data.events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                <div>
                  <p className="font-semibold">{event.title}</p>
                  <p className="text-sm text-slate-400">{event.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleEvent(event)}
                  className={`rounded-lg px-3 py-1 text-sm font-semibold ${
                    event.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {event.active ? "Active" : "Hidden"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
