"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapPin } from "lucide-react";
import type { FitdogLocationsConfig } from "@/lib/route-generator/locations";
import "leaflet/dist/leaflet.css";

type MapStop = {
  id: string;
  routeId: string;
  sequence: number;
  stopKind: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  color: string;
  service?: string;
  locationType?: string;
  vanLabel?: string;
};

type MapRoute = {
  id: string;
  vanKey: string;
  direction: string;
  waveName: string;
  color: string;
  stops: MapStop[];
};

type Props = {
  routes: MapRoute[];
  selectedRouteId: string | null;
  locations?: FitdogLocationsConfig | null;
  onSelectRoute?: (routeId: string | null) => void;
};

function baseLabel(stopKind: string, label: string) {
  if (stopKind !== "depot_start" && stopKind !== "depot_end") return label;
  const trimmed = label.trim();
  if (!trimmed) return "Fitdog Westwood Hub";
  // Keep destination names (Kenneth Hahn Trail / Huntington Dog Beach) and full Fitdog labels.
  return trimmed;
}

export function RouteGeneratorMap({ routes, selectedRouteId, locations, onSelectRoute }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  const drawableRoutes = useMemo(
    () =>
      routes
        .map((route) => ({
          ...route,
          stops: route.stops.filter(
            (stop) =>
              Number.isFinite(stop.latitude) &&
              Number.isFinite(stop.longitude) &&
              Math.abs(stop.latitude) <= 90 &&
              Math.abs(stop.longitude) <= 180
          )
        }))
        .filter((route) => route.stops.length > 0),
    [routes]
  );

  const focusStops = useMemo(() => {
    if (selectedRouteId) {
      const selected = drawableRoutes.find((route) => route.id === selectedRouteId);
      if (selected?.stops.length) return selected.stops;
    }
    return drawableRoutes.flatMap((route) => route.stops);
  }, [drawableRoutes, selectedRouteId]);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!containerRef.current) return;
      const L = (await import("leaflet")).default;

      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: true,
          attributionControl: true
        }).setView([34.03, -118.45], 12);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(mapRef.current);

        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }

      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const bounds: import("leaflet").LatLngExpression[] = [];

      // Always show operational bases + outing destinations when coordinates exist.
      const baseColors: Record<string, string> = {
        hub: "#f15f2a",
        club: "#0ea5e9",
        kenneth_hahn: "#22c55e",
        huntington: "#a855f7"
      };
      for (const base of [
        locations?.hub,
        locations?.club,
        locations?.kenneth_hahn,
        locations?.huntington
      ].filter(Boolean)) {
        if (base?.latitude == null || base.longitude == null) continue;
        const latLng: import("leaflet").LatLngExpression = [base.latitude, base.longitude];
        bounds.push(latLng);
        const marker = L.circleMarker(latLng, {
          radius: 9,
          color: "#0f172a",
          weight: 2,
          fillColor: baseColors[base.key] || "#f15f2a",
          fillOpacity: 0.95
        }).bindPopup(
          `<strong>${base.name}</strong><br/>${base.address}${base.note ? `<br/><em>${base.note}</em>` : ""}`
        );
        layer.addLayer(marker);
        L.marker(latLng, {
          interactive: false,
          icon: L.divIcon({
            className: "rg-base-label",
            html: `<span style="background:#0f172a;color:#fff;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.25)">${base.name}</span>`,
            iconSize: [120, 20],
            iconAnchor: [-8, 10]
          })
        }).addTo(layer);
      }

      for (const route of drawableRoutes) {
        const selected = !selectedRouteId || selectedRouteId === route.id;
        const opacity = selected ? 1 : 0.22;
        const weight = selected && selectedRouteId ? 5 : 3;
        const latLngs = route.stops
          .slice()
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop) => [stop.latitude, stop.longitude] as [number, number]);

        if (latLngs.length >= 2) {
          const line = L.polyline(latLngs, {
            color: route.color,
            weight,
            opacity,
            lineJoin: "round"
          });
          line.on("click", () => onSelectRoute?.(route.id));
          layer.addLayer(line);
        }

        for (const stop of route.stops) {
          if (selectedRouteId && selectedRouteId !== route.id) continue;
          const latLng: import("leaflet").LatLngExpression = [stop.latitude, stop.longitude];
          bounds.push(latLng);
          const isBase = stop.stopKind === "depot_start" || stop.stopKind === "depot_end";
          const title = isBase ? baseLabel(stop.stopKind, stop.label) : `#${stop.sequence}`;
          const marker = L.circleMarker(latLng, {
            radius: isBase ? 8 : 6,
            color: "#0f172a",
            weight: 1.5,
            fillColor: route.color,
            fillOpacity: opacity
          }).bindPopup(
            `<strong>${title}</strong><br/>${stop.label}<br/>${stop.address || ""}<br/>${
              stop.locationType ? `${stop.locationType} · ` : ""
            }${stop.service ? `${stop.service}<br/>` : ""}<span style="color:${route.color}">${
              stop.vanLabel || route.vanKey.replace("van_", "Van ")
            } · ${route.direction} · stop ${stop.sequence}</span>`
          );
          marker.on("click", () => onSelectRoute?.(route.id));
          layer.addLayer(marker);
        }
      }

      if (focusStops.length) {
        const focusBounds = L.latLngBounds(focusStops.map((stop) => [stop.latitude, stop.longitude]));
        map.fitBounds(focusBounds.pad(0.2));
      } else if (bounds.length) {
        map.fitBounds(L.latLngBounds(bounds).pad(0.2));
      }

      // Leaflet needs a resize pass after layout/theme changes.
      window.setTimeout(() => map.invalidateSize(), 50);
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [drawableRoutes, focusStops, locations, onSelectRoute, selectedRouteId]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  if (!drawableRoutes.length) {
    return (
      <div className="grid h-[320px] place-items-center text-sm text-admin-muted">
        <div className="text-center">
          <MapPin className="mx-auto mb-2 h-5 w-5" />
          Pull a report and generate routes to plot stops on the map.
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[360px] w-full rounded-xl" />
      {selectedRouteId ? (
        <button
          type="button"
          className="admin-btn-secondary absolute right-3 top-3 z-[500] text-xs"
          onClick={() => onSelectRoute?.(null)}
        >
          Show all routes
        </button>
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex flex-wrap gap-2">
        {drawableRoutes.map((route) => (
          <span
            key={route.id}
            className="rounded-full px-2 py-1 text-[11px] font-semibold text-white"
            style={{ background: route.color }}
          >
            {route.vanKey.replace("van_", "Van ")} {route.direction}
          </span>
        ))}
      </div>
    </div>
  );
}
