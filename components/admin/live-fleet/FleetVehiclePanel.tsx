"use client";

import { ExternalLink, X } from "lucide-react";
import type { LiveFleetVehicle } from "@/lib/live-fleet/types";
import { FleetRouteTimeline } from "@/components/admin/live-fleet/FleetRouteTimeline";

type Props = {
  vehicle: LiveFleetVehicle;
  samsaraDashboardUrl: string;
  onClose: () => void;
};

export function FleetVehiclePanel({ vehicle, samsaraDashboardUrl, onClose }: Props) {
  const route = vehicle.route;
  const speed =
    vehicle.telemetry?.speedMph != null && Number.isFinite(vehicle.telemetry.speedMph)
      ? `${Math.round(vehicle.telemetry.speedMph)} mph`
      : "Unavailable";

  return (
    <aside className="flex h-full w-full flex-col border-l border-admin-border bg-[#0b1220]/95 shadow-2xl backdrop-blur md:w-[380px]">
      <div className="flex items-start justify-between gap-3 border-b border-admin-border px-4 py-3">
        <div>
          <div className="text-lg font-semibold text-white">{vehicle.displayName}</div>
          <div className="text-sm text-admin-muted">
            {route?.serviceType || route?.routeName || "No route assigned"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-admin-border p-1.5 text-admin-muted hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {vehicle.telemetry?.simulated ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-100">
            Simulated GPS — not production telemetry
          </div>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Vehicle</h3>
          <dl className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1.5 text-sm">
            <dt className="text-admin-muted">Number</dt>
            <dd className="text-white">{vehicle.vehicleNumber || "—"}</dd>
            <dt className="text-admin-muted">Driver</dt>
            <dd className="text-white">{vehicle.driverName || "Unavailable"}</dd>
            <dt className="text-admin-muted">Speed</dt>
            <dd className="text-white">{speed}</dd>
            <dt className="text-admin-muted">Location</dt>
            <dd className="text-white">{vehicle.telemetry?.address || "Unavailable"}</dd>
            <dt className="text-admin-muted">GPS</dt>
            <dd className="text-white">{vehicle.freshnessLabel}</dd>
            <dt className="text-admin-muted">Status</dt>
            <dd className="capitalize text-white">{vehicle.telemetry?.status || "unknown"}</dd>
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Route</h3>
          {route ? (
            <>
              <dl className="grid grid-cols-[120px_1fr] gap-x-2 gap-y-1.5 text-sm">
                <dt className="text-admin-muted">Name</dt>
                <dd className="text-white">{route.routeName}</dd>
                <dt className="text-admin-muted">Service</dt>
                <dd className="text-white">{route.serviceType || route.serviceTypes.join(", ") || "—"}</dd>
                <dt className="text-admin-muted">Driver / hiker</dt>
                <dd className="text-white">{route.driverName || vehicle.driverName || "Unavailable"}</dd>
                <dt className="text-admin-muted">Progress</dt>
                <dd className="text-white">
                  {route.completedStops} / {route.totalStops} stops · {route.progressPercent}%
                </dd>
              </dl>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-fitdog-orange"
                  style={{ width: `${Math.min(100, Math.max(0, route.progressPercent))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-admin-muted">No Route Generator route for this van today.</p>
          )}
        </section>

        {vehicle.nextStop ? (
          <section className="rounded-xl border border-admin-border bg-black/30 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-fitdog-orange">Next stop</h3>
            <div className="text-sm font-medium text-white">
              {vehicle.nextStop.dogName || vehicle.nextStop.destination || "Stop"}
            </div>
            <div className="mt-0.5 text-xs capitalize text-admin-muted">
              {vehicle.nextStop.stopType}
              {vehicle.nextStop.locationType ? ` · ${vehicle.nextStop.locationType}` : ""}
            </div>
            {vehicle.nextStop.destination ? (
              <div className="mt-1 text-xs text-admin-muted">{vehicle.nextStop.destination}</div>
            ) : null}
            {vehicle.nextStop.etaReliable && vehicle.nextStop.etaMinutes != null ? (
              <div className="mt-2 text-xs text-white">
                Approx. {vehicle.nextStop.etaMinutes} min
                {vehicle.nextStop.distanceMiles != null ? ` · ${vehicle.nextStop.distanceMiles} mi` : ""}
              </div>
            ) : (
              <div className="mt-2 text-xs text-admin-muted">ETA unavailable until GPS is fresh</div>
            )}
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">
            Dogs {route ? `(${route.dogs.length})` : ""}
          </h3>
          {route?.dogs.length ? (
            <ul className="space-y-2">
              {route.dogs.map((dog) => (
                <li key={`${dog.dogId || dog.dogName}`} className="flex items-center gap-2">
                  {dog.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dog.photoUrl}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-admin-muted">
                      {dog.dogName.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{dog.dogName}</div>
                    <div className="truncate text-[11px] text-admin-muted">
                      {dog.service || "—"}
                      {dog.timelineStatus ? ` · ${dog.timelineStatus}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-admin-muted">No dogs linked on today&apos;s route.</p>
          )}
        </section>

        {route?.stops.length ? (
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-admin-muted">Route timeline</h3>
            <FleetRouteTimeline stops={route.stops} />
          </section>
        ) : null}
      </div>

      <div className="border-t border-admin-border p-3">
        <a
          href={samsaraDashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-admin-border bg-white/5 px-3 py-2.5 text-sm font-medium text-white hover:bg-white/10"
        >
          Open in Samsara
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
}
