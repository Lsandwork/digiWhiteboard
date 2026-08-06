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
  arriveAtLabel: string | null;
  headline: string;
  subline: string;
  helperText: string;
  phase: "waiting" | "en_route" | "nearby" | "live" | "arrived";
  progressStep: number;
  showLiveVehicle: boolean;
  showArrivingBanner: boolean;
  liveConfigured: boolean;
  vanDisplayName: string;
  alertMinutes: number;
  liveMapMinutes: number;
};

const PROGRESS_LABELS = ["On the way", "Nearby", "Almost there", "Arrived"];

export function OwnerLiveTrackClient({ token }: { token: string }) {
  const [view, setView] = useState<TrackView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

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
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (error) {
    return (
      <main className="owner-track owner-track--centered">
        <p className="owner-track-error">{error}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="owner-track owner-track--centered">
        <p className="owner-track-loading">Loading live map…</p>
      </main>
    );
  }

  const dogs = view.dogNames.join(" + ") || "your dog";
  const mapCallout =
    view.phase === "arrived" ? "Arrived" : view.phase === "live" ? "En route" : "On the way";

  return (
    <main className="owner-track">
      <div className="owner-track__map">
        <OwnerLiveTrackMap
          stop={view.stop}
          vehicle={view.vehicle}
          showLiveVehicle={view.showLiveVehicle}
          vanLabel={view.vanDisplayName}
          callout={mapCallout}
        />
      </div>

      <header className="owner-track__topbar">
        <div className="owner-track__brand-pill">
          <span className="owner-track__brand">FITDOG</span>
          <span className="owner-track__wave">
            {view.direction === "pickup" ? "Pickup" : "Drop-off"}
          </span>
        </div>
      </header>

      {!view.showLiveVehicle && view.phase !== "arrived" ? (
        <div className="owner-track__privacy">
          <p>
            Live van map unlocks at ~{view.liveMapMinutes} minutes out.
            {view.phase === "nearby"
              ? " Your alert text was sent — hang tight."
              : ` We’ll text you around ${view.alertMinutes} minutes away.`}
          </p>
        </div>
      ) : null}

      <section className="owner-track__sheet" aria-label="Live tracking status">
        <div className="owner-track__sheet-inner">
          <div className="owner-track__status">
            <h1 className="owner-track__headline">{view.headline}</h1>
            {view.arriveAtLabel ? (
              <p className="owner-track__arrive">
                Arrives <strong>{view.arriveAtLabel}</strong>
                {view.etaMinutes != null ? <span> · {view.etaMinutes} min</span> : null}
              </p>
            ) : (
              <p className="owner-track__arrive">{view.subline}</p>
            )}

            <div
              className="owner-track__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={4}
              aria-valuenow={Math.min(4, view.progressStep)}
              aria-label="Route progress"
            >
              {PROGRESS_LABELS.map((label, index) => {
                const filled = view.progressStep > index;
                return (
                  <span
                    key={label}
                    className={`owner-track__progress-seg ${filled ? "is-filled" : ""}`}
                    title={label}
                  />
                );
              })}
            </div>
            <p className="owner-track__helper">{view.helperText}</p>
          </div>

          <div className="owner-track__van-row">
            <div className="owner-track__van-thumb" aria-hidden="true">
              <span className="owner-track__van-glyph" />
            </div>
            <div className="owner-track__van-meta">
              <p className="owner-track__van-name">
                {view.vanDisplayName}
                <span> · Fitdog</span>
              </p>
              <p className="owner-track__van-desc">
                {view.showLiveVehicle
                  ? `Live GPS for ${dogs}`
                  : `Tracking ${dogs} · map unlocks at ~${view.liveMapMinutes} min`}
              </p>
            </div>
          </div>

          <a className="owner-track__support" href="https://fitdog.com/contact" target="_blank" rel="noreferrer">
            Contact Fitdog
          </a>

          <button
            type="button"
            className="owner-track__details-toggle"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <div>
              <p className="owner-track__details-label">
                {view.direction === "pickup" ? "Pickup details" : "Drop-off details"}
              </p>
              {detailsOpen ? (
                <>
                  <p className="owner-track__details-note">
                    {view.direction === "pickup"
                      ? "Meet your Fitdog driver outside with leash + phone."
                      : "Be ready outside for drop-off."}
                  </p>
                  {view.stopAddress ? <p className="owner-track__details-address">{view.stopAddress}</p> : null}
                  {view.ownerName ? <p className="owner-track__details-owner">{view.ownerName}</p> : null}
                </>
              ) : (
                <p className="owner-track__details-address">{view.stopAddress || "Address on file"}</p>
              )}
            </div>
            <span className={`owner-track__chevron ${detailsOpen ? "is-open" : ""}`} aria-hidden="true" />
          </button>

          {!view.liveConfigured ? (
            <p className="owner-track__warn">
              Live van GPS activates when Samsara is configured. Your tracking link still works.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
