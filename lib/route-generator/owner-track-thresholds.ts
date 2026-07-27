/** Owner live-tracking ETA thresholds (minutes). */
export const OWNER_ETA_ALERT_MINUTES = 15;
/** Show live van GPS on the public map at or below this ETA. */
export const OWNER_LIVE_MAP_MINUTES = 10;

export type OwnerTrackPhase = "waiting" | "en_route" | "nearby" | "live" | "arrived";

export function ownerTrackPhase(params: {
  status: string;
  etaMinutes: number | null;
}): OwnerTrackPhase {
  const { status, etaMinutes } = params;
  if (status === "arrived" || status === "completed") return "arrived";
  if (etaMinutes != null && etaMinutes <= OWNER_LIVE_MAP_MINUTES) return "live";
  if (etaMinutes != null && etaMinutes <= OWNER_ETA_ALERT_MINUTES) return "nearby";
  if (status === "en_route" || status === "arriving_15" || (etaMinutes != null && etaMinutes > OWNER_ETA_ALERT_MINUTES)) {
    return "en_route";
  }
  return "waiting";
}

/** 0–3 progress segments filled for the Uber-style bar. */
export function ownerTrackProgressStep(phase: OwnerTrackPhase): number {
  switch (phase) {
    case "waiting":
      return 0;
    case "en_route":
      return 1;
    case "nearby":
      return 2;
    case "live":
      return 3;
    case "arrived":
      return 4;
    default:
      return 0;
  }
}

export function shouldShowLiveVehicle(etaMinutes: number | null, status: string): boolean {
  if (status === "arrived" || status === "completed") return true;
  return etaMinutes != null && etaMinutes <= OWNER_LIVE_MAP_MINUTES;
}

export function shouldSendEtaAlert(etaMinutes: number, alreadyNotified: boolean): boolean {
  return !alreadyNotified && etaMinutes <= OWNER_ETA_ALERT_MINUTES;
}

export function formatArriveAtLabel(
  etaMinutes: number | null,
  now = new Date(),
  timeZone = "America/Los_Angeles"
): string | null {
  if (etaMinutes == null || !Number.isFinite(etaMinutes)) return null;
  const arrive = new Date(now.getTime() + Math.max(0, etaMinutes) * 60_000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(arrive);
}

export function ownerTrackHeadline(params: {
  phase: OwnerTrackPhase;
  direction: "pickup" | "dropoff";
  etaMinutes: number | null;
}): string {
  const { phase, direction, etaMinutes } = params;
  if (phase === "arrived") {
    return direction === "pickup" ? "Your Fitdog driver has arrived" : "Your dog is being dropped off";
  }
  if (phase === "live") {
    return direction === "pickup" ? "Driver is almost there…" : "Drop-off is almost there…";
  }
  if (phase === "nearby") {
    return direction === "pickup" ? "Driver is nearby…" : "Drop-off is nearby…";
  }
  if (phase === "en_route") {
    if (etaMinutes != null) return direction === "pickup" ? "Picking up your dog…" : "Bringing your dog home…";
    return direction === "pickup" ? "Driver is on the way" : "Drop-off is on the way";
  }
  return "Waiting for your Fitdog route";
}

export function ownerTrackHelper(params: {
  phase: OwnerTrackPhase;
  direction: "pickup" | "dropoff";
}): string {
  const { phase, direction } = params;
  if (phase === "arrived") return "Thanks for trusting Fitdog.";
  if (phase === "live") {
    return direction === "pickup"
      ? "Please be ready outside. Bring your phone and leash."
      : "Please be ready to meet your dog outside.";
  }
  if (phase === "nearby") {
    return "You’ll see the live van on the map when the driver is about 10 minutes away.";
  }
  if (phase === "en_route") {
    return "We’ll text you when the driver is about 15 minutes away.";
  }
  return "Your tracking link is ready. Live updates start once the route is moving.";
}
