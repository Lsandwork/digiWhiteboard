import {
  WALK_BOARD_ALARM_END_HOUR,
  WALK_BOARD_ALARM_HOURS,
  WALK_BOARD_ALARM_INTERVAL_HOURS,
  WALK_BOARD_ALARM_START_HOUR,
  WALK_BOARD_TIMEZONE
} from "./constants";

export type WalkBoardClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateKey: string;
};

export function walkBoardClockParts(now = new Date(), timeZone = WALK_BOARD_TIMEZONE): WalkBoardClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour") === 24 ? 0 : read("hour");
  return {
    year,
    month,
    day,
    hour,
    minute: read("minute"),
    second: read("second"),
    dateKey: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  };
}

export function walkBoardSlotKey(dateKey: string, hour: number): string {
  return `${dateKey}T${String(hour).padStart(2, "0")}:00`;
}

export function isWalkBoardOperatingWindow(now = new Date(), timeZone = WALK_BOARD_TIMEZONE): boolean {
  const { hour } = walkBoardClockParts(now, timeZone);
  return hour >= WALK_BOARD_ALARM_START_HOUR && hour < WALK_BOARD_ALARM_END_HOUR;
}

/** Current 2-hour slot hour (8, 10, 12, 14, 16, 18) during operating hours. */
export function currentWalkBoardAlarmHour(now = new Date(), timeZone = WALK_BOARD_TIMEZONE): number | null {
  if (!isWalkBoardOperatingWindow(now, timeZone)) return null;
  const { hour } = walkBoardClockParts(now, timeZone);
  const slotHour = Math.floor(hour / WALK_BOARD_ALARM_INTERVAL_HOURS) * WALK_BOARD_ALARM_INTERVAL_HOURS;
  return (WALK_BOARD_ALARM_HOURS as readonly number[]).includes(slotHour) ? slotHour : null;
}

export function currentWalkBoardSlotKey(now = new Date(), timeZone = WALK_BOARD_TIMEZONE): string | null {
  const hour = currentWalkBoardAlarmHour(now, timeZone);
  if (hour == null) return null;
  return walkBoardSlotKey(walkBoardClockParts(now, timeZone).dateKey, hour);
}

export function nextWalkBoardAlarmAt(now = new Date(), timeZone = WALK_BOARD_TIMEZONE): Date {
  const parts = walkBoardClockParts(now, timeZone);
  const minutesNow = parts.hour * 60 + parts.minute;

  for (const hour of WALK_BOARD_ALARM_HOURS) {
    const slotMinutes = hour * 60;
    if (slotMinutes > minutesNow) {
      return zonedLocalToUtc(parts.dateKey, hour, 0, timeZone);
    }
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowParts = walkBoardClockParts(tomorrow, timeZone);
  return zonedLocalToUtc(tomorrowParts.dateKey, WALK_BOARD_ALARM_START_HOUR, 0, timeZone);
}

export function walkBoardSlotEndAt(slotKey: string, timeZone = WALK_BOARD_TIMEZONE): Date {
  const match = slotKey.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):00$/);
  if (!match) return new Date();
  const hour = Number(match[2]);
  // Last cycle is 6:00 PM and the operating window closes at 7:00 PM, not 8:00 PM.
  const endHour = Math.min(hour + WALK_BOARD_ALARM_INTERVAL_HOURS, WALK_BOARD_ALARM_END_HOUR);
  if (endHour >= 24) {
    const nextDay = new Date(`${match[1]}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextParts = walkBoardClockParts(nextDay, timeZone);
    return zonedLocalToUtc(nextParts.dateKey, 0, 0, timeZone);
  }
  return zonedLocalToUtc(match[1], endHour, 0, timeZone);
}

function zonedLocalToUtc(dateKey: string, hour: number, minute: number, timeZone: string): Date {
  const guess = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const asZone = walkBoardClockParts(guess, timeZone);
  const desiredMinutes = hour * 60 + minute;
  const actualMinutes = asZone.hour * 60 + asZone.minute;
  return new Date(guess.getTime() + (desiredMinutes - actualMinutes) * 60_000);
}

export function formatWalkBoardHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}

export function walkBoardExpectedSlots(dateKey: string) {
  return WALK_BOARD_ALARM_HOURS.map((hour) => ({
    hour,
    slotKey: walkBoardSlotKey(dateKey, hour),
    label: formatWalkBoardHourLabel(hour)
  }));
}
