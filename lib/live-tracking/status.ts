export const TRACKING_STATUSES = [
  "scheduled",
  "route_assigned",
  "preparing",
  "on_the_way",
  "thirty_minutes_away",
  "live_tracking_available",
  "fifteen_minutes_away",
  "five_minutes_away",
  "arriving",
  "arrived",
  "picked_up",
  "dropped_off",
  "completed",
  "delayed",
  "cancelled",
  "tracking_unavailable",
  "skipped",
  "failed"
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export type ThresholdEvent =
  | "notice_30"
  | "live_15"
  | "final_5"
  | "arrived"
  | "completed"
  | "delay"
  | "cancelled"
  | "skipped";

export type ThresholdState = {
  status: TrackingStatus;
  threshold30Sent: boolean;
  threshold15Sent: boolean;
  threshold5Sent: boolean;
  arrivedNotified: boolean;
  completedNotified: boolean;
  delayNotified: boolean;
  liveTrackingEnabled: boolean;
  minutesAway: number | null;
  direction: "pickup" | "dropoff";
};

export type ThresholdDecision = {
  nextStatus: TrackingStatus;
  events: ThresholdEvent[];
  enableLiveTracking: boolean;
  reason: string;
};

/**
 * Idempotent threshold state machine with hysteresis.
 * Once a threshold fires, it does not re-fire if ETA oscillates.
 */
export function evaluateThresholds(
  state: ThresholdState,
  options?: {
    finalAlertEnabled?: boolean;
    delayIncreaseMinutes?: number;
    previousMinutesAway?: number | null;
  }
): ThresholdDecision {
  const finalEnabled = options?.finalAlertEnabled !== false;
  const events: ThresholdEvent[] = [];
  let nextStatus = state.status;
  let enableLiveTracking = state.liveTrackingEnabled;

  if (
    state.status === "cancelled" ||
    state.status === "completed" ||
    state.status === "picked_up" ||
    state.status === "dropped_off" ||
    state.status === "skipped" ||
    state.status === "failed"
  ) {
    return {
      nextStatus: state.status,
      events: [],
      enableLiveTracking: false,
      reason: "terminal"
    };
  }

  const minutes = state.minutesAway;

  if (minutes != null && minutes <= 30 && !state.threshold30Sent) {
    events.push("notice_30");
    nextStatus = "thirty_minutes_away";
  }

  if (minutes != null && minutes <= 15 && !state.threshold15Sent) {
    events.push("live_15");
    enableLiveTracking = true;
    nextStatus = "fifteen_minutes_away";
  }

  if (finalEnabled && minutes != null && minutes <= 5 && !state.threshold5Sent && state.threshold15Sent) {
    events.push("final_5");
    nextStatus = "five_minutes_away";
  }

  if (
    options?.previousMinutesAway != null &&
    minutes != null &&
    state.threshold30Sent &&
    !state.delayNotified &&
    minutes - options.previousMinutesAway >= (options.delayIncreaseMinutes ?? 15)
  ) {
    events.push("delay");
    nextStatus = "delayed";
  }

  if (enableLiveTracking && nextStatus === "scheduled") {
    nextStatus = "live_tracking_available";
  }

  if (minutes != null && minutes <= 30 && !events.includes("notice_30") && !state.threshold30Sent) {
    // unreachable; kept for clarity
  }

  if (state.threshold30Sent && nextStatus === "scheduled") {
    nextStatus = "on_the_way";
  }

  return {
    nextStatus,
    events,
    enableLiveTracking,
    reason: events.length ? events.join(",") : "no_change"
  };
}

export function ownerStatusLabel(status: TrackingStatus, direction: "pickup" | "dropoff"): string {
  switch (status) {
    case "scheduled":
    case "route_assigned":
    case "preparing":
      return "Transportation scheduled";
    case "on_the_way":
    case "thirty_minutes_away":
      return "Your Fitdog van is on the way";
    case "live_tracking_available":
    case "fifteen_minutes_away":
      return direction === "pickup" ? "Your Fitdog van is nearby" : "Heading home with Fitdog";
    case "five_minutes_away":
    case "arriving":
      return "Your Fitdog van is arriving";
    case "arrived":
      return direction === "pickup" ? "Your Fitdog driver has arrived" : "Your Fitdog van has arrived home";
    case "picked_up":
      return "Picked up and on the way";
    case "dropped_off":
    case "completed":
      return direction === "pickup" ? "Pickup complete" : "Drop-off complete";
    case "delayed":
      return "Your Fitdog van is running a little behind";
    case "cancelled":
      return "Transportation cancelled";
    case "skipped":
    case "tracking_unavailable":
      return "We’re updating your transportation details";
    case "failed":
      return "Please contact Fitdog for assistance";
    default:
      return "Transportation update";
  }
}

export function shouldExposeLiveLocation(params: {
  status: TrackingStatus;
  liveTrackingEnabledAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  emergencyPrivacyMode: boolean;
  gpsStale: boolean;
  isNextStopOrWithinThreshold: boolean;
}): boolean {
  if (params.emergencyPrivacyMode) return false;
  if (params.cancelledAt || params.completedAt) return false;
  if (!params.liveTrackingEnabledAt) return false;
  if (!params.isNextStopOrWithinThreshold) return false;
  if (
    params.status === "completed" ||
    params.status === "picked_up" ||
    params.status === "dropped_off" ||
    params.status === "cancelled" ||
    params.status === "skipped" ||
    params.status === "failed"
  ) {
    return false;
  }
  // Stale GPS still allows last known frozen marker; caller decides animation.
  return true;
}
