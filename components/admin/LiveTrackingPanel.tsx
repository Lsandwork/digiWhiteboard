"use client";

import { useCallback, useEffect, useState } from "react";

type TrackingSessionRow = {
  id: string;
  operating_date: string | null;
  direction: string;
  status: string;
  van_key: string | null;
  van_display_name: string | null;
  dog_names: string[] | null;
  current_eta_at: string | null;
  last_gps_at: string | null;
  threshold_30_sent_at: string | null;
  threshold_15_sent_at: string | null;
  threshold_5_sent_at: string | null;
  live_tracking_enabled_at: string | null;
  health_status: string | null;
  shadow_mode: boolean | null;
  owner_phone_e164: string | null;
};

export function LiveTrackingPanel({ planId }: { planId?: string | null }) {
  const [date, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  );
  const [sessions, setSessions] = useState<TrackingSessionRow[]>([]);
  const [bootstrap, setBootstrap] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [bootRes, sessRes] = await Promise.all([
      fetch("/api/admin/live-tracking?action=bootstrap"),
      fetch(`/api/admin/live-tracking?action=sessions&date=${encodeURIComponent(date)}`)
    ]);
    const bootJson = await bootRes.json();
    const sessJson = await sessRes.json();
    if (bootRes.ok) setBootstrap(bootJson.bootstrap ?? null);
    if (sessRes.ok) setSessions(sessJson.sessions ?? []);
    else setMessage(sessJson.error || "Unable to load tracking sessions");
  }, [date]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/live-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (json.url) {
        setMessage(`Preview / link ready: ${json.url}`);
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        setMessage(json.ok ? "Updated" : "Done");
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Live Tracking</h2>
          <p className="text-sm text-slate-600">
            Owner ETA notifications and secure tracking sessions for approved routes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">
            Date{" "}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="ml-1 rounded border border-slate-300 px-2 py-1"
            />
          </label>
          {planId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => post("create_sessions", { planId })}
              className="rounded-lg bg-fitdog-orange px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Create sessions from plan
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {bootstrap ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge label={`Enabled: ${String(bootstrap.enabled)}`} />
          <Badge label={`Shadow: ${String(bootstrap.shadowMode)}`} />
          <Badge label={`Samsara sync: ${String(bootstrap.syncEnabled)}`} />
          <Badge label={`Live threshold: ${String(bootstrap.liveThresholdMinutes)}m`} />
        </div>
      ) : null}

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="px-2 py-2">Van</th>
              <th className="px-2 py-2">Dogs</th>
              <th className="px-2 py-2">Dir</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">ETA</th>
              <th className="px-2 py-2">GPS</th>
              <th className="px-2 py-2">30/15/5</th>
              <th className="px-2 py-2">Health</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 align-top">
                <td className="px-2 py-2 font-medium">{s.van_display_name || s.van_key}</td>
                <td className="px-2 py-2">{(s.dog_names || []).join(", ")}</td>
                <td className="px-2 py-2 capitalize">{s.direction}</td>
                <td className="px-2 py-2">{s.status}</td>
                <td className="px-2 py-2">
                  {s.current_eta_at
                    ? new Date(s.current_eta_at).toLocaleTimeString("en-US", {
                        timeZone: "America/Los_Angeles",
                        hour: "numeric",
                        minute: "2-digit"
                      })
                    : "—"}
                </td>
                <td className="px-2 py-2">
                  {s.last_gps_at
                    ? new Date(s.last_gps_at).toLocaleTimeString("en-US", {
                        timeZone: "America/Los_Angeles",
                        hour: "numeric",
                        minute: "2-digit"
                      })
                    : "—"}
                </td>
                <td className="px-2 py-2">
                  {[s.threshold_30_sent_at, s.threshold_15_sent_at, s.threshold_5_sent_at]
                    .map((v) => (v ? "✓" : "·"))
                    .join(" ")}
                </td>
                <td className="px-2 py-2">{s.health_status}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <TinyButton
                      disabled={busy}
                      onClick={() => post("preview", { sessionId: s.id })}
                      label="Preview"
                    />
                    <TinyButton
                      disabled={busy}
                      onClick={() => post("regenerate_link", { sessionId: s.id })}
                      label="Regen link"
                    />
                    <TinyButton
                      disabled={busy}
                      onClick={() => post("mark_arrived", { sessionId: s.id })}
                      label="Arrived"
                    />
                    <TinyButton
                      disabled={busy}
                      onClick={() => post("mark_completed", { sessionId: s.id })}
                      label="Complete"
                    />
                    <TinyButton
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt("Reason for disabling tracking?");
                        if (reason) void post("disable", { sessionId: s.id, reason });
                      }}
                      label="Disable"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!sessions.length ? (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-slate-500">
                  No tracking sessions for this date yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{label}</span>;
}

function TinyButton({
  label,
  onClick,
  disabled
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
