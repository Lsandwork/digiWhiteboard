/**
 * Santa Monica, CA weather for the staff digital whiteboard.
 * Uses Open-Meteo (no API key) — Fahrenheit, America/Los_Angeles.
 */

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

export type SantaMonicaWeather = {
  tempF: number;
  observedAt: string;
  label: string;
  heatAlert: boolean;
  source: "open-meteo";
};

type CacheEntry = { value: SantaMonicaWeather; expiresAt: number };

const WEATHER_CACHE_TTL_MS = 5 * 60_000;
let memoryCache: CacheEntry | null = null;

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

export async function fetchSantaMonicaWeather(options?: {
  force?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<SantaMonicaWeather> {
  const now = Date.now();
  if (!options?.force && memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.value;
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
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

  const value: SantaMonicaWeather = {
    tempF,
    observedAt: body.current?.time ? new Date(body.current.time).toISOString() : new Date().toISOString(),
    label: SANTA_MONICA_LABEL,
    heatAlert: isHeatAlertTemp(tempF),
    source: "open-meteo"
  };
  memoryCache = { value, expiresAt: now + WEATHER_CACHE_TTL_MS };
  return value;
}

export function clearSantaMonicaWeatherCache() {
  memoryCache = null;
}
