"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPinned,
  RefreshCw,
  Route as RouteIcon,
  Map as MapIcon,
  Crosshair
} from "lucide-react";
import { FleetVehicleCard } from "@/components/admin/live-fleet/FleetVehicleCard";
import { FleetVehiclePanel } from "@/components/admin/live-fleet/FleetVehiclePanel";
import { useLiveFleet } from "@/components/admin/live-fleet/useLiveFleet";

const LiveFleetMap = dynamic(
  () => import("@/components/admin/live-fleet/LiveFleetMap").then((m) => m.LiveFleetMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-[#0b1220] text-sm text-white/50">
        Loading live map…
      </div>
    )
  }
);

export function LiveFleetPanel() {
  const { snapshot, loading, error, refreshing, refresh } = useLiveFleet();
  const [selectedVanKey, setSelectedVanKey] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [showRouteLines, setShowRouteLines] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [fitToken, setFitToken] = useState(1);
  const [focusToken, setFocusToken] = useState(0);

  const vehicles = useMemo(() => snapshot?.vehicles ?? [], [snapshot?.vehicles]);
  const selected = useMemo(
    () => vehicles.find((v) => v.vanKey === selectedVanKey) ?? null,
    [vehicles, selectedVanKey]
  );

  const onSelectVan = useCallback((vanKey: string) => {
    setSelectedVanKey(vanKey);
    setFocusToken((n) => n + 1);
  }, []);

  const focusSelected = useCallback(() => {
    if (!selectedVanKey) return;
    setFocusToken((n) => n + 1);
  }, [selectedVanKey]);

  return (
    <div className="flex h-[calc(100vh-7.5rem)] min-h-[640px] flex-col overflow-hidden rounded-2xl border border-admin-border bg-[#070b14]">
      <header className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b border-admin-border bg-[#070b14]/95 px-4 py-3 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned className="h-5 w-5 text-fitdog-orange" />
            <h1 className="text-lg font-semibold text-white">Live Fleet</h1>
          </div>
          <p className="mt-0.5 text-xs text-admin-muted">
            {loading && !snapshot
              ? "Connecting to fleet…"
              : snapshot
                ? `${snapshot.operatingDate} · ${vehicles.length} van${vehicles.length === 1 ? "" : "s"} · Samsara GPS via RuffOps`
                : "Fleet status"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFitToken((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-admin-border bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
          >
            <MapIcon className="h-3.5 w-3.5" />
            Fit all vans
          </button>
          <button
            type="button"
            onClick={focusSelected}
            disabled={!selectedVanKey}
            className="inline-flex items-center gap-1.5 rounded-lg border border-admin-border bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
          >
            <Crosshair className="h-3.5 w-3.5" />
            Focus van
          </button>
          <button
            type="button"
            onClick={() => setShowRouteLines((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              showRouteLines
                ? "border-fitdog-orange/50 bg-fitdog-orange/15 text-orange-100"
                : "border-admin-border bg-white/5 text-admin-muted"
            }`}
          >
            <RouteIcon className="h-3.5 w-3.5" />
            Route lines
          </button>
          <button
            type="button"
            onClick={() => setShowStops((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              showStops
                ? "border-fitdog-orange/50 bg-fitdog-orange/15 text-orange-100"
                : "border-admin-border bg-white/5 text-admin-muted"
            }`}
          >
            Stops
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-admin-border bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      {snapshot?.sync.simulated ? (
        <div className="relative z-30 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-100">
          Simulated GPS — development only. Not real Samsara positions.
        </div>
      ) : null}

      {snapshot?.sync.lastError && !snapshot.sync.simulated ? (
        <div className="relative z-30 border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
          GPS temporarily unavailable
          {snapshot.sync.lastSuccessAt
            ? ` · Last successful sync ${new Date(snapshot.sync.lastSuccessAt).toLocaleTimeString("en-US", {
                timeZone: "America/Los_Angeles",
                hour: "numeric",
                minute: "2-digit"
              })}`
            : ""}
          . Showing last known positions when available.
        </div>
      ) : null}

      {error && !snapshot ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-rose-200">{error}</div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* Full-bleed map — overlays never steal the map's geometry. */}
          <div className="absolute inset-0 z-0">
            <LiveFleetMap
              vehicles={vehicles}
              selectedVanKey={selectedVanKey}
              showRouteLines={showRouteLines}
              showStops={showStops}
              fitToken={fitToken}
              focusToken={focusToken}
              onSelectVan={onSelectVan}
            />
            {loading && !snapshot ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#070b14]/40">
                <div className="rounded-xl border border-admin-border bg-[#0b1220]/90 px-4 py-3 text-sm text-white shadow-lg">
                  Connecting to fleet…
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={`absolute bottom-3 left-3 top-3 z-20 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1220]/88 shadow-2xl backdrop-blur-md transition-all ${
              listCollapsed ? "w-11" : "w-[300px]"
            }`}
          >
            <button
              type="button"
              onClick={() => setListCollapsed((v) => !v)}
              className="flex items-center justify-center gap-1 border-b border-white/10 px-2 py-2 text-xs text-admin-muted hover:text-white"
              aria-label={listCollapsed ? "Expand vehicle list" : "Collapse vehicle list"}
            >
              {listCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!listCollapsed ? <span>Fleet</span> : null}
            </button>
            {!listCollapsed ? (
              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {loading && !vehicles.length
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
                    ))
                  : vehicles.map((vehicle) => (
                      <FleetVehicleCard
                        key={vehicle.vanKey}
                        vehicle={vehicle}
                        selected={vehicle.vanKey === selectedVanKey}
                        onSelect={() => onSelectVan(vehicle.vanKey)}
                      />
                    ))}
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="absolute bottom-3 right-3 top-3 z-20 w-[min(380px,calc(100%-1.5rem))] overflow-hidden rounded-2xl border border-white/10 shadow-2xl md:w-[380px]">
              <FleetVehiclePanel
                vehicle={selected}
                samsaraDashboardUrl={snapshot?.samsaraDashboardUrl || "https://cloud.samsara.com"}
                onClose={() => setSelectedVanKey(null)}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
