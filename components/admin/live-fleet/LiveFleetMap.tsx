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
  if (stop.isNext || stop.status === "current") return "#ea580c";
  if (stop.status === "completed") return "#16a34a";
  if (stop.status === "exception") return "#dc2626";
  if (stop.direction === "pickup") return "#2563eb";
  if (stop.direction === "dropoff") return "#7c3aed";
  if (stop.stopKind === "depot_start" || stop.stopKind === "depot_end") return "#0f172a";
  return "#64748b";
}

export function LiveFleetMap({
  vehicles,
  selectedVanKey,
  showRouteLines,
  showStops,
  fitToken,
  onSelectVan
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const lastFitTokenRef = useRef(0);
  const onSelectRef = useRef(onSelectVan);

  useEffect(() => {
    onSelectRef.current = onSelectVan;
  }, [onSelectVan]);

  const selected = useMemo(
    () => vehicles.find((v) => v.vanKey === selectedVanKey) ?? null,
    [vehicles, selectedVanKey]
  );

  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      markers.clear();
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
          zoomControl: true,
          attributionControl: true
        }).setView([34.03, -118.45], 11);

        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap &copy; CARTO"
        }).addTo(mapRef.current);

        layerRef.current = L.layerGroup().addTo(mapRef.current);

        mapRef.current.on("dragstart", () => {
          userInteractedRef.current = true;
        });
        mapRef.current.on("zoomstart", () => {
          userInteractedRef.current = true;
        });
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const activeKeys = new Set<string>();

      for (const vehicle of vehicles) {
        const lat = vehicle.telemetry?.latitude;
        const lng = vehicle.telemetry?.longitude;
        if (!hasCoords(lat, lng)) continue;
        activeKeys.add(vehicle.vanKey);

        const stale = vehicle.freshness === "stale" || vehicle.telemetry?.status === "stale";
        const heading =
          !stale && vehicle.telemetry?.heading != null && Number.isFinite(vehicle.telemetry.heading)
            ? vehicle.telemetry.heading
            : null;

        const opacity = stale ? 0.55 : 1;
        const selectedStyle = vehicle.vanKey === selectedVanKey;
        const icon = L.divIcon({
          className: "live-fleet-van-marker",
          html: `<div style="position:relative;width:56px;height:56px;opacity:${opacity};filter:${
            selectedStyle
              ? "drop-shadow(0 0 6px rgba(234,88,12,.9))"
              : "drop-shadow(0 2px 6px rgba(0,0,0,.35))"
          }">
            <img src="${VAN_ICON_URL}" alt="" width="56" height="56" style="display:block;transform:${
              heading == null ? "none" : `rotate(${heading}deg)`
            };transform-origin:50% 70%" />
            <div style="position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);font:700 10px/1 ui-sans-serif,system-ui;background:#111;color:#fff;padding:2px 5px;border-radius:999px;white-space:nowrap">${
              vehicle.displayName
            }</div>
          </div>`,
          iconSize: [56, 56],
          iconAnchor: [28, 48]
        });

        const existing = markersRef.current.get(vehicle.vanKey);
        if (existing) {
          existing.setLatLng([lat!, lng!]);
          existing.setIcon(icon);
          existing.off("click");
          existing.on("click", () => onSelectRef.current(vehicle.vanKey));
          existing.addTo(layer);
        } else {
          const marker = L.marker([lat!, lng!], { icon, zIndexOffset: 500 }).addTo(layer);
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

      if (selected?.route && (showRouteLines || showStops)) {
        const stops = selected.route.stops.filter((s) => hasCoords(s.latitude, s.longitude));
        if (showRouteLines && stops.length >= 2) {
          const completed = stops.filter((s) => s.status === "completed" || s.status === "skipped");
          const remaining = stops.filter((s) => s.status !== "completed" && s.status !== "skipped");
          if (completed.length >= 2) {
            L.polyline(
              completed.map((s) => [s.latitude!, s.longitude!] as [number, number]),
              { color: "#16a34a", weight: 4, opacity: 0.7 }
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
              L.polyline(pts, { color: "#ea580c", weight: 4, opacity: 0.85, dashArray: "8 8" }).addTo(
                layer
              );
            }
          }
        }

        if (showStops) {
          for (const stop of stops) {
            const color = stopColor(stop);
            const marker = L.circleMarker([stop.latitude!, stop.longitude!], {
              radius: stop.isNext ? 9 : 6,
              color: "#fff",
              weight: 2,
              fillColor: color,
              fillOpacity: 0.95
            }).addTo(layer);
            marker.bindTooltip(
              `<strong>${stop.label}</strong><br/>${stop.direction} · ${stop.status}${
                stop.address ? `<br/>${stop.address}` : ""
              }`,
              { direction: "top" }
            );
          }
        }
      }

      const shouldFit = fitToken !== lastFitTokenRef.current || !initialFitDoneRef.current;
      if (shouldFit) {
        lastFitTokenRef.current = fitToken;
        const points: [number, number][] = [];
        for (const vehicle of vehicles) {
          if (hasCoords(vehicle.telemetry?.latitude, vehicle.telemetry?.longitude)) {
            points.push([vehicle.telemetry!.latitude!, vehicle.telemetry!.longitude!]);
          }
        }
        if (selectedVanKey && selected?.route && showStops) {
          for (const stop of selected.route.stops) {
            if (hasCoords(stop.latitude, stop.longitude)) {
              points.push([stop.latitude!, stop.longitude!]);
            }
          }
        }
        if (points.length) {
          map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 14 });
          initialFitDoneRef.current = true;
          userInteractedRef.current = false;
        }
      } else if (
        selectedVanKey &&
        selected &&
        hasCoords(selected.telemetry?.latitude, selected.telemetry?.longitude) &&
        !userInteractedRef.current
      ) {
        map.panTo([selected.telemetry!.latitude!, selected.telemetry!.longitude!], { animate: true });
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [vehicles, selectedVanKey, showRouteLines, showStops, fitToken, selected]);

  return <div ref={containerRef} className="h-full w-full min-h-[420px] bg-[#e8eef5]" />;
}
