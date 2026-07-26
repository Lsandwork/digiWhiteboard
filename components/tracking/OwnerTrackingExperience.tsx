"use client";

import { useEffect, useMemo, useState } from "react";
import type { OwnerSafeSnapshot } from "@/lib/live-tracking/privacy";
import { FITDOG_BRAND } from "@/lib/fitdog-dashboard/assets";

type Props = {
  token: string;
  initialSnapshot?: OwnerSafeSnapshot | null;
};

export function OwnerTrackingExperience({ token, initialSnapshot = null }: Props) {
  const [snapshot, setSnapshot] = useState<OwnerSafeSnapshot | null>(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialSnapshot);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let cancelled = false;
    let delay = 5000;

    async function load() {
      try {
        const res = await fetch(`/api/public/tracking/${encodeURIComponent(token)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        const json = (await res.json()) as { snapshot?: OwnerSafeSnapshot; error?: string };
        if (!res.ok) {
          if (!cancelled) {
            setError(json.error || "Unable to load tracking");
            setLoading(false);
          }
          delay = Math.min(delay * 1.5, 30000);
        } else if (!cancelled && json.snapshot) {
          setSnapshot(json.snapshot);
          setError(null);
          setLoading(false);
          delay = json.snapshot.vehicle?.stale ? 10000 : 5000;
        }
      } catch {
        if (!cancelled) {
          setError("Connection interrupted. Retrying…");
          delay = Math.min(delay * 1.5, 30000);
        }
      } finally {
        if (!cancelled) {
          window.setTimeout(load, delay);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const dogLabel = useMemo(() => {
    const names = snapshot?.dogNames ?? [];
    if (!names.length) return "your dog";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  }, [snapshot?.dogNames]);

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102E66] text-white">
        <p role="status">Loading Fitdog tracking…</p>
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#102E66] px-6 text-center text-white">
        <img src={FITDOG_BRAND.logoBadge128} alt="Fitdog" className="h-16 w-16" />
        <h1 className="text-xl font-semibold">Tracking unavailable</h1>
        <p className="max-w-md text-sm text-white/80">{error}</p>
        <a href="tel:+13105550100" className="rounded-full bg-[#ff9f1c] px-5 py-2 text-sm font-semibold text-[#102E66]">
          Contact Fitdog
        </a>
      </div>
    );
  }

  if (!snapshot) return null;

  const headline =
    snapshot.direction === "pickup" ? `Picking up ${dogLabel}` : `Bringing ${dogLabel} home`;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1f4a] text-white">
      <div className="absolute inset-0">
        <TrackingMapCanvas snapshot={snapshot} reducedMotion={reducedMotion} />
      </div>

      <header className="relative z-20 flex items-center justify-between px-4 pb-2 pt-4">
        <img src={FITDOG_BRAND.logoBadge64} alt="Fitdog" className="h-10 w-10 drop-shadow" />
        <div
          className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#102E66] shadow"
          role="status"
          aria-live="polite"
        >
          {snapshot.statusLabel}
        </div>
      </header>

      <section
        className="absolute inset-x-0 bottom-0 z-20 rounded-t-3xl bg-white text-[#102E66] shadow-[0_-8px_40px_rgba(0,0,0,0.35)]"
        aria-label="Trip details"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" aria-hidden />
        <div className="space-y-3 px-5 pb-8 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1BAFC8]">
              {snapshot.direction === "pickup" ? "Pickup" : "Drop-off"}
            </p>
            <h1 className="text-2xl font-bold leading-tight">{headline}</h1>
            <p className="mt-1 text-base font-medium text-slate-700">{snapshot.etaLabel}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoChip label="Status" value={snapshot.statusLabel} />
            <InfoChip label="Van" value={snapshot.vanDisplayName} />
            <InfoChip label="Driver" value={snapshot.driverDisplayName} />
            <InfoChip
              label="Updated"
              value={
                snapshot.showUpdatingLocation
                  ? "Updating driver location…"
                  : new Date(snapshot.lastUpdatedAt).toLocaleTimeString("en-US", {
                      timeZone: "America/Los_Angeles",
                      hour: "numeric",
                      minute: "2-digit"
                    })
              }
            />
          </div>

          {snapshot.contactPhone ? (
            <a
              href={`tel:${snapshot.contactPhone}`}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#ff9f1c] text-base font-semibold text-[#102E66]"
            >
              Contact Fitdog
            </a>
          ) : (
            <a
              href="https://www.fitdog.com"
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#ff9f1c] text-base font-semibold text-[#102E66]"
            >
              Contact Fitdog
            </a>
          )}

          <p className="text-xs leading-relaxed text-slate-500">
            For your privacy, live location is only shown when your Fitdog van is approaching your stop.
            Other customer stops are never shared.
          </p>
        </div>
      </section>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium leading-snug">{value}</p>
    </div>
  );
}

function TrackingMapCanvas({
  snapshot,
  reducedMotion
}: {
  snapshot: OwnerSafeSnapshot;
  reducedMotion: boolean;
}) {
  const home = snapshot.home;
  const vehicle = snapshot.vehicle;

  // Project lat/lng into a local canvas without exposing other stops.
  const points = useMemo(() => {
    const coords: Array<{ lat: number; lng: number; kind: "home" | "van" | "line" }> = [];
    if (home.latitude != null && home.longitude != null) {
      coords.push({ lat: home.latitude, lng: home.longitude, kind: "home" });
    }
    if (vehicle) {
      coords.push({ lat: vehicle.latitude, lng: vehicle.longitude, kind: "van" });
    }
    for (const p of snapshot.routeLine) coords.push({ lat: p.lat, lng: p.lng, kind: "line" });
    return coords;
  }, [home.latitude, home.longitude, vehicle, snapshot.routeLine]);

  const projected = useMemo(() => projectPoints(points), [points]);

  return (
    <div className="relative h-full w-full bg-[radial-gradient(circle_at_20%_20%,#1BAFC8_0%,transparent_40%),radial-gradient(circle_at_80%_0%,#ff9f1c55_0%,transparent_35%),linear-gradient(160deg,#102E66,#0b1f4a_55%,#143a7a)]">
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <pattern id="roads" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 8 L8 0" stroke="#ffffff14" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#roads)" />
        {projected.line.length > 1 ? (
          <polyline
            points={projected.line.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#68f77f"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        ) : null}
      </svg>

      {projected.home ? (
        <img
          src="/tracking/home-paw-marker.svg"
          alt="Your stop"
          className="absolute h-12 w-10 -translate-x-1/2 -translate-y-full drop-shadow-lg"
          style={{ left: `${projected.home.x}%`, top: `${projected.home.y}%` }}
        />
      ) : null}

      {snapshot.liveLocationVisible && projected.van ? (
        <img
          src="/tracking/fitdog-van-top.svg"
          alt={`${snapshot.vanDisplayName} live location`}
          className={`absolute h-14 w-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-xl ${
            reducedMotion || vehicle?.stale ? "" : "transition-all duration-1000 ease-out"
          }`}
          style={{
            left: `${projected.van.x}%`,
            top: `${projected.van.y}%`,
            transform: `translate(-50%, -50%) rotate(${vehicle?.heading ?? 0}deg)`
          }}
        />
      ) : null}

      {!snapshot.liveLocationVisible ? (
        <div className="absolute inset-x-0 top-24 mx-auto max-w-sm rounded-2xl bg-white/90 px-4 py-3 text-center text-sm text-[#102E66] shadow">
          Live van location unlocks when your Fitdog driver is about 15 minutes away.
        </div>
      ) : null}

      {snapshot.showUpdatingLocation ? (
        <div
          className="absolute left-1/2 top-28 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white"
          role="status"
        >
          Updating driver location…
        </div>
      ) : null}
    </div>
  );
}

function projectPoints(points: Array<{ lat: number; lng: number; kind: string }>) {
  if (!points.length) {
    return { home: null as null | { x: number; y: number }, van: null as null | { x: number; y: number }, line: [] as Array<{ x: number; y: number }> };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats) - 0.01;
  const maxLat = Math.max(...lats) + 0.01;
  const minLng = Math.min(...lngs) - 0.01;
  const maxLng = Math.max(...lngs) + 0.01;
  const toXY = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng || 1)) * 80 + 10,
    y: (1 - (lat - minLat) / (maxLat - minLat || 1)) * 70 + 12
  });

  const homePoint = points.find((p) => p.kind === "home");
  const vanPoint = points.find((p) => p.kind === "van");
  const line = points.filter((p) => p.kind === "line" || p.kind === "van" || p.kind === "home").map((p) => toXY(p.lat, p.lng));

  return {
    home: homePoint ? toXY(homePoint.lat, homePoint.lng) : null,
    van: vanPoint ? toXY(vanPoint.lat, vanPoint.lng) : null,
    line
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
