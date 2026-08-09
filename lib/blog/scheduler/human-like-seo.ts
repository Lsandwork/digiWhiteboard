/**
 * Human-like SEO posting scheduler for Fitdog blog (America/Los_Angeles).
 * Picks jittered weekday slots — never robotic on-the-hour dumps.
 */

export type SchedulerSettings = {
  postsPerWeek: number;
  minHoursBetweenPosts: number;
  jitterMinMinutes: number;
  jitterMaxMinutes: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  timezone?: string;
};

export type ScheduleSlot = {
  at: Date;
  label: string;
  window: "morning" | "afternoon";
};

const PREFERRED_WEEKDAYS = new Set([2, 3, 4]); // Tue Wed Thu (0=Sun)
const SECONDARY_WEEKDAYS = new Set([1, 5]); // Mon Fri

function laParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hourRaw = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0
  };
}

/** Civil LA date/time → UTC Date */
export function laCivilToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  const guess = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00Z`);
  // Refine using LA offset at that instant
  const parts = laParts(guess);
  const asUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const delta = asUtcGuess - shown;
  return new Date(asUtcGuess + delta);
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function inQuietHours(hour: number, settings: SchedulerSettings): boolean {
  const start = settings.quietHoursStart;
  const end = settings.quietHoursEnd;
  if (start === end) return false;
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

function weekdayWeight(weekday: number): number {
  if (PREFERRED_WEEKDAYS.has(weekday)) return 3;
  if (SECONDARY_WEEKDAYS.has(weekday)) return 1.2;
  return 0.15; // weekends rare
}

/**
 * Next human-like publish slot after `after`, respecting cadence and spacing.
 */
export function nextHumanLikeSlot(
  after: Date,
  settings: SchedulerSettings,
  recentPublishTimes: Date[] = [],
  seedKey = "fitdog-blog"
): ScheduleSlot {
  const rng = mulberry32(hashSeed(`${seedKey}:${after.toISOString()}`));
  const jitterMin = Math.max(0, settings.jitterMinMinutes);
  const jitterMax = Math.max(jitterMin, settings.jitterMaxMinutes);
  const minGapMs = Math.max(1, settings.minHoursBetweenPosts) * 60 * 60 * 1000;

  let cursor = new Date(after.getTime() + 15 * 60 * 1000);

  for (let dayOffset = 0; dayOffset < 28; dayOffset += 1) {
    const probe = new Date(cursor.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const parts = laParts(probe);
    const weight = weekdayWeight(parts.weekday);
    if (rng() > weight / 3) continue;

    const windows: Array<{ window: "morning" | "afternoon"; startH: number; startM: number; endH: number }> = [
      { window: "morning", startH: 8, startM: 30, endH: 11 },
      { window: "afternoon", startH: 13, startM: 0, endH: 16 }
    ];
    // Prefer morning slightly for SEO crawl freshness.
    if (rng() > 0.55) windows.reverse();

    for (const win of windows) {
      const spanMinutes = (win.endH - win.startH) * 60 - win.startM;
      const baseMinute = win.startM + Math.floor(rng() * Math.max(15, spanMinutes));
      const hour = win.startH + Math.floor(baseMinute / 60);
      const minute = baseMinute % 60;
      if (inQuietHours(hour, settings)) continue;

      const jitter =
        jitterMin + Math.floor(rng() * (jitterMax - jitterMin + 1)) * (rng() > 0.5 ? 1 : -1);
      let finalMinute = minute + jitter;
      let finalHour = hour;
      while (finalMinute >= 60) {
        finalMinute -= 60;
        finalHour += 1;
      }
      while (finalMinute < 0) {
        finalMinute += 60;
        finalHour -= 1;
      }
      if (finalHour < 7 || finalHour > 18) continue;

      const candidate = laCivilToUtc(parts.year, parts.month, parts.day, finalHour, finalMinute);
      if (candidate.getTime() <= after.getTime()) continue;

      const tooClose = recentPublishTimes.some(
        (t) => Math.abs(candidate.getTime() - t.getTime()) < minGapMs
      );
      if (tooClose) continue;

      const label = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(finalHour).padStart(2, "0")}:${String(finalMinute).padStart(2, "0")} PT (${win.window})`;
      return { at: candidate, label, window: win.window };
    }
  }

  // Fallback: +26h morning-ish
  const fallback = new Date(after.getTime() + 26 * 60 * 60 * 1000);
  return { at: fallback, label: fallback.toISOString(), window: "morning" };
}

/** How many more posts we can schedule this LA calendar week. */
export function remainingPostsThisWeek(
  publishedOrScheduledThisWeek: number,
  postsPerWeek: number
): number {
  return Math.max(0, postsPerWeek - publishedOrScheduledThisWeek);
}

export function startOfLaWeek(now = new Date()): Date {
  const parts = laParts(now);
  const dayOffset = (parts.weekday + 6) % 7; // Monday=0
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  monday.setUTCDate(monday.getUTCDate() - dayOffset);
  return laCivilToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0);
}

export function schedulerSettingsFromRow(row: Record<string, unknown> | null | undefined): SchedulerSettings {
  const cfg = (row?.automation_config || {}) as Record<string, unknown>;
  return {
    postsPerWeek: Number(row?.posts_per_week ?? cfg.postsPerWeek ?? 3) || 3,
    minHoursBetweenPosts: Number(row?.min_hours_between_posts ?? cfg.minHoursBetweenPosts ?? 20) || 20,
    jitterMinMinutes: Number(row?.schedule_jitter_min_minutes ?? cfg.jitterMin ?? 18) || 18,
    jitterMaxMinutes: Number(row?.schedule_jitter_max_minutes ?? cfg.jitterMax ?? 45) || 45,
    quietHoursStart: Number(row?.quiet_hours_start ?? cfg.quietStart ?? 20) || 20,
    quietHoursEnd: Number(row?.quiet_hours_end ?? cfg.quietEnd ?? 7) || 7,
    timezone: String(row?.scheduler_timezone || "America/Los_Angeles")
  };
}

export function recommendNextSlots(
  count: number,
  settings: SchedulerSettings,
  after = new Date(),
  recent: Date[] = []
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];
  let cursor = after;
  const seen = [...recent];
  for (let i = 0; i < count; i += 1) {
    const slot = nextHumanLikeSlot(cursor, settings, seen, `preview-${i}`);
    slots.push(slot);
    seen.push(slot.at);
    cursor = slot.at;
  }
  return slots;
}
