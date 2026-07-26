"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type Props = {
  stop: { lat: number; lng: number } | null;
  vehicle: { lat: number; lng: number; heading: number | null } | null;
};

/** Uber Eats-style live map: route line, pulsing destination, moving van marker. */
export function OwnerLiveTrackMap({ stop, vehicle }: Props) {
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
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
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
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:999px;background:#111;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      L.marker([stop.lat, stop.lng], { icon: destIcon }).addTo(map);

      if (vehicle) {
        const vanIcon = L.divIcon({
          className: "",
          html: `<div style="transform:rotate(${vehicle.heading ?? 0}deg);width:34px;height:34px;border-radius:999px;background:#f15f2a;border:3px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;font-weight:800">➔</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        });
        L.marker([vehicle.lat, vehicle.lng], { icon: vanIcon }).addTo(map);
        L.polyline(
          [
            [vehicle.lat, vehicle.lng],
            [stop.lat, stop.lng]
          ],
          { color: "#111827", weight: 5, opacity: 0.85, dashArray: "10 10" }
        ).addTo(map);
        map.fitBounds(
          L.latLngBounds([
            [vehicle.lat, vehicle.lng],
            [stop.lat, stop.lng]
          ]),
          { padding: [48, 48], maxZoom: 15 }
        );
      } else {
        map.setView([stop.lat, stop.lng], 14);
      }
    }

    void setup();
    return () => {
      cancelled = true;
    };
  }, [stop, vehicle]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (!stop) {
    return (
      <div className="flex h-full items-center justify-center bg-[#e8eef5] text-sm text-neutral-500">
        Waiting for stop location…
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
