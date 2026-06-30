"use client";

import { FormEvent, useCallback, useState } from "react";
import { Copy, EyeOff, RefreshCw, ShieldCheck } from "lucide-react";
import type { LiveDog, WebhookEvent } from "@/lib/types";

type AdminData = {
  dogs: LiveDog[];
  events: WebhookEvent[];
  failed_events: WebhookEvent[];
  webhook_url: string;
  env: Record<string, boolean>;
};

export function AdminClient() {
  const [password, setPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (passwordOverride?: string) => {
      const credential = passwordOverride ?? adminPassword;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/status", {
          headers: { "x-admin-password": credential },
          cache: "no-store"
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Admin request failed.");
        setData(body as AdminData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load admin.");
      } finally {
        setBusy(false);
      }
    },
    [adminPassword]
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAdminPassword(password);
    await load(password);
  }

  async function hideDog(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/hide-dog", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-password": adminPassword
        },
        body: JSON.stringify({ id })
      });
      if (!response.ok) throw new Error("Unable to hide dog.");
      await load();
    } catch (hideError) {
      setError(hideError instanceof Error ? hideError.message : "Unable to hide dog.");
    } finally {
      setBusy(false);
    }
  }

  async function syncGingr() {
    const secret = window.prompt("Enter GINGR_SYNC_SECRET");
    if (!secret) return;
    setBusy(true);
    try {
      const response = await fetch("/api/gingr/sync", {
        method: "POST",
        headers: { "x-sync-secret": secret }
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Sync failed.");
      window.alert(JSON.stringify(body, null, 2));
      await load();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!adminPassword || !data) {
    return (
      <main className="kennel-lines grid min-h-screen place-items-center p-6">
        <form onSubmit={submit} className="glass-panel w-full max-w-md rounded-lg p-6">
          <div className="mb-6 flex items-center gap-3">
            <ShieldCheck className="h-8 w-8 text-fitdog-blue" />
            <h1 className="text-3xl font-black">Fitdog Board Admin</h1>
          </div>
          <label className="mb-2 block text-sm font-bold text-slate-300" htmlFor="password">
            Admin password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mb-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-white outline-none focus:border-fitdog-blue"
          />
          {error ? <p className="mb-4 rounded-lg border border-rose-300/50 bg-rose-400/10 p-3 text-rose-100">{error}</p> : null}
          <button className="w-full rounded-lg bg-fitdog-blue px-4 py-3 text-lg font-black text-slate-950" disabled={busy}>
            {busy ? "Checking..." : "Open Admin"}
          </button>
        </form>
      </main>
    );
  }

  const checkingIn = data.dogs.filter((dog) => dog.display_status === "checking_in");
  const checkingOut = data.dogs.filter((dog) => dog.display_status === "checking_out");

  return (
    <main className="kennel-lines min-h-screen p-6 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-black">Fitdog Board Admin</h1>
            <p className="mt-1 text-slate-300">Manage only dogs actively checking in or checking out.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-3 font-bold" disabled={busy}>
              <RefreshCw className="h-5 w-5" /> Refresh
            </button>
            <button onClick={() => void syncGingr()} className="inline-flex items-center gap-2 rounded-lg border border-fitdog-blue px-4 py-3 font-bold text-fitdog-blue" disabled={busy}>
              <RefreshCw className="h-5 w-5" /> Sync
            </button>
          </div>
        </header>

        {error ? <p className="mb-5 rounded-lg border border-rose-300/50 bg-rose-400/10 p-3 text-rose-100">{error}</p> : null}

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <AdminDogList title="Checking In" dogs={checkingIn} onHide={hideDog} />
          <AdminDogList title="Checking Out" dogs={checkingOut} onHide={hideDog} />
        </section>

        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="glass-panel rounded-lg p-5">
            <h2 className="mb-3 text-2xl font-black">Webhook URL</h2>
            <div className="flex gap-2">
              <input readOnly value={data.webhook_url} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200" />
              <button onClick={() => void navigator.clipboard.writeText(data.webhook_url)} className="rounded-lg border border-fitdog-orange px-3 text-fitdog-orange" aria-label="Copy webhook URL">
                <Copy className="h-5 w-5" />
              </button>
            </div>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-slate-300">
              <li>Open Gingr.</li>
              <li>Go to Admin.</li>
              <li>Go to Custom Configurations.</li>
              <li>Paste this app webhook URL into the Webhook URL field.</li>
              <li>Set the Webhook Signature Key to the same value used in this app.</li>
              <li>Save and test with a Checking In or Checking Out dog.</li>
            </ol>
          </div>

          <div className="glass-panel rounded-lg p-5">
            <h2 className="mb-3 text-2xl font-black">Environment</h2>
            <div className="grid gap-2">
              {Object.entries(data.env).map(([key, configured]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
                  <span className="font-mono text-sm text-slate-300">{key}</span>
                  <span className={configured ? "font-bold text-emerald-300" : "font-bold text-rose-300"}>{configured ? "Configured" : "Missing"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <EventTable title="Last 50 Webhook Events" events={data.events} />
          <EventTable title="Failed Webhook Events" events={data.failed_events} />
        </section>
      </div>
    </main>
  );
}

function AdminDogList({ title, dogs, onHide }: { title: string; dogs: LiveDog[]; onHide: (id: string) => Promise<void> }) {
  return (
    <div className="glass-panel rounded-lg p-5">
      <h2 className="mb-4 text-2xl font-black">{title}</h2>
      <div className="grid gap-3">
        {dogs.length ? (
          dogs.map((dog) => (
            <div key={dog.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <div>
                <div className="text-xl font-black">{dog.animal_name}</div>
                <div className="text-sm text-slate-400">{[dog.owner_name, dog.reservation_type, dog.room].filter(Boolean).join(" • ")}</div>
              </div>
              <button onClick={() => void onHide(dog.id)} className="inline-flex items-center gap-2 rounded-lg border border-rose-300/60 px-3 py-2 font-bold text-rose-200">
                <EyeOff className="h-4 w-4" /> Hide
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-700 p-4 text-slate-400">No visible dogs.</p>
        )}
      </div>
    </div>
  );
}

function EventTable({ title, events }: { title: string; events: WebhookEvent[] }) {
  return (
    <div className="glass-panel overflow-hidden rounded-lg p-5">
      <h2 className="mb-4 text-2xl font-black">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="border-b border-slate-800 py-2">Type</th>
              <th className="border-b border-slate-800 py-2">Entity</th>
              <th className="border-b border-slate-800 py-2">Verified</th>
              <th className="border-b border-slate-800 py-2">Processed</th>
              <th className="border-b border-slate-800 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="text-slate-200">
                <td className="border-b border-slate-900 py-2">{event.webhook_type}</td>
                <td className="border-b border-slate-900 py-2">{event.entity_id}</td>
                <td className="border-b border-slate-900 py-2">{event.verified ? "Yes" : "No"}</td>
                <td className="border-b border-slate-900 py-2">{event.processed ? "Yes" : event.processing_error ?? "No"}</td>
                <td className="border-b border-slate-900 py-2">{new Date(event.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!events.length ? <p className="py-4 text-slate-400">No events.</p> : null}
      </div>
    </div>
  );
}
