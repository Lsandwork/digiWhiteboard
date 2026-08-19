/** Fitdog operational timezone for medication scheduling. */
export const TL_DIGI_BOARD_TIMEZONE = "America/Los_Angeles" as const;

/** Default medication windows (Los Angeles local time). */
export const TL_MEDICATION_WINDOWS = {
  am: { startHour: 4, startMinute: 0, endHour: 9, endMinute: 59, endSecond: 59 },
  mid_day: { startHour: 10, startMinute: 0, endHour: 15, endMinute: 59, endSecond: 59 },
  pm: { startHour: 16, startMinute: 0, endHour: 23, endMinute: 59, endSecond: 59 }
} as const;

export type TlMedicationPeriod = "am" | "mid_day" | "pm";

/** Gingr schedule labels mapped to operational periods. Unknown labels → other_special. */
export const TL_KNOWN_SCHEDULE_ALIASES: Record<string, TlMedicationPeriod | "other_special"> = {
  am: "am",
  "a.m.": "am",
  "a.m": "am",
  morning: "am",
  "mid-day": "mid_day",
  midday: "mid_day",
  MIDDAY: "mid_day",
  "mid day": "mid_day",
  noon: "mid_day",
  pm: "pm",
  "p.m.": "pm",
  "p.m": "pm",
  evening: "pm",
  night: "pm",
  bedtime: "other_special",
  BEDTIME: "other_special"
};

/**
 * Optional Fitdog Gingr medicationSchedules.id → period map.
 * Live Fitdog: "1"=AM, "2"=MIDDAY, "3"=PM. BEDTIME ("5") and other specials are not mapped.
 */
export const TL_FITDOG_SCHEDULE_ID_MAP: Record<string, TlMedicationPeriod> = {
  "1": "am",
  "2": "mid_day",
  "3": "pm"
};

export const TL_LODGING_AREA_KEYS = ["den", "dens", "petite_suite", "petite_suites", "suite", "suites"] as const;

export type TlLodgingAreaKey = (typeof TL_LODGING_AREA_KEYS)[number];

export const TL_DEFAULT_LODGING_LABELS: Record<TlLodgingAreaKey, string> = {
  den: "DEN",
  dens: "DEN",
  petite_suite: "PETITE SUITE",
  petite_suites: "PETITE SUITE",
  suite: "SUITE",
  suites: "SUITE"
};

/** Target server-side Gingr medication poll when webhooks are unavailable. */
export const TL_GINGR_MEDICATION_SYNC_INTERVAL_MS = 12_000;

/** Stale sync threshold before TV shows SYNC DELAYED. */
export const TL_GINGR_SYNC_DELAYED_MS = 45_000;

/** Stale sync threshold before TV shows CONNECTION ISSUE while keeping last-known-good rows. */
export const TL_GINGR_SYNC_STALE_MS = 120_000;

/** Per Gingr HTTP call — never wait unbounded. Do not put the request URL (it contains the API key) in errors. */
export const TL_GINGR_FETCH_TIMEOUT_MS = 8_000;

/**
 * Hard cap for one TL Gingr sync attempt. Cron and background `after()` must not hang
 * until the Vercel maxDuration. Last-known-good is returned; the in-flight work may
 * still finish and persist.
 */
export const TL_GINGR_SYNC_BUDGET_MS = 45_000;

/** Abort Supabase reads on the public TV GET so Vercel never waits unbounded. */
export const TL_BOARD_PUBLIC_LOAD_TIMEOUT_MS = 4_000;

/** Dedicated snapshot table reads should be well under this. */
export const TL_BOARD_SNAPSHOT_READ_TIMEOUT_MS = 4_000;

/** Short in-memory cache so concurrent TV polls share one Supabase read. */
export const TL_BOARD_PUBLIC_CACHE_TTL_MS = 2_500;

/** Minimum gap between background Gingr syncs triggered by TV polls (cron also runs). */
export const TL_BOARD_PUBLIC_BACKGROUND_SYNC_COOLDOWN_MS = 15_000;
