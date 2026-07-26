"use client";

import { useCallback, useEffect, useState } from "react";

type DriverStop = {
  id: string;
  direction: string;
  status: string;
  van_display_name: string | null;
  dog_names: string[] | null;
  stop_address_masked: string | null;
  current_eta_at: string | null;
  health_status: string | null;
};

export function DriverRouteWorkflowPanel() {
  const [stops, setStops] = useState<DriverStop[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/driver-route");
    const json = await res.json();
    if (res.ok) setStops(json.stops ?? []);
    else setMessage(json.error || "Unable to load driver stops");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function act(action: string, sessionId: string, reason?: string) {
    const res = await fetch("/api/admin/driver-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, sessionId, reason })
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error || "Action failed");
      return;
    }
    setMessage("Updated");
    await load();
  }

  return (
    <section className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-900">Driver route workflow</h2>
      <p className="text-sm text-slate-600">
        Confirm arrival and completion. Threshold notifications are automatic — drivers do not send tracking links.
      </p>
      {message ? <p className="text-sm">{message}</p> : null}
      <div className="space-y-3">
        {stops.map((stop) => (
          <article key={stop.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">
                  {(stop.dog_names || []).join(", ") || "Dogs"} · {stop.direction}
                </p>
                <p className="text-sm text-slate-600">{stop.stop_address_masked || "Stop"}</p>
                <p className="text-xs text-slate-500">
                  {stop.van_display_name} · {stop.status} · health {stop.health_status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-fitdog-orange px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => void act("arrived", stop.id)}
                >
                  Arrived
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  onClick={() => void act("complete", stop.id)}
                >
                  Complete
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  onClick={() => {
                    const reason = window.prompt("Delay note?");
                    if (reason) void act("delay", stop.id, reason);
                  }}
                >
                  Report delay
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700"
                  onClick={() => void act("privacy_pause", stop.id)}
                >
                  Privacy pause
                </button>
              </div>
            </div>
          </article>
        ))}
        {!stops.length ? <p className="text-sm text-slate-500">No active stops for today.</p> : null}
      </div>
    </section>
  );
}
