/**
 * Minimal Samsara Fleet API client for live vehicle locations (owner ETA tracking).
 * Requires SAMSARA_API_TOKEN (Bearer).
 */

export type SamsaraVehicleLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  speedMilesPerHour: number | null;
  heading: number | null;
  time: string | null;
};

function samsaraToken(): string | null {
  const token =
    process.env.SAMSARA_API_TOKEN?.trim() ||
    process.env.SAMSARA_API_KEY?.trim() ||
    process.env.SAMSARA_BEARER_TOKEN?.trim() ||
    "";
  return token || null;
}

export function isSamsaraLiveConfigured(): boolean {
  return Boolean(samsaraToken());
}

export async function fetchSamsaraVehicleLocations(): Promise<SamsaraVehicleLocation[]> {
  const token = samsaraToken();
  if (!token) return [];

  const response = await fetch("https://api.samsara.com/fleet/vehicles/stats?types=gps", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Samsara vehicles/stats failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      id?: string | number;
      name?: string;
      gps?: {
        latitude?: number;
        longitude?: number;
        speedMilesPerHour?: number;
        headingDegrees?: number;
        time?: string;
      };
    }>;
  };

  return (body.data ?? [])
    .map((row) => {
      const lat = row.gps?.latitude;
      const lng = row.gps?.longitude;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        id: String(row.id ?? ""),
        name: String(row.name || "").trim(),
        latitude: lat,
        longitude: lng,
        speedMilesPerHour: row.gps?.speedMilesPerHour ?? null,
        heading: row.gps?.headingDegrees ?? null,
        time: row.gps?.time ?? null
      } satisfies SamsaraVehicleLocation;
    })
    .filter((row): row is SamsaraVehicleLocation => Boolean(row));
}

export function matchVehicleByName(
  vehicles: SamsaraVehicleLocation[],
  samsaraVehicleName: string | null | undefined
): SamsaraVehicleLocation | null {
  const target = String(samsaraVehicleName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!target) return null;
  const exact = vehicles.find((v) => v.name.toLowerCase() === target);
  if (exact) return exact;
  const loose = vehicles.find(
    (v) => v.name.toLowerCase().includes(target) || target.includes(v.name.toLowerCase())
  );
  return loose ?? null;
}

/** Rough road ETA minutes from haversine distance (urban LA factor). */
export function etaMinutesFromCoords(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  speedMph = 18
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  // Road distance ~1.35x straight line in LA; clamp for UI stability.
  const roadMiles = miles * 1.35;
  const minutes = (roadMiles / Math.max(8, speedMph)) * 60;
  return Math.max(1, Math.round(minutes));
}
