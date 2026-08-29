/**
 * Santa Monica, CA weather for the staff digital whiteboard.
 *
 * Architecture (RuffOPS performance rules):
 *   Client → /api/staff/weather → process TTL cache → Open-Meteo (max once / 15 min)
 *
 * Zero Supabase. Zero per-client Open-Meteo fan-out.
 */

import { getOrLoadTtlCache, getTtlCache, invalidateTtlCache, setTtlCache } from "@/lib/server-ttl-cache";

export const SANTA_MONICA_LAT = 34.0195;
export const SANTA_MONICA_LON = -118.4912;
export const SANTA_MONICA_LABEL = "Santa Monica";
/** Board + SMS heat threshold (°F). */
export const HEAT_ALERT_TEMP_F = 80;
export const HEAT_ALERT_SOURCE = "heat_alert";
export const HEAT_ALERT_TITLE = "Heat Alert";
export const HEAT_ALERT_MESSAGE =
  "Temperature is 80°F or higher in Santa Monica. Rotate water bowls and give dogs more breaks.";
export const HEAT_ALERT_DURATION_MINUTES = 30;

/** Shared server cache window — Open-Meteo at most once per TTL. */
export const WEATHER_CACHE_TTL_MS = 15 * 60_000;
/** CDN/browser hint for /api/staff/weather. */
export const WEATHER_HTTP_CACHE_SECONDS = 900;
export const WEATHER_CACHE_KEY = "staff:santa-monica-weather";

export type SantaMonicaWeather = {
  tempF: number;
  observedAt: string;
  label: string;
  heatAlert: boolean;
  source: "open-meteo";
  cachedUntil?: string;
};

export function isHeatAlertTemp(tempF: number) {
  return Number.isFinite(tempF) && tempF >= HEAT_ALERT_TEMP_F;
}

export function formatTempF(tempF: number) {
  if (!Number.isFinite(tempF)) return "—°F";
  return `${Math.round(tempF)}°F`;
}

export function pacificDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** Milliseconds until next Pacific midnight (for day-scoped idempotency TTL). */
export function msUntilPacificMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour") % 24;
  const minute = get("minute");
  const second = get("second");
  const msToday = ((hour * 60 + minute) * 60 + second) * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const remaining = dayMs - msToday;
  // Safety floor so a midnight race still keeps the key briefly.
  return Math.max(60_000, remaining);
}

export function heatAlertIdempotencyKey(dateKey = pacificDateKey()) {
  return `heat-alert:${dateKey}`;
}

function openMeteoUrl() {
  const params = new URLSearchParams({
    latitude: String(SANTA_MONICA_LAT),
    longitude: String(SANTA_MONICA_LON),
    current: "temperature_2m",
    temperature_unit: "fahrenheit",
    timezone: "America/Los_Angeles"
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

async function loadOpenMeteoWeather(fetchImpl: typeof fetch): Promise<SantaMonicaWeather> {
  const response = await fetchImpl(openMeteoUrl(), {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) {
    throw new Error(`Santa Monica weather unavailable (HTTP ${response.status}).`);
  }

  const body = (await response.json()) as {
    current?: { temperature_2m?: number; time?: string };
  };
  const tempF = Number(body.current?.temperature_2m);
  if (!Number.isFinite(tempF)) {
    throw new Error("Santa Monica weather payload missing temperature.");
  }

  return {
    tempF,
    observedAt: body.current?.time ? new Date(body.current.time).toISOString() : new Date().toISOString(),
    label: SANTA_MONICA_LABEL,
    heatAlert: isHeatAlertTemp(tempF),
    source: "open-meteo",
    cachedUntil: new Date(Date.now() + WEATHER_CACHE_TTL_MS).toISOString()
  };
}

/**
 * Process-local cached weather. Concurrent callers share one in-flight Open-Meteo request.
 */
export async function fetchSantaMonicaWeather(options?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<SantaMonicaWeather> {
  if (options?.force) {
    invalidateTtlCache(WEATHER_CACHE_KEY);
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const weather = await getOrLoadTtlCache(WEATHER_CACHE_KEY, WEATHER_CACHE_TTL_MS, () =>
    loadOpenMeteoWeather(fetchImpl)
  );
  return {
    ...weather,
    cachedUntil: new Date(Date.now() + WEATHER_CACHE_TTL_MS).toISOString()
  };
}

export function peekSantaMonicaWeatherCache() {
  return getTtlCache<SantaMonicaWeather>(WEATHER_CACHE_KEY);
}

export function clearSantaMonicaWeatherCache() {
  invalidateTtlCache(WEATHER_CACHE_KEY);
}

export function markHeatAlertSentInMemory(dateKey = pacificDateKey()) {
  setTtlCache(heatAlertIdempotencyKey(dateKey), true, msUntilPacificMidnight());
}

export function hasHeatAlertSentInMemory(dateKey = pacificDateKey()) {
  return getTtlCache<boolean>(heatAlertIdempotencyKey(dateKey)) === true;
}
