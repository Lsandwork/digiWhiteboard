import { formatPacificDate, pacificDateKeyFromInstant, weekLabel, weekStartKey } from "./dates";
import type { NamedCountRow, UserDateCountRow } from "./types";

export function bumpCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function namedCounts(
  map: Map<string, number>,
  labels?: Map<string, string>
): NamedCountRow[] {
  return [...map.entries()]
    .map(([key, count]) => ({
      key,
      label: labels?.get(key) ?? key,
      count
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function userDateCounts(
  rows: Array<{ userKey: string; userLabel: string; dateKey: string }>
): UserDateCountRow[] {
  const map = new Map<string, UserDateCountRow>();
  for (const row of rows) {
    const key = `${row.userKey}|${row.dateKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(key, {
      userKey: row.userKey,
      userLabel: row.userLabel,
      dateKey: row.dateKey,
      dateLabel: formatPacificDate(row.dateKey),
      count: 1
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    if (a.count !== b.count) return b.count - a.count;
    return a.userLabel.localeCompare(b.userLabel);
  });
}

export function loginDayAndWeekRows(
  events: Array<{ userKey: string; userLabel: string; at: string }>
) {
  const dayRows = userDateCounts(
    events.map((event) => ({
      userKey: event.userKey,
      userLabel: event.userLabel,
      dateKey: pacificDateKeyFromInstant(event.at)
    }))
  );
  const weekMap = new Map<string, { userKey: string; userLabel: string; weekKey: string; count: number }>();
  for (const event of events) {
    const dateKey = pacificDateKeyFromInstant(event.at);
    const weekKey = weekStartKey(dateKey);
    const key = `${event.userKey}|${weekKey}`;
    const existing = weekMap.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    weekMap.set(key, {
      userKey: event.userKey,
      userLabel: event.userLabel,
      weekKey,
      count: 1
    });
  }
  const byWeek = [...weekMap.values()]
    .map((row) => ({
      ...row,
      weekLabel: weekLabel(row.weekKey)
    }))
    .sort((a, b) => {
      if (a.weekKey !== b.weekKey) return b.weekKey.localeCompare(a.weekKey);
      if (a.count !== b.count) return b.count - a.count;
      return a.userLabel.localeCompare(b.userLabel);
    });
  return { byDay: dayRows, byWeek };
}

export function displayName(
  name?: string | null,
  email?: string | null,
  fallback = "Unknown"
) {
  const label = String(name ?? "").trim() || String(email ?? "").trim();
  return label || fallback;
}
