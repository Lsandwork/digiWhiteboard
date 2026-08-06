"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Props = {
  stop: { lat: number; lng: number } | null;
  vehicle: { lat: number; lng: number; heading: number | null } | null;
  showLiveVehicle: boolean;
  vanLabel: string;
  callout: string;
};

/** Full-bleed live map: destination always visible; van only when ≤10 min out. */
export function OwnerLiveTrackMap({ stop, vehicle, showLiveVehicle, vanLabel, callout }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      if (!containerRef.current || !stop) return;
      const L = (await import("leaflet")).default;
      if (cancelled) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: true,
          scrollWheelZoom: false
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 19
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.CircleMarker) {
          map.removeLayer(layer);
        }
      });

      const destIcon = L.divIcon({
        className: "owner-track-dest-icon",
        html: `<div class="owner-track-dest-dot"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      L.marker([stop.lat, stop.lng], { icon: destIcon }).addTo(map);

      if (showLiveVehicle && vehicle) {
        const vanIcon = L.divIcon({
          className: "owner-track-van-icon",
          html: `
            <div class="owner-track-van-wrap">
              <div class="owner-track-van-callout">
                <span class="owner-track-van-callout__mark" aria-hidden="true"></span>
                <span class="owner-track-van-callout__text">
                  <strong>${escapeHtml(vanLabel)}</strong>
                  <em>${escapeHtml(callout)}</em>
                </span>
              </div>
              <div class="owner-track-van-pin" style="transform:rotate(${vehicle.heading ?? 0}deg)">➔</div>
            </div>
          `,
          iconSize: [160, 72],
          iconAnchor: [20, 58]
        });
        L.marker([vehicle.lat, vehicle.lng], { icon: vanIcon, zIndexOffset: 600 }).addTo(map);
        L.polyline(
          [
            [vehicle.lat, vehicle.lng],
            [stop.lat, stop.lng]
          ],
          { color: "#111827", weight: 4, opacity: 0.8, dashArray: "8 10" }
        ).addTo(map);
        map.fitBounds(
          L.latLngBounds([
            [vehicle.lat, vehicle.lng],
            [stop.lat, stop.lng]
          ]),
          { padding: [72, 72], maxZoom: 15 }
        );
      } else {
        map.setView([stop.lat, stop.lng], 14);
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [stop, vehicle, showLiveVehicle, vanLabel, callout]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (!stop) {
    return (
      <div className="owner-track-map-empty">
        <p>Waiting for stop location…</p>
      </div>
    );
  }

  return <div ref={containerRef} className="owner-track-map" />;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
