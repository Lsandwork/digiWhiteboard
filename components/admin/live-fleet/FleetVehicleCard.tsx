"use client";

import type { LiveFleetVehicle } from "@/lib/live-fleet/types";

function statusChip(vehicle: LiveFleetVehicle): { label: string; className: string } {
  if (vehicle.telemetry?.simulated) {
    return { label: "SIMULATED GPS", className: "bg-amber-500/20 text-amber-200 border-amber-500/40" };
  }
  if (!vehicle.route) {
    return { label: "No route", className: "bg-white/10 text-admin-muted border-white/10" };
  }
  if (vehicle.route.routeStatus === "complete") {
    return { label: "Route complete", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  }
  if (vehicle.freshness === "unavailable" || vehicle.telemetry?.status === "offline") {
    return { label: "GPS unavailable", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  }
  if (vehicle.freshness === "stale" || vehicle.telemetry?.status === "stale") {
    return { label: "GPS stale", className: "bg-amber-500/15 text-amber-200 border-amber-500/30" };
  }
  if (vehicle.telemetry?.status === "parked") {
    return { label: "Parked", className: "bg-sky-500/15 text-sky-200 border-sky-500/30" };
  }
  if (vehicle.telemetry?.status === "moving") {
    return { label: "Moving", className: "bg-fitdog-orange/20 text-orange-200 border-fitdog-orange/40" };
  }
  return { label: "Active", className: "bg-white/10 text-white border-white/15" };
}

type Props = {
  vehicle: LiveFleetVehicle;
  selected: boolean;
  onSelect: () => void;
};

export function FleetVehicleCard({ vehicle, selected, onSelect }: Props) {
  const chip = statusChip(vehicle);
  const service = vehicle.route?.serviceType || vehicle.route?.routeName || "No route assigned";
  const nextLabel = vehicle.nextStop
    ? `${vehicle.nextStop.dogName || vehicle.nextStop.destination || "Stop"} · ${vehicle.nextStop.stopType}`
    : "—";
  const etaBits: string[] = [];
  if (vehicle.nextStop?.etaReliable && vehicle.nextStop.etaMinutes != null) {
    etaBits.push(`${vehicle.nextStop.etaMinutes} min`);
  }
  if (vehicle.nextStop?.etaReliable && vehicle.nextStop.distanceMiles != null) {
    etaBits.push(`${vehicle.nextStop.distanceMiles} mi`);
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
        selected
          ? "border-fitdog-orange/70 bg-fitdog-orange/10 shadow-[0_0_0_1px_rgba(234,88,12,.35)]"
          : "border-admin-border bg-black/25 hover:border-white/20 hover:bg-black/35"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{vehicle.displayName}</div>
          <div className="mt-0.5 text-xs text-admin-muted">{service}</div>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip.className}`}>
          {chip.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div className="text-admin-muted">Driver</div>
        <div className="truncate text-white">{vehicle.driverName || "Unavailable"}</div>
        <div className="text-admin-muted">Dogs</div>
        <div className="text-white">{vehicle.dogCount}</div>
        <div className="text-admin-muted">Next</div>
        <div className="truncate text-white">{nextLabel}</div>
        {etaBits.length ? (
          <>
            <div className="text-admin-muted">ETA</div>
            <div className="text-white">{etaBits.join(" / ")}</div>
          </>
        ) : null}
        <div className="text-admin-muted">Progress</div>
        <div className="text-white">
          {vehicle.route ? `${vehicle.route.progressPercent}% · ${vehicle.route.completedStops}/${vehicle.route.totalStops}` : "—"}
        </div>
      </div>
      {vehicle.route ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-fitdog-orange"
            style={{ width: `${Math.min(100, Math.max(0, vehicle.route.progressPercent))}%` }}
          />
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-admin-muted">{vehicle.freshnessLabel}</div>
    </button>
  );
}
