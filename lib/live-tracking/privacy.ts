import type { TrackingStatus } from "@/lib/live-tracking/status";
import { ownerStatusLabel, shouldExposeLiveLocation } from "@/lib/live-tracking/status";
import { getGpsStaleSeconds, isTrackingDriverNameEnabled } from "@/lib/live-tracking/flags";

export type SessionRow = {
  id: string;
  status: TrackingStatus;
  direction: "pickup" | "dropoff";
  dog_names: string[] | null;
  van_display_name: string | null;
  van_key: string | null;
  stop_latitude: number | null;
  stop_longitude: number | null;
  stop_address_masked: string | null;
  vehicle_latitude: number | null;
  vehicle_longitude: number | null;
  vehicle_heading: number | null;
  vehicle_accuracy_meters: number | null;
  last_gps_at: string | null;
  current_eta_at: string | null;
  eta_source: string | null;
  live_tracking_enabled_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  emergency_privacy_mode: boolean | null;
  arrived_at: string | null;
  operating_date: string | null;
  health_status: string | null;
};

export type OwnerSafeSnapshot = {
  sessionId: string;
  status: TrackingStatus;
  statusLabel: string;
  direction: "pickup" | "dropoff";
  dogNames: string[];
  vanDisplayName: string;
  driverDisplayName: string;
  etaAt: string | null;
  etaSource: string | null;
  etaLabel: string;
  liveLocationVisible: boolean;
  vehicle: null | {
    latitude: number;
    longitude: number;
    heading: number | null;
    accuracyMeters: number | null;
    lastGpsAt: string | null;
    stale: boolean;
  };
  home: {
    latitude: number | null;
    longitude: number | null;
    label: string;
  };
  routeLine: Array<{ lat: number; lng: number }>;
  lastUpdatedAt: string;
  contactPhone: string | null;
  completed: boolean;
  showUpdatingLocation: boolean;
};

function minutesUntil(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  return Math.round(ms / 60000);
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***-***-${digits.slice(-4)}`;
}

export function isGpsStale(lastGpsAt: string | null, now = new Date(), staleSeconds = getGpsStaleSeconds()) {
  if (!lastGpsAt) return true;
  return now.getTime() - new Date(lastGpsAt).getTime() > staleSeconds * 1000;
}

export function buildOwnerSafeSnapshot(params: {
  session: SessionRow;
  routeLine?: Array<{ lat: number; lng: number }>;
  contactPhone?: string | null;
  driverFirstName?: string | null;
  isNextStopOrWithinThreshold?: boolean;
  now?: Date;
}): OwnerSafeSnapshot {
  const now = params.now ?? new Date();
  const session = params.session;
  const gpsStale = isGpsStale(session.last_gps_at, now);
  const liveLocationVisible = shouldExposeLiveLocation({
    status: session.status,
    liveTrackingEnabledAt: session.live_tracking_enabled_at,
    completedAt: session.completed_at,
    cancelledAt: session.cancelled_at,
    emergencyPrivacyMode: Boolean(session.emergency_privacy_mode),
    gpsStale,
    isNextStopOrWithinThreshold: params.isNextStopOrWithinThreshold !== false
  });

  const minutes = minutesUntil(session.current_eta_at, now);
  let etaLabel = "Arrival time updating…";
  if (minutes != null) {
    if (minutes <= 0) etaLabel = "Arriving now";
    else if (minutes === 1) etaLabel = "Arriving in about 1 minute";
    else etaLabel = `Arriving in about ${minutes} minutes`;
  } else if (session.status === "scheduled" || session.status === "route_assigned") {
    etaLabel = "Live tracking will open when your Fitdog van gets closer";
  }

  const showDriverName = isTrackingDriverNameEnabled() && Boolean(params.driverFirstName);
  const completed = Boolean(
    session.completed_at ||
      session.status === "completed" ||
      session.status === "picked_up" ||
      session.status === "dropped_off"
  );

  return {
    sessionId: session.id,
    status: session.status,
    statusLabel: ownerStatusLabel(session.status, session.direction),
    direction: session.direction,
    dogNames: session.dog_names ?? [],
    vanDisplayName: session.van_display_name || "Fitdog Van",
    driverDisplayName: showDriverName ? String(params.driverFirstName) : "Your Fitdog Driver",
    etaAt: session.current_eta_at,
    etaSource: session.eta_source,
    etaLabel,
    liveLocationVisible,
    vehicle:
      liveLocationVisible &&
      session.vehicle_latitude != null &&
      session.vehicle_longitude != null
        ? {
            latitude: session.vehicle_latitude,
            longitude: session.vehicle_longitude,
            heading: session.vehicle_heading,
            accuracyMeters: session.vehicle_accuracy_meters,
            lastGpsAt: session.last_gps_at,
            stale: gpsStale
          }
        : null,
    home: {
      latitude: session.stop_latitude,
      longitude: session.stop_longitude,
      label: "Your stop"
    },
    routeLine: liveLocationVisible ? params.routeLine ?? [] : [],
    lastUpdatedAt: session.last_gps_at || now.toISOString(),
    contactPhone: params.contactPhone ?? null,
    completed,
    showUpdatingLocation: liveLocationVisible && gpsStale
  };
}

/** Ensure API payload never includes other stops / PII. */
export function assertOwnerPayloadSafe(payload: OwnerSafeSnapshot) {
  const json = JSON.stringify(payload);
  if (/samsara/i.test(json) && /api[_-]?token/i.test(json)) {
    throw new Error("Unsafe payload: provider credentials leaked");
  }
  if (/van[_\s-]*4/i.test(json)) {
    throw new Error("Unsafe payload: Van 4 referenced");
  }
}
