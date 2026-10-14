import { pacificDateKey } from "@/lib/user-interactions/pacific";

/** Inclusive Pacific calendar-day bounds as UTC instants. Covers PST (UTC-8) and PDT (UTC-7). */
export function pacificDayBounds(dateKey: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  for (const hour of [7, 8]) {
    const start = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
    if (pacificDateKey(start) !== dateKey) continue;
    const hourInLa = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(start);
    if (hourInLa !== "00") continue;
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}
