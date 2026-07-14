/** Fitdog building hours for cast digital whiteboards (no server deps). */

export const CAST_DISPLAY_TIMEZONE = "America/Los_Angeles";
/** Inclusive open hour (5:00 AM local). */
export const CAST_DISPLAY_OPEN_HOUR = 5;
/** Exclusive close hour (10:00 PM local → hour 22). */
export const CAST_DISPLAY_CLOSE_HOUR = 22;

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

/** True during 5:00 AM – 9:59 PM Pacific (10:00 PM starts closed). */
export function isCastDisplayOpenHours(now: Date = new Date(), timeZone = CAST_DISPLAY_TIMEZONE): boolean {
  const { hour } = partsInCastDisplayTimeZone(now, timeZone);
  return hour >= CAST_DISPLAY_OPEN_HOUR && hour < CAST_DISPLAY_CLOSE_HOUR;
}

export function getCastDisplaySchedulePhase(
  now: Date = new Date(),
  timeZone = CAST_DISPLAY_TIMEZONE
): CastDisplaySchedulePhase {
  return isCastDisplayOpenHours(now, timeZone) ? "open" : "closed";
}

/**
 * First cron window after open (5:00–5:14 local). Used for a single soft morning refresh
 * so overnight freezes clear without needing manual admin refresh.
 */
export function isCastDisplayMorningOpenWindow(now: Date = new Date(), timeZone = CAST_DISPLAY_TIMEZONE): boolean {
  const { hour, minute } = partsInCastDisplayTimeZone(now, timeZone);
  return hour === CAST_DISPLAY_OPEN_HOUR && minute < 15;
}

export function castDisplayScheduleLabel(timeZone = CAST_DISPLAY_TIMEZONE): string {
  return `Auto-runs 5:00 AM – 10:00 PM (${timeZone.replace("America/", "")}), 7 days a week. Standby overnight.`;
}
