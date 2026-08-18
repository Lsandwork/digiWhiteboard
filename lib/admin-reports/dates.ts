import { dateAtLaLocal } from "@/lib/tl-digi-board/medication-windows";
import { getShiftDate, getZonedParts } from "@/lib/staff/daily-reminders";
import { pacificHtmlDate } from "@/lib/dates/html-date";

export const REPORTS_TIMEZONE = "America/Los_Angeles";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isReportDateKey(value: string) {
  return DATE_RE.test(value);
}

export function parseDateKey(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (![year, month, day].every((part) => Number.isFinite(part))) return null;
  return { year, month, day };
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + days);
  const next = new Date(utc);
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}-${month}-${day}`;
}

/** Monday-start week for a Pacific calendar date key. */
export function weekStartKey(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const dow = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  return addDaysToDateKey(dateKey, -mondayOffset);
}

export function weekLabel(dateKey: string) {
  const start = weekStartKey(dateKey);
  const parsed = parseDateKey(start);
  if (!parsed) return `Week of ${start}`;
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const label = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
  return `Week of ${label}`;
}

export function pacificDateKeyFromInstant(value: Date | string, timeZone = REPORTS_TIMEZONE) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return pacificHtmlDate();
  return getShiftDate(timeZone, date);
}

export function startOfPacificDayIso(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  try {
    return dateAtLaLocal({ ...parsed, hour: 0, minute: 0, second: 0 }).toISOString();
  } catch {
    return `${dateKey}T08:00:00.000Z`;
  }
}

export function exclusiveEndOfPacificDayIso(dateKey: string) {
  return startOfPacificDayIso(addDaysToDateKey(dateKey, 1));
}

export function defaultReportRange(now = new Date()) {
  const to = pacificHtmlDate(now);
  const from = addDaysToDateKey(to, -6);
  return { from, to };
}

export function resolveReportRange(fromRaw: unknown, toRaw: unknown, now = new Date()) {
  const fallback = defaultReportRange(now);
  const from = isReportDateKey(String(fromRaw ?? "")) ? String(fromRaw) : fallback.from;
  const to = isReportDateKey(String(toRaw ?? "")) ? String(toRaw) : fallback.to;
  if (from > to) return { from: to, to: from };
  return { from, to };
}

export function formatPacificDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    timeZone: REPORTS_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatPacificDate(value: string | null | undefined) {
  if (!value) return "—";
  if (isReportDateKey(value)) {
    const parsed = parseDateKey(value);
    if (!parsed) return value;
    return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC"
    });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = getZonedParts(date, REPORTS_TIMEZONE);
  return formatPacificDate(`${parts.year}-${parts.month}-${parts.day}`);
}
