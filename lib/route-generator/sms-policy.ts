/**
 * Owner-facing Route Generator SMS policy.
 *
 * Midnight spam happened because Approve blasted tracking texts immediately and
 * the ETA cron treated parked overnight vans as "arriving". These helpers are the
 * shared gates for every owner SMS path.
 */

export const ROUTE_OWNER_SMS_TIMEZONE = "America/Los_Angeles";

/** Inclusive local service window for owner SMS (PT). */
export const ROUTE_OWNER_SMS_WINDOW_START_MINUTES = 6 * 60; // 6:00 AM
export const ROUTE_OWNER_SMS_WINDOW_END_MINUTES = 20 * 60; // 8:00 PM

/** Van must be moving for ETA / pull-up SMS — parked overnight vans near homes must not text. */
export const ROUTE_OWNER_SMS_MIN_SPEED_MPH = 3;

/** Reject stale Samsara GPS older than this. */
export const ROUTE_OWNER_SMS_MAX_GPS_AGE_MS = 10 * 60 * 1000;

/** How early before a stop window ETA SMS may start. */
export const ROUTE_OWNER_SMS_WINDOW_LEAD_MS = 45 * 60 * 1000;
/** How late after a stop window ETA SMS may continue. */
export const ROUTE_OWNER_SMS_WINDOW_TRAIL_MS = 30 * 60 * 1000;

export function zonedMinutesNow(now = new Date(), timeZone = ROUTE_OWNER_SMS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  // Intl may emit hour "24" for midnight in some environments.
  const normalizedHour = hour === 24 ? 0 : hour;
  return normalizedHour * 60 + minute;
}

export function isWithinRouteOwnerSmsServiceHours(now = new Date()) {
  const minutes = zonedMinutesNow(now);
  return minutes >= ROUTE_OWNER_SMS_WINDOW_START_MINUTES && minutes < ROUTE_OWNER_SMS_WINDOW_END_MINUTES;
}

export function routeOwnerSmsQuietHoursMessage(now = new Date()) {
  if (isWithinRouteOwnerSmsServiceHours(now)) return null;
  return "Owner SMS is blocked overnight (8:00 PM – 6:00 AM Pacific). Approve the plan without SMS, then send alerts after routes go live in the morning.";
}

export function isSamsaraGpsFreshForSms(
  gpsTime: string | null | undefined,
  nowMs = Date.now(),
  maxAgeMs = ROUTE_OWNER_SMS_MAX_GPS_AGE_MS
) {
  if (!gpsTime) return false;
  const parsed = new Date(gpsTime).getTime();
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed <= maxAgeMs && parsed <= nowMs + 60_000;
}

export function isVehicleMovingForSms(
  speedMilesPerHour: number | null | undefined,
  minSpeedMph = ROUTE_OWNER_SMS_MIN_SPEED_MPH
) {
  return typeof speedMilesPerHour === "number" && Number.isFinite(speedMilesPerHour) && speedMilesPerHour >= minSpeedMph;
}

/**
 * Prefer the stop's planned Samsara/route arrival window. When missing, fall back
 * to service hours only (caller still enforces quiet hours + moving vehicle).
 */
export function isWithinStopSmsWindow(options: {
  now?: Date;
  plannedArrivalAt?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}) {
  const nowMs = (options.now ?? new Date()).getTime();
  const arrivalMs = options.plannedArrivalAt ? new Date(options.plannedArrivalAt).getTime() : NaN;
  const startMs = options.windowStart ? new Date(options.windowStart).getTime() : NaN;
  const endMs = options.windowEnd ? new Date(options.windowEnd).getTime() : NaN;

  if (Number.isFinite(arrivalMs)) {
    return (
      nowMs >= arrivalMs - ROUTE_OWNER_SMS_WINDOW_LEAD_MS &&
      nowMs <= arrivalMs + ROUTE_OWNER_SMS_WINDOW_TRAIL_MS
    );
  }

  if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
    const open = Number.isFinite(startMs) ? startMs - ROUTE_OWNER_SMS_WINDOW_LEAD_MS : endMs - 2 * 60 * 60 * 1000;
    const close = Number.isFinite(endMs) ? endMs + ROUTE_OWNER_SMS_WINDOW_TRAIL_MS : startMs + 3 * 60 * 60 * 1000;
    return nowMs >= open && nowMs <= close;
  }

  // No per-stop schedule — allow only during daytime service hours.
  return isWithinRouteOwnerSmsServiceHours(options.now);
}

export type OwnerEtaSmsGateReason =
  | "ok"
  | "quiet_hours"
  | "sms_disabled"
  | "missing_phone"
  | "vehicle_not_moving"
  | "stale_gps"
  | "outside_stop_window"
  | "already_notified";

export function evaluateOwnerEtaSmsGate(input: {
  now?: Date;
  smsAlertsEnabled?: boolean | null;
  ownerPhone?: string | null;
  alreadyNotified?: boolean;
  speedMilesPerHour?: number | null;
  gpsTime?: string | null;
  plannedArrivalAt?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}): { allowed: boolean; reason: OwnerEtaSmsGateReason } {
  if (input.alreadyNotified) return { allowed: false, reason: "already_notified" };
  if (input.smsAlertsEnabled === false) return { allowed: false, reason: "sms_disabled" };
  if (!input.ownerPhone) return { allowed: false, reason: "missing_phone" };
  if (!isWithinRouteOwnerSmsServiceHours(input.now)) return { allowed: false, reason: "quiet_hours" };
  if (!isVehicleMovingForSms(input.speedMilesPerHour)) return { allowed: false, reason: "vehicle_not_moving" };
  if (!isSamsaraGpsFreshForSms(input.gpsTime, (input.now ?? new Date()).getTime())) {
    return { allowed: false, reason: "stale_gps" };
  }
  if (
    !isWithinStopSmsWindow({
      now: input.now,
      plannedArrivalAt: input.plannedArrivalAt,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd
    })
  ) {
    return { allowed: false, reason: "outside_stop_window" };
  }
  return { allowed: true, reason: "ok" };
}
