/** Fitdog building hours for cast digital whiteboards (no server deps). */

export const CAST_DISPLAY_TIMEZONE = "America/Los_Angeles";
/** Inclusive open hour (5:30 AM local). */
export const CAST_DISPLAY_OPEN_HOUR = 5;
/** Inclusive open minute within CAST_DISPLAY_OPEN_HOUR. */
export const CAST_DISPLAY_OPEN_MINUTE = 30;
/** Exclusive close hour (10:00 PM local → hour 22). */
export const CAST_DISPLAY_CLOSE_HOUR = 22;
/** Exclusive close minute within CAST_DISPLAY_CLOSE_HOUR. */
export const CAST_DISPLAY_CLOSE_MINUTE = 0;

export type CastDisplaySchedulePhase = "open" | "closed";

export function partsInCastDisplayTimeZone(date: Date, timeZone = CAST_DISPLAY_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { hour, minute };
}

function minutesSinceMidnight(hour: number, minute: number) {
  return hour * 60 + minute;
}

export function castDisplayOpenMinutes() {
  return minutesSinceMidnight(CAST_DISPLAY_OPEN_HOUR, CAST_DISPLAY_OPEN_MINUTE);
}

export function castDisplayCloseMinutes() {
  return minutesSinceMidnight(CAST_DISPLAY_CLOSE_HOUR, CAST_DISPLAY_CLOSE_MINUTE);
}

/** True during 5:30 AM – 9:59 PM Pacific (10:00 PM starts closed). */
export function isCastDisplayOpenHours(now: Date = new Date(), timeZone = CAST_DISPLAY_TIMEZONE): boolean {
  const { hour, minute } = partsInCastDisplayTimeZone(now, timeZone);
  const current = minutesSinceMidnight(hour, minute);
  return current >= castDisplayOpenMinutes() && current < castDisplayCloseMinutes();
}

export function getCastDisplaySchedulePhase(
  now: Date = new Date(),
  timeZone = CAST_DISPLAY_TIMEZONE
): CastDisplaySchedulePhase {
  return isCastDisplayOpenHours(now, timeZone) ? "open" : "closed";
}

/**
 * First cron window after open (5:30–5:44 local). Used for a single soft morning refresh
 * so overnight freezes clear without needing manual admin refresh.
 */
export function isCastDisplayMorningOpenWindow(now: Date = new Date(), timeZone = CAST_DISPLAY_TIMEZONE): boolean {
  const { hour, minute } = partsInCastDisplayTimeZone(now, timeZone);
  if (hour !== CAST_DISPLAY_OPEN_HOUR) return false;
  return minute >= CAST_DISPLAY_OPEN_MINUTE && minute < CAST_DISPLAY_OPEN_MINUTE + 15;
}

export function castDisplayScheduleLabel(timeZone = CAST_DISPLAY_TIMEZONE): string {
  return `Auto-runs 5:30 AM – 10:00 PM (${timeZone.replace("America/", "")}), 7 days a week. Standby overnight.`;
}

/** Short TV standby copy while boards are powered down for the night. */
export function castDisplayClosedStandbyMessage(timeZone = CAST_DISPLAY_TIMEZONE): string {
  return `Digital whiteboards resume at 5:30 AM ${timeZone.replace("America/", "").replace("_", " ")}.`;
}
