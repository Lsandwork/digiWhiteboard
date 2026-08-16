import type {
  LiveFleetNextStop,
  LiveFleetStop,
  LiveRouteStopStatus,
  LiveStopDirection,
  LiveStopKind
} from "@/lib/live-fleet/types";
import { etaMinutesFromCoords } from "@/lib/route-generator/samsara-live";

export function haversineMiles(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function normalizeStopKind(raw: string | null | undefined): LiveStopKind {
  const value = String(raw || "").trim();
  if (value === "depot_start" || value === "depot_end" || value === "customer" || value === "manual") {
    return value;
  }
  return "other";
}

export function directionForStop(params: {
  stopKind: LiveStopKind;
  routeDirection: string | null | undefined;
  locationType?: string | null;
}): LiveStopDirection {
  if (params.stopKind === "depot_start") return "departure";
  if (params.stopKind === "depot_end") return "arrival";
  const loc = String(params.locationType || "").toUpperCase();
  if (loc === "OUTING" || loc === "HUB" || loc === "FITDOG") {
    // Outing destination mid-route still uses route wave direction for pickup/drop-off waves.
  }
  const dir = String(params.routeDirection || "").toLowerCase();
  if (dir === "pickup") return "pickup";
  if (dir === "dropoff") return "dropoff";
  return "other";
}

/**
 * Resolve stop completion from owner-tracking statuses when available.
 * Does not invent completion from timers.
 */
export function resolveStopStatuses(params: {
  stops: Array<{
    id: string;
    stopKind: LiveStopKind;
    sequence: number;
  }>;
  trackingByStopId: Map<string, string[]>;
}): Map<string, LiveRouteStopStatus> {
  const result = new Map<string, LiveRouteStopStatus>();
  const ordered = [...params.stops].sort((a, b) => a.sequence - b.sequence);

  const trackingComplete = (statuses: string[]) =>
    statuses.length > 0 &&
    statuses.every((s) => s === "arrived" || s === "completed" || s === "cancelled");
  const trackingActive = (statuses: string[]) =>
    statuses.some((s) => s === "en_route" || s === "arriving_15" || s === "pulling_up");
  const trackingException = (statuses: string[]) =>
    statuses.some((s) => s === "cancelled") && !trackingComplete(statuses);

  let foundCurrent = false;
  for (const stop of ordered) {
    const statuses = params.trackingByStopId.get(stop.id) ?? [];
    if (stop.stopKind === "depot_start") {
      // Completed once any later customer stop has tracking activity or is complete.
      const later = ordered.filter((s) => s.sequence > stop.sequence);
      const anyLater = later.some((s) => {
        const st = params.trackingByStopId.get(s.id) ?? [];
        return st.length > 0;
      });
      result.set(stop.id, anyLater ? "completed" : foundCurrent ? "upcoming" : "current");
      if (!anyLater) foundCurrent = true;
      continue;
    }
    if (stop.stopKind === "depot_end") {
      const customers = ordered.filter((s) => s.stopKind === "customer" || s.stopKind === "manual");
      const allDone =
        customers.length > 0 &&
        customers.every((s) => {
          const st = params.trackingByStopId.get(s.id) ?? [];
          return trackingComplete(st);
        });
      if (allDone) {
        result.set(stop.id, "completed");
      } else if (foundCurrent) {
        result.set(stop.id, "upcoming");
      } else {
        result.set(stop.id, customers.length === 0 ? "upcoming" : "upcoming");
      }
      continue;
    }

    if (statuses.length === 0) {
      if (!foundCurrent) {
        result.set(stop.id, "current");
        foundCurrent = true;
      } else {
        result.set(stop.id, "upcoming");
      }
      continue;
    }
    if (trackingException(statuses)) {
      result.set(stop.id, "exception");
      continue;
    }
    if (trackingComplete(statuses)) {
      result.set(stop.id, statuses.every((s) => s === "cancelled") ? "skipped" : "completed");
      continue;
    }
    if (trackingActive(statuses) || !foundCurrent) {
      result.set(stop.id, "current");
      foundCurrent = true;
      continue;
    }
    result.set(stop.id, "upcoming");
  }

  // Ensure at most one current: first non-completed wins already; if all completed, mark depot_end current→completed.
  return result;
}

export function computeRouteProgress(stops: LiveFleetStop[]): {
  completedStops: number;
  remainingStops: number;
  totalStops: number;
  progressPercent: number;
  routeStatus: "active" | "complete" | "no_route" | "unknown";
} {
  const totalStops = stops.length;
  if (!totalStops) {
    return {
      completedStops: 0,
      remainingStops: 0,
      totalStops: 0,
      progressPercent: 0,
      routeStatus: "no_route"
    };
  }
  const completedStops = stops.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const remainingStops = Math.max(0, totalStops - completedStops);
  const progressPercent = Math.round((completedStops / totalStops) * 100);
  return {
    completedStops,
    remainingStops,
    totalStops,
    progressPercent,
    routeStatus: remainingStops === 0 ? "complete" : "active"
  };
}

export function findNextStop(stops: LiveFleetStop[]): LiveFleetStop | null {
  const current = stops.find((s) => s.isNext || s.status === "current");
  if (current) return current;
  return stops.find((s) => s.status === "upcoming") ?? null;
}

export function buildNextStopInfo(params: {
  stop: LiveFleetStop | null;
  vehicle: { lat: number; lng: number; speedMph: number | null } | null;
  gpsFresh: boolean;
}): LiveFleetNextStop | null {
  const stop = params.stop;
  if (!stop) return null;
  const dogName = stop.dogNames[0] ?? (stop.stopKind.startsWith("depot") ? null : stop.label);
  let etaMinutes: number | null = null;
  let distanceMiles: number | null = null;
  let etaReliable = false;
  if (
    params.gpsFresh &&
    params.vehicle &&
    stop.latitude != null &&
    stop.longitude != null &&
    Number.isFinite(stop.latitude) &&
    Number.isFinite(stop.longitude)
  ) {
    distanceMiles = Math.round(haversineMiles(params.vehicle, { lat: stop.latitude, lng: stop.longitude }) * 10) / 10;
    etaMinutes = etaMinutesFromCoords(
      params.vehicle,
      { lat: stop.latitude, lng: stop.longitude },
      params.vehicle.speedMph && params.vehicle.speedMph > 5 ? params.vehicle.speedMph : 18
    );
    etaReliable = true;
  }
  return {
    stopId: stop.id,
    dogName,
    stopType: stop.direction,
    destination: stop.address || stop.label,
    locationType: stop.locationType,
    etaMinutes,
    distanceMiles,
    etaReliable
  };
}
