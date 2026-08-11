/**
 * Google Geocoding + route_address_cache.
 * Customer stops must not export synthetic Santa Monica pins against real streets —
 * Samsara pins from lat/lng and the coordinator then has to re-enter every address.
 */
import { createHash } from "crypto";

import { addressCacheKey } from "@/lib/route-generator/address";
import { getServiceSupabase } from "@/lib/supabase/server";

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  confidence: number;
  provider: "google" | "cache" | "facility";
  cacheHit: boolean;
};

function mapsKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || null;
}

export function isGeocodingConfigured(): boolean {
  return Boolean(mapsKey());
}

async function readCache(key: string): Promise<GeocodeResult | null> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("route_address_cache")
      .select("*")
      .eq("address_key", key)
      .maybeSingle();
    if (!data) return null;
    if (data.validation_status === "invalid") return null;
    if (data.latitude == null || data.longitude == null) return null;
    return {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      formattedAddress: data.normalized_address ? String(data.normalized_address) : null,
      confidence: data.geocoder_confidence != null ? Number(data.geocoder_confidence) : 0.5,
      provider: "cache",
      cacheHit: true
    };
  } catch {
    return null;
  }
}

async function writeCache(params: {
  key: string;
  original: string;
  result: GeocodeResult;
  status: "valid" | "low_confidence" | "invalid";
}) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("route_address_cache").upsert(
      {
        address_key: params.key,
        original_address: params.original,
        normalized_address: params.result.formattedAddress,
        latitude: params.result.latitude,
        longitude: params.result.longitude,
        geocoder_confidence: params.result.confidence,
        validation_status: params.status,
        provider: params.result.provider === "cache" ? "google" : params.result.provider,
        updated_at: new Date().toISOString()
      },
      { onConflict: "address_key" }
    );
  } catch {
    // Cache write is best-effort — never block generate/export.
  }
}

async function geocodeGoogle(address: string): Promise<GeocodeResult | null> {
  const key = mapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "us");
  const response = await fetch(url.toString(), { method: "GET" });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number }; location_type?: string };
      partial_match?: boolean;
    }>;
  };
  if (body.status !== "OK" || !body.results?.length) return null;
  const top = body.results[0]!;
  const lat = top.geometry?.location?.lat;
  const lng = top.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const locationType = top.geometry?.location_type || "";
  let confidence = 0.7;
  if (locationType === "ROOFTOP") confidence = 0.95;
  else if (locationType === "RANGE_INTERPOLATED") confidence = 0.85;
  else if (locationType === "GEOMETRIC_CENTER") confidence = 0.65;
  else if (locationType === "APPROXIMATE") confidence = 0.45;
  if (top.partial_match) confidence -= 0.15;
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: top.formatted_address || address,
    confidence,
    provider: "google",
    cacheHit: false
  };
}

/**
 * Resolve lat/lng for a postal address. Prefer cache, then Google.
 * Returns null when geocoding is unavailable or the address cannot be resolved —
 * callers must NOT invent Santa Monica synthetic pins for customer homes.
 */
export async function geocodePostalAddress(
  address: string | null | undefined
): Promise<GeocodeResult | null> {
  const original = String(address || "").trim();
  if (!original || original.length < 8) return null;
  const key = addressCacheKey(original) || createHash("sha1").update(original.toLowerCase()).digest("hex");
  const cached = await readCache(key);
  if (cached) return cached;
  const fresh = await geocodeGoogle(original);
  if (!fresh) return null;
  await writeCache({
    key,
    original,
    result: fresh,
    status: fresh.confidence >= 0.6 ? "valid" : "low_confidence"
  });
  return fresh;
}

export async function geocodeMany(
  addresses: string[]
): Promise<Map<string, GeocodeResult>> {
  const out = new Map<string, GeocodeResult>();
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  // Bound concurrency — generate must stay under Vercel maxDuration.
  const queue = [...unique];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      const result = await geocodePostalAddress(next);
      if (result) out.set(next, result);
    }
  });
  await Promise.all(workers);
  return out;
}
