import type { LiveFreshness, LiveGpsStatus } from "@/lib/live-fleet/types";

/** Treat GPS older than this as stale (stop movement animation). */
export const GPS_STALE_MS = 3 * 60 * 1000;
/** Below this age → "live". */
export const GPS_LIVE_MS = 45 * 1000;
/** Speeds at or above this count as moving (mph). */
export const MOVING_SPEED_MPH = 1;

export function ageMs(timestamp: string | null | undefined, now = Date.now()): number | null {
  if (!timestamp) return null;
  const t = Date.parse(timestamp);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, now - t);
}

export function classifyGpsStatus(params: {
  latitude: number | null;
  longitude: number | null;
  speedMph: number | null;
  gpsTimestamp: string | null;
  now?: number;
}): LiveGpsStatus {
  const { latitude, longitude, speedMph, gpsTimestamp } = params;
  const now = params.now ?? Date.now();
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return "offline";
  }
  const age = ageMs(gpsTimestamp, now);
  if (age == null || age >= GPS_STALE_MS) return "stale";
  const speed = speedMph == null || !Number.isFinite(speedMph) ? 0 : speedMph;
  return speed >= MOVING_SPEED_MPH ? "moving" : "parked";
}

export function classifyFreshness(params: {
  gpsTimestamp: string | null;
  hasPosition: boolean;
  now?: number;
}): { freshness: LiveFreshness; label: string } {
  const now = params.now ?? Date.now();
  if (!params.hasPosition) {
    return { freshness: "unavailable", label: "GPS unavailable" };
  }
  const age = ageMs(params.gpsTimestamp, now);
  if (age == null) {
    return { freshness: "unavailable", label: "GPS timestamp unknown" };
  }
  if (age < GPS_LIVE_MS) {
    const sec = Math.max(1, Math.round(age / 1000));
    return { freshness: "live", label: `Updated ${sec} sec ago` };
  }
  if (age < GPS_STALE_MS) {
    const min = Math.max(1, Math.round(age / 60000));
    return { freshness: "delayed", label: `Updated ${min} min ago` };
  }
  const min = Math.max(1, Math.round(age / 60000));
  return { freshness: "stale", label: `Last update ${min} min ago` };
}

export function formatRelativeUpdate(timestamp: string | null | undefined, now = Date.now()): string {
  const age = ageMs(timestamp, now);
  if (age == null) return "Unknown";
  if (age < 60000) return `${Math.max(1, Math.round(age / 1000))} sec ago`;
  if (age < 3600000) return `${Math.max(1, Math.round(age / 60000))} min ago`;
  const hrs = Math.max(1, Math.round(age / 3600000));
  return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
}
