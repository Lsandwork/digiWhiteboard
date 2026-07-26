"use client";

import { useEffect, useState } from "react";
import { OwnerLiveTrackMap } from "@/components/track/OwnerLiveTrackMap";

type TrackView = {
  token: string;
  status: string;
  direction: "pickup" | "dropoff";
  dogNames: string[];
  ownerName: string | null;
  stopAddress: string | null;
  stop: { lat: number; lng: number } | null;
  vehicle: { lat: number; lng: number; heading: number | null; updatedAt: string | null } | null;
  etaMinutes: number | null;
  headline: string;
  subline: string;
  showArrivingBanner: boolean;
  liveConfigured: boolean;
};

export function OwnerLiveTrackClient({ token }: { token: string }) {
  const [view, setView] = useState<TrackView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/track/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load tracking.");
        if (!cancelled) {
          setView(body as TrackView);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load tracking.");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8] px-4">
        <p className="rounded-2xl bg-white px-5 py-4 text-sm text-neutral-700 shadow">{error}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f6f8]">
        <p className="text-sm text-neutral-500">Loading live map…</p>
      </main>
    );
  }

  const dogs = view.dogNames.join(" + ") || "your dog";

  return (
    <main className="relative min-h-screen bg-[#f4f6f8] text-neutral-900">
      <div className="absolute inset-0 z-0">
        <OwnerLiveTrackMap stop={view.stop} vehicle={view.vehicle} />
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-4">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between rounded-full bg-white/95 px-4 py-2 shadow-lg backdrop-blur">
          <span className="text-sm font-black tracking-tight text-[#f15f2a]">FITDOG</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {view.direction === "pickup" ? "Pickup" : "Drop-off"}
          </span>
        </div>
      </header>

      {view.showArrivingBanner ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 px-4">
          <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl bg-[#111827] px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
            Driver is about 15 minutes out — please be ready for {dogs}.
          </div>
        </div>
      ) : null}

      <section className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3">
        <div className="pointer-events-auto mx-auto max-w-lg overflow-hidden rounded-[28px] bg-white shadow-[0_-8px_40px_rgba(0,0,0,.18)]">
          <div className="border-b border-neutral-100 px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400">Arriving in</p>
            <div className="mt-1 flex items-end gap-3">
              <h1 className="text-5xl font-black tracking-tight text-neutral-900">
                {view.etaMinutes != null ? view.etaMinutes : "—"}
              </h1>
              <p className="mb-1 text-lg font-semibold text-neutral-500">min</p>
            </div>
            <p className="mt-2 text-base font-semibold text-neutral-900">{view.headline}</p>
            <p className="mt-1 text-sm text-neutral-500">{view.subline}</p>
          </div>

          <div className="space-y-3 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Dogs</p>
              <p className="text-sm font-semibold text-neutral-900">{dogs}</p>
            </div>
            {view.stopAddress ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Stop</p>
                <p className="text-sm text-neutral-700">{view.stopAddress}</p>
              </div>
            ) : null}
            {!view.liveConfigured ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Live van GPS activates when Samsara API token is configured. Tracking link and map are ready.
              </p>
            ) : null}
            <p className="text-[11px] text-neutral-400">
              Updates every 10 seconds · You’ll also get a text when the driver is ~30 minutes away.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
