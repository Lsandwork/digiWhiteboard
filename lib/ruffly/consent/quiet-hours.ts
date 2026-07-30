type QuietHoursConfig = {
  start?: string;
  end?: string;
  timezone?: string;
};

function parseHhMm(value: string | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function minutesSinceMidnight(hour: number, minute: number) {
  return hour * 60 + minute;
}

/** Returns true when `now` falls inside the quiet-hours window (supports overnight ranges). */
export function isWithinQuietHours(
  config: QuietHoursConfig | null | undefined,
  now: Date = new Date()
): boolean {
  const start = parseHhMm(config?.start);
  const end = parseHhMm(config?.end);
  if (!start || !end) return false;

  const timezone = config?.timezone?.trim() || "America/Los_Angeles";
  let localMinutes: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23"
    }).formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    localMinutes = minutesSinceMidnight(hour, minute);
  } catch {
    return false;
  }

  const startMin = minutesSinceMidnight(start.hour, start.minute);
  const endMin = minutesSinceMidnight(end.hour, end.minute);
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return localMinutes >= startMin && localMinutes < endMin;
  }
  // Overnight window, e.g. 21:00 → 08:00
  return localMinutes >= startMin || localMinutes < endMin;
}
