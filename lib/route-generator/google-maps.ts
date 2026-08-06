/**
 * Google Maps Platform client for Fitdog Route Generator.
 *
 * - Geocoding API → real stop coordinates (cached in route_address_cache)
 * - Routes API computeRouteMatrix → rush-hour / live traffic drive times
 * - Routes API computeRoutes → live van→stop ETA for owner tracking
 *
 * Waze has no public multi-stop matrix API. Google Routes TRAFFIC_AWARE uses
 * the same live/historical traffic graph Google Maps / Waze-class products use.
 */

import { addressCacheKey, parseAddress } from "@/lib/route-generator/address";

export type LatLng = { lat: number; lng: number };

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

const MATRIX_MAX_SIDE = 25; // 25×25 = 625 elements (Routes API traffic-aware limit)

export function getGoogleMapsApiKey(): string | null {
  const key =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    "";
  return key || null;
}

export function isGoogleMapsConfigured(): boolean {
  return Boolean(getGoogleMapsApiKey());
}

export function coordKey(point: LatLng, precision = 5): string {
  return `${point.lat.toFixed(precision)},${point.lng.toFixed(precision)}`;
}

/** Convert a Pacific local wall time on an operating date to UTC ISO. */
export function pacificLocalToUtcIso(operatingDate: string, hour: number, minute: number): string {
  const ymd = String(operatingDate).slice(0, 10);
  const [year, month, day] = ymd.split("-").map(Number);
  if (!year || !month || !day) return new Date().toISOString();

  // Iterate from a UTC guess until America/Los_Angeles wall clock matches.
  let utcMs = Date.UTC(year, month - 1, day, hour + 8, minute, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  for (let i = 0; i < 64; i += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value])
    );
    const gotHour = parts.hour === "24" ? 0 : Number(parts.hour);
    const gotMinutes =
      Number(parts.year) * 525600 +
      Number(parts.month) * 43200 +
      Number(parts.day) * 1440 +
      gotHour * 60 +
      Number(parts.minute);
    const wantMinutes = year * 525600 + month * 43200 + day * 1440 + hour * 60 + minute;
    const delta = wantMinutes - gotMinutes;
    if (delta === 0) return new Date(utcMs).toISOString();
    utcMs += delta * 60_000;
  }
  return new Date(utcMs).toISOString();
}

export function defaultDepartureTimeIso(direction: "pickup" | "dropoff", operatingDate?: string | null) {
  const ymd =
    String(operatingDate || "").slice(0, 10) ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  // Pickup vans leave ~7:00; club drop-offs ~12:00 covers the later wave (outing is 10:30).
  // Using 12:00 for dropoff bias matrix toward midday LA traffic for return trips.
  if (direction === "pickup") return pacificLocalToUtcIso(ymd, 7, 0);
  return pacificLocalToUtcIso(ymd, 11, 0);
}

function haversineMiles(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function heuristicDriveMinutes(a: LatLng, b: LatLng) {
  // Fallback when Google is unavailable: LA urban factor.
  return Math.max(1, Math.round(haversineMiles(a, b) * 1.35 * 3.2));
}

export type TravelTimeMatrix = {
  /** minutes keyed by `${fromKey}>${toKey}` */
  minutes: Map<string, number>;
  meters: Map<string, number>;
  provider: "google_routes" | "heuristic";
  departureTime: string;
  warnings: string[];
};

export function matrixLookup(
  matrix: TravelTimeMatrix | null | undefined,
  from: LatLng | null | undefined,
  to: LatLng | null | undefined
): { minutes: number; meters: number } | null {
  if (!matrix || !from || !to) return null;
  const key = `${coordKey(from)}>${coordKey(to)}`;
  const minutes = matrix.minutes.get(key);
  if (minutes == null || !Number.isFinite(minutes)) return null;
  return { minutes, meters: matrix.meters.get(key) ?? 0 };
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  formatted: string | null;
  confidence: number;
} | null> {
  const key = getGoogleMapsApiKey();
  if (!key) return null;
  const parsed = parseAddress(address);
  const query = parsed.normalized || address;
  if (!query.trim()) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "us");

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      partial_match?: boolean;
    }>;
  };
  if (body.status !== "OK" || !body.results?.[0]?.geometry?.location) return null;
  const result = body.results[0]!;
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
  const locationType = result.geometry?.location_type;
  let confidence = 0.85;
  if (locationType === "ROOFTOP") confidence = 0.98;
  else if (locationType === "RANGE_INTERPOLATED") confidence = 0.9;
  else if (locationType === "GEOMETRIC_CENTER") confidence = 0.75;
  else if (locationType === "APPROXIMATE") confidence = 0.55;
  if (result.partial_match) confidence -= 0.15;

  return {
    lat,
    lng,
    formatted: result.formatted_address ?? null,
    confidence: Math.max(0.1, confidence)
  };
}

export async function geocodeHouseholdAddresses(
  supabase: SupabaseClient,
  addresses: Array<{ householdKey: string; address: string }>
): Promise<{
  coords: Record<string, LatLng>;
  geocoded: number;
  cached: number;
  failed: string[];
  provider: "google" | "none";
}> {
  const coords: Record<string, LatLng> = {};
  const failed: string[] = [];
  let geocoded = 0;
  let cached = 0;
  if (!isGoogleMapsConfigured()) {
    return { coords, geocoded, cached, failed: addresses.map((a) => a.householdKey), provider: "none" };
  }

  for (const entry of addresses) {
    const address = String(entry.address || "").trim();
    if (!address || entry.householdKey.startsWith("facility:")) continue;
    const cacheKey = addressCacheKey(address);

    const { data: existing } = await supabase
      .from("route_address_cache")
      .select("latitude, longitude, validation_status")
      .eq("address_key", cacheKey)
      .maybeSingle();

    if (
      existing?.latitude != null &&
      existing?.longitude != null &&
      existing.validation_status !== "invalid"
    ) {
      coords[entry.householdKey] = { lat: Number(existing.latitude), lng: Number(existing.longitude) };
      cached += 1;
      continue;
    }

    try {
      const hit = await geocodeAddress(address);
      if (!hit) {
        failed.push(entry.householdKey);
        continue;
      }
      coords[entry.householdKey] = { lat: hit.lat, lng: hit.lng };
      geocoded += 1;
      const parsed = parseAddress(address);
      await supabase.from("route_address_cache").upsert(
        {
          address_key: cacheKey,
          original_address: address,
          normalized_address: hit.formatted || parsed.normalized || address,
          unit: parsed.unit,
          latitude: hit.lat,
          longitude: hit.lng,
          geocoder_confidence: hit.confidence,
          validation_status: hit.confidence >= 0.7 ? "valid" : "low_confidence",
          provider: "google",
          updated_at: new Date().toISOString()
        },
        { onConflict: "address_key" }
      );
    } catch {
      failed.push(entry.householdKey);
    }
  }

  return { coords, geocoded, cached, failed, provider: "google" };
}

function parseDurationSeconds(duration: string | number | null | undefined): number | null {
  if (duration == null) return null;
  if (typeof duration === "number" && Number.isFinite(duration)) return duration;
  const match = String(duration).match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) return null;
  return Number(match[1]);
}

async function fetchRouteMatrixChunk(params: {
  origins: LatLng[];
  destinations: LatLng[];
  departureTime: string;
  apiKey: string;
}): Promise<Array<{ originIndex: number; destinationIndex: number; minutes: number; meters: number }>> {
  const body = {
    origins: params.origins.map((point) => ({
      waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } }
    })),
    destinations: params.destinations.map((point) => ({
      waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } }
    })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    departureTime: params.departureTime,
    units: "IMPERIAL"
  };

  const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": params.apiKey,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Routes matrix failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const rows = (await response.json()) as Array<{
    originIndex?: number;
    destinationIndex?: number;
    duration?: string;
    distanceMeters?: number;
    status?: { code?: number; message?: string };
    condition?: string;
  }>;

  const out: Array<{ originIndex: number; destinationIndex: number; minutes: number; meters: number }> = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row.originIndex == null || row.destinationIndex == null) continue;
    if (row.condition && row.condition !== "ROUTE_EXISTS") continue;
    const seconds = parseDurationSeconds(row.duration);
    if (seconds == null) continue;
    out.push({
      originIndex: row.originIndex,
      destinationIndex: row.destinationIndex,
      minutes: Math.max(1, Math.round(seconds / 60)),
      meters: Number(row.distanceMeters) || 0
    });
  }
  return out;
}

export async function buildTrafficTravelMatrix(params: {
  points: LatLng[];
  departureTime: string;
}): Promise<TravelTimeMatrix> {
  const warnings: string[] = [];
  const unique: LatLng[] = [];
  const seen = new Set<string>();
  for (const point of params.points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    const key = coordKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }

  const minutes = new Map<string, number>();
  const meters = new Map<string, number>();
  const apiKey = getGoogleMapsApiKey();

  // Always seed heuristic so missing cells still have a value.
  for (const from of unique) {
    for (const to of unique) {
      const key = `${coordKey(from)}>${coordKey(to)}`;
      if (from === to || (from.lat === to.lat && from.lng === to.lng)) {
        minutes.set(key, 0);
        meters.set(key, 0);
      } else {
        minutes.set(key, heuristicDriveMinutes(from, to));
        meters.set(key, Math.round(haversineMiles(from, to) * 1609.34));
      }
    }
  }

  if (!apiKey || unique.length < 2) {
    return {
      minutes,
      meters,
      provider: "heuristic",
      departureTime: params.departureTime,
      warnings: apiKey ? warnings : ["GOOGLE_MAPS_API_KEY missing — using straight-line traffic fallback."]
    };
  }

  try {
    for (let o = 0; o < unique.length; o += MATRIX_MAX_SIDE) {
      const originChunk = unique.slice(o, o + MATRIX_MAX_SIDE);
      for (let d = 0; d < unique.length; d += MATRIX_MAX_SIDE) {
        const destChunk = unique.slice(d, d + MATRIX_MAX_SIDE);
        const cells = await fetchRouteMatrixChunk({
          origins: originChunk,
          destinations: destChunk,
          departureTime: params.departureTime,
          apiKey
        });
        for (const cell of cells) {
          const from = originChunk[cell.originIndex];
          const to = destChunk[cell.destinationIndex];
          if (!from || !to) continue;
          const key = `${coordKey(from)}>${coordKey(to)}`;
          minutes.set(key, cell.minutes);
          meters.set(key, cell.meters);
        }
      }
    }
    return {
      minutes,
      meters,
      provider: "google_routes",
      departureTime: params.departureTime,
      warnings
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Google Routes matrix failed.");
    return {
      minutes,
      meters,
      provider: "heuristic",
      departureTime: params.departureTime,
      warnings
    };
  }
}

export async function computeLiveDriveMinutes(from: LatLng, to: LatLng): Promise<number | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    departureTime: new Date().toISOString(),
    units: "IMPERIAL"
  };

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.duration"
    },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    routes?: Array<{ duration?: string; legs?: Array<{ duration?: string }> }>;
  };
  const route = json.routes?.[0];
  const seconds =
    parseDurationSeconds(route?.duration) ??
    parseDurationSeconds(route?.legs?.[0]?.duration);
  if (seconds == null) return null;
  return Math.max(1, Math.round(seconds / 60));
}
