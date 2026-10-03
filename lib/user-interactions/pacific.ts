/** Business timezone for User Interactions (Fitdog / RuffOps ops). */
export const USER_INTERACTIONS_TIMEZONE = "America/Los_Angeles";

export function pacificDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_INTERACTIONS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function pacificTodayKey(now = new Date()): string {
  return pacificDateKey(now) ?? "";
}

export function isPacificToday(value: string | Date | null | undefined, now = new Date()): boolean {
  const key = pacificDateKey(value);
  return key != null && key === pacificTodayKey(now);
}

export function pacificCalendarDateFromIso(value: string | null | undefined): Date | null {
  const key = pacificDateKey(value);
  if (!key) return null;
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Compare due date (date-only intent) to Pacific today. */
export function pacificDueDateKey(value: string | null | undefined): string | null {
  return pacificDateKey(value);
}

export function isOverduePacificDueDate(
  dueIso: string | null | undefined,
  now = new Date()
): boolean {
  const dueKey = pacificDueDateKey(dueIso);
  if (!dueKey) return false;
  const todayKey = pacificTodayKey(now);
  return dueKey < todayKey;
}

export function isDueTodayPacific(dueIso: string | null | undefined, now = new Date()): boolean {
  const dueKey = pacificDueDateKey(dueIso);
  return dueKey != null && dueKey === pacificTodayKey(now);
}

export function isDueTomorrowPacific(dueIso: string | null | undefined, now = new Date()): boolean {
  const dueKey = pacificDueDateKey(dueIso);
  if (!dueKey) return false;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dueKey === pacificTodayKey(tomorrow);
}

export function overdueDayCountPacific(dueIso: string | null | undefined, now = new Date()): number | null {
  const dueKey = pacificDueDateKey(dueIso);
  if (!dueKey) return null;
  const todayKey = pacificTodayKey(now);
  if (dueKey >= todayKey) return null;
  const dueParts = dueKey.split("-").map(Number);
  const todayParts = todayKey.split("-").map(Number);
  const dueUtc = Date.UTC(dueParts[0]!, dueParts[1]! - 1, dueParts[2]!);
  const todayUtc = Date.UTC(todayParts[0]!, todayParts[1]! - 1, todayParts[2]!);
  return Math.round((todayUtc - dueUtc) / 86400000);
}

export function formatDueLabelPacific(dueIso: string | null | undefined, now = new Date()): string {
  if (!dueIso) return "No due date";
  if (isDueTodayPacific(dueIso, now)) return "Due today";
  if (isDueTomorrowPacific(dueIso, now)) return "Due tomorrow";
  const overdueDays = overdueDayCountPacific(dueIso, now);
  if (overdueDays != null && overdueDays > 0) {
    return overdueDays === 1 ? "Overdue (1 day)" : `Overdue (${overdueDays} days)`;
  }
  const key = pacificDueDateKey(dueIso);
  if (!key) return "No due date";
  const [y, m, d] = key.split("-").map(Number);
  const label = new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
  return `Due ${label}`;
}

/** Parse `<input type="date">` value (YYYY-MM-DD) as Pacific midnight ISO for storage. */
export function pacificDateInputToIso(dateOnly: string): string | null {
  const trimmed = dateOnly.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  // 12:00 UTC ≈ morning Pacific; date-only comparisons use pacificDateKey on result.
  return new Date(Date.UTC(y!, m! - 1, d!, 20, 0, 0)).toISOString();
}
