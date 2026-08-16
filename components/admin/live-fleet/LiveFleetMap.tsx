"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LiveFleetStop, LiveFleetVehicle } from "@/lib/live-fleet/types";
import "leaflet/dist/leaflet.css";

type Props = {
  vehicles: LiveFleetVehicle[];
  selectedVanKey: string | null;
  showRouteLines: boolean;
  showStops: boolean;
  fitToken: number;
  focusToken: number;
  onSelectVan: (vanKey: string) => void;
};

const VAN_ICON_URL = "/assets/fitdog-track-van-marker.png";

function hasCoords(lat: number | null | undefined, lng: number | null | undefined) {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function stopColor(stop: LiveFleetStop): string {
  if (stop.isNext || stop.status === "current") return "#f97316";
  if (stop.status === "completed") return "#22c55e";
  if (stop.status === "exception") return "#ef4444";
  if (stop.direction === "pickup") return "#38bdf8";
  if (stop.direction === "dropoff") return "#a78bfa";
  if (stop.stopKind === "depot_start" || stop.stopKind === "depot_end") return "#f8fafc";
  return "#94a3b8";
}

function statusAccent(vehicle: LiveFleetVehicle): string {
  if (vehicle.freshness === "unavailable" || vehicle.telemetry?.status === "offline") return "#ef4444";
  if (vehicle.freshness === "stale" || vehicle.telemetry?.status === "stale") return "#f59e0b";
  if (vehicle.telemetry?.status === "moving") return "#22c55e";
  if (vehicle.telemetry?.status === "parked") return "#38bdf8";
  return "#f97316";
}

export function LiveFleetMap({
  vehicles,
  selectedVanKey,
  showRouteLines,
  showStops,
  fitToken,
  focusToken,
  onSelectVan
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const focusRingRef = useRef<import("leaflet").CircleMarker | null>(null);
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const lastFitTokenRef = useRef(0);
  const lastFocusTokenRef = useRef(0);
  const onSelectRef = useRef(onSelectVan);

  useEffect(() => {
    onSelectRef.current = onSelectVan;
  }, [onSelectVan]);

  const selected = useMemo(
    () => vehicles.find((v) => v.vanKey === selectedVanKey) ?? null,
    [vehicles, selectedVanKey]
  );

  const selectedHasPosition = Boolean(
    selected && hasCoords(selected.telemetry?.latitude, selected.telemetry?.longitude)
  );

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      focusRingRef.current = null;
      markers.clear();
    };
  }, []);

  // Keep Leaflet sized when the fleet list / detail panel changes layout.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const resize = () => {
      const map = mapRef.current;
      if (!map) return;
      map.invalidateSize({ animate: false });
    };
    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(resize);
    });
    observer.observe(el);
    window.addEventListener("resize", resize);
    const boot = window.setTimeout(resize, 50);
    return () => {
      observer.disconnect();
      window.clearTimeout(boot);
      window.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!containerRef.current) return;
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true
        }).setView([34.03, -118.45], 12);

        L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

        // Dark ops basemap — matches RuffOps admin chrome.
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
          attribution: "&copy; OpenStreetMap &copy; CARTO"
        }).addTo(mapRef.current);

        layerRef.current = L.layerGroup().addTo(mapRef.current);

        mapRef.current.on("dragstart", () => {
          userInteractedRef.current = true;
        });
        mapRef.current.on("zoomstart", () => {
          // Ignore programmatic zoom/fly from our own focus logic.
        });
        mapRef.current.on("dragend", () => {
          userInteractedRef.current = true;
        });

        // First paint often happens before the flex layout settles.
        window.requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }));
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;

      map.invalidateSize({ animate: false });
      layer.clearLayers();
      focusRingRef.current = null;

      const activeKeys = new Set<string>();

      for (const vehicle of vehicles) {
        const lat = vehicle.telemetry?.latitude;
        const lng = vehicle.telemetry?.longitude;
        if (!hasCoords(lat, lng)) continue;
        activeKeys.add(vehicle.vanKey);

        const stale = vehicle.freshness === "stale" || vehicle.telemetry?.status === "stale";
        const offline = vehicle.freshness === "unavailable" || vehicle.telemetry?.status === "offline";
        const heading =
          !stale &&
          !offline &&
          vehicle.telemetry?.heading != null &&
          Number.isFinite(vehicle.telemetry.heading)
            ? vehicle.telemetry.heading
            : null;
        const accent = statusAccent(vehicle);
        const selectedStyle = vehicle.vanKey === selectedVanKey;
        const size = selectedStyle ? 72 : 56;
        const opacity = offline ? 0.35 : stale ? 0.65 : 1;

        const icon = L.divIcon({
          className: "live-fleet-van-marker",
          html: `<div class="lf-van" style="--lf-accent:${accent};width:${size}px;height:${size}px;opacity:${opacity}">
            <span class="lf-van__pulse" style="display:${selectedStyle ? "block" : "none"}"></span>
            <img src="${VAN_ICON_URL}" alt="" width="${size}" height="${size}" style="transform:${
              heading == null ? "none" : `rotate(${heading}deg)`
            };transform-origin:50% 70%" />
            <div class="lf-van__label">${vehicle.displayName}</div>
          </div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size * 0.85]
        });

        const existing = markersRef.current.get(vehicle.vanKey);
        if (existing) {
          existing.setLatLng([lat!, lng!]);
          existing.setIcon(icon);
          existing.setZIndexOffset(selectedStyle ? 1000 : 400);
          existing.off("click");
          existing.on("click", () => onSelectRef.current(vehicle.vanKey));
          existing.addTo(layer);
        } else {
          const marker = L.marker([lat!, lng!], {
            icon,
            zIndexOffset: selectedStyle ? 1000 : 400
          }).addTo(layer);
          marker.on("click", () => onSelectRef.current(vehicle.vanKey));
          markersRef.current.set(vehicle.vanKey, marker);
        }
      }

      for (const [key, marker] of markersRef.current) {
        if (!activeKeys.has(key)) {
          marker.remove();
          markersRef.current.delete(key);
        }
      }

      if (selected && hasCoords(selected.telemetry?.latitude, selected.telemetry?.longitude)) {
        focusRingRef.current = L.circleMarker(
          [selected.telemetry!.latitude!, selected.telemetry!.longitude!],
          {
            radius: 28,
            color: statusAccent(selected),
            weight: 2,
            fillColor: statusAccent(selected),
            fillOpacity: 0.12,
            opacity: 0.9
          }
        ).addTo(layer);
      }

      if (selected?.route && (showRouteLines || showStops)) {
        const stops = selected.route.stops.filter((s) => hasCoords(s.latitude, s.longitude));
        if (showRouteLines && stops.length >= 2) {
          const completed = stops.filter((s) => s.status === "completed" || s.status === "skipped");
          const remaining = stops.filter((s) => s.status !== "completed" && s.status !== "skipped");
          if (completed.length >= 2) {
            L.polyline(
              completed.map((s) => [s.latitude!, s.longitude!] as [number, number]),
              { color: "#22c55e", weight: 4, opacity: 0.75 }
            ).addTo(layer);
          }
          if (remaining.length >= 1) {
            const start =
              hasCoords(selected.telemetry?.latitude, selected.telemetry?.longitude) &&
              selected.freshness !== "unavailable"
                ? ([[selected.telemetry!.latitude!, selected.telemetry!.longitude!]] as [number, number][])
                : [];
            const pts = [
              ...start,
              ...remaining.map((s) => [s.latitude!, s.longitude!] as [number, number])
            ];
            if (pts.length >= 2) {
              L.polyline(pts, {
                color: "#f97316",
                weight: 4,
                opacity: 0.9,
                dashArray: "10 8"
              }).addTo(layer);
            }
          }
        }

        if (showStops) {
          for (const stop of stops) {
            const color = stopColor(stop);
            const marker = L.circleMarker([stop.latitude!, stop.longitude!], {
              radius: stop.isNext ? 10 : 6,
              color: "#0b1220",
              weight: 2,
              fillColor: color,
              fillOpacity: 0.95
            }).addTo(layer);
            marker.bindTooltip(
              `<div style="font:600 12px/1.3 ui-sans-serif,system-ui"><strong>${stop.label}</strong><br/>${
                stop.direction
              } · ${stop.status}${stop.address ? `<br/><span style="opacity:.8">${stop.address}</span>` : ""}</div>`,
              { direction: "top", opacity: 0.95 }
            );
          }
        }
      }

      const shouldFit = fitToken !== lastFitTokenRef.current || !initialFitDoneRef.current;
      const shouldFocus = focusToken !== lastFocusTokenRef.current && Boolean(selectedVanKey);

      if (shouldFit) {
        lastFitTokenRef.current = fitToken;
        const points: [number, number][] = [];
        for (const vehicle of vehicles) {
          if (hasCoords(vehicle.telemetry?.latitude, vehicle.telemetry?.longitude)) {
            points.push([vehicle.telemetry!.latitude!, vehicle.telemetry!.longitude!]);
          }
        }
        if (points.length) {
          map.fitBounds(L.latLngBounds(points), { padding: [72, 72], maxZoom: 14 });
          initialFitDoneRef.current = true;
          userInteractedRef.current = false;
        }
      }

      if (shouldFocus && selected && hasCoords(selected.telemetry?.latitude, selected.telemetry?.longitude)) {
        lastFocusTokenRef.current = focusToken;
        userInteractedRef.current = false;
        map.flyTo([selected.telemetry!.latitude!, selected.telemetry!.longitude!], Math.max(map.getZoom(), 15), {
          animate: true,
          duration: 0.85
        });
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [vehicles, selectedVanKey, showRouteLines, showStops, fitToken, focusToken, selected]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b1220]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <style>{`
        .live-fleet-van-marker {
          background: transparent !important;
          border: none !important;
        }
        .lf-van {
          position: relative;
          filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55));
        }
        .lf-van img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .lf-van__pulse {
          position: absolute;
          inset: 8% 8% 18% 8%;
          border-radius: 999px;
          border: 2px solid var(--lf-accent);
          animation: lf-pulse 1.6s ease-out infinite;
          pointer-events: none;
        }
        .lf-van__label {
          position: absolute;
          left: 50%;
          bottom: -2px;
          transform: translateX(-50%);
          font: 700 10px/1 ui-sans-serif, system-ui, sans-serif;
          background: #0b1220;
          color: #fff;
          padding: 3px 7px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        }
        @keyframes lf-pulse {
          0% { transform: scale(0.85); opacity: 0.95; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        .leaflet-control-zoom {
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 12px !important;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }
        .leaflet-control-zoom a {
          background: #0b1220 !important;
          color: #fff !important;
          border-bottom-color: rgba(255, 255, 255, 0.08) !important;
          width: 34px !important;
          height: 34px !important;
          line-height: 34px !important;
        }
        .leaflet-control-attribution {
          background: rgba(11, 18, 32, 0.72) !important;
          color: rgba(255, 255, 255, 0.55) !important;
          max-width: 46%;
        }
        .leaflet-control-attribution a {
          color: rgba(255, 255, 255, 0.75) !important;
        }
      `}</style>

      {selected ? (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[min(420px,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-[#0b1220]/88 px-3.5 py-2.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: statusAccent(selected), boxShadow: `0 0 12px ${statusAccent(selected)}` }}
            />
            <div className="text-sm font-semibold text-white">{selected.displayName}</div>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
              {selected.telemetry?.status || "unknown"}
            </span>
          </div>
          <div className="mt-1 text-xs text-white/70">
            {selectedHasPosition
              ? selected.telemetry?.address ||
                `${selected.telemetry!.latitude!.toFixed(5)}, ${selected.telemetry!.longitude!.toFixed(5)}`
              : "No map coordinates for this van yet"}
          </div>
          <div className="mt-0.5 text-[11px] text-white/45">{selected.freshnessLabel}</div>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-2xl border border-white/10 bg-[#0b1220]/80 px-3.5 py-2 text-xs text-white/65 shadow-xl backdrop-blur-md">
          Select a van to focus live position on the map
        </div>
      )}

      {selected && !selectedHasPosition ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[500] flex justify-center px-4">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-100 shadow-lg backdrop-blur">
            GPS coordinates unavailable — showing address only until the next Samsara update
          </div>
        </div>
      ) : null}
    </div>
  );
}
