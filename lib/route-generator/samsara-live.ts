/**
 * Minimal Samsara Fleet API client for live vehicle locations (owner ETA tracking).
 * Requires SAMSARA_API_TOKEN (Bearer) with:
 *   - Read Vehicles + Read Vehicle Statistics
 *   - Tag Access = Entire Organization (tag-scoped tokens return empty vehicle lists)
 */

import { normalizeSamsaraSerial } from "@/lib/route-generator/samsara-vans";

export type SamsaraVehicleLocation = {
  id: string;
  name: string;
  serial?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  latitude: number;
  longitude: number;
  speedMilesPerHour: number | null;
  heading: number | null;
  time: string | null;
};

export type SamsaraFleetVehicle = {
  id: string;
  name: string;
  serial: string | null;
  vin: string | null;
  licensePlate: string | null;
};

/** Normalize "Van 01" / "Van 1" / "van_1" for loose matching. */
export function normalizeSamsaraVanLabel(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bvan\s*0*(\d+)\b/g, "van $1");
}

function normalizeVin(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

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

export async function fetchSamsaraFleetVehicles(): Promise<SamsaraFleetVehicle[]> {
  const token = samsaraToken();
  if (!token) return [];

  const response = await fetch("https://api.samsara.com/fleet/vehicles?limit=512", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Samsara fleet/vehicles failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      id?: string | number;
      name?: string;
      vin?: string;
      licensePlate?: string;
      externalIds?: Record<string, string>;
      gateway?: { serial?: string };
    }>;
  };

  return (body.data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name || "").trim(),
    serial: row.externalIds?.["samsara.serial"] || row.gateway?.serial || null,
    vin: row.vin?.trim() || null,
    licensePlate: row.licensePlate?.trim() || null
  }));
}

export async function fetchSamsaraVehicleLocations(): Promise<SamsaraVehicleLocation[]> {
  const token = samsaraToken();
  if (!token) return [];

  const [fleet, response] = await Promise.all([
    fetchSamsaraFleetVehicles().catch(() => [] as SamsaraFleetVehicle[]),
    fetch("https://api.samsara.com/fleet/vehicles/stats?types=gps", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store"
    })
  ]);

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

  const fleetById = new Map(fleet.map((v) => [v.id, v]));
  const vehicles: SamsaraVehicleLocation[] = [];
  for (const row of body.data ?? []) {
    const lat = row.gps?.latitude;
    const lng = row.gps?.longitude;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = String(row.id ?? "");
    const meta = fleetById.get(id);
    const externalIds = (row as { externalIds?: Record<string, string>; gateway?: { serial?: string } }).externalIds;
    const serial =
      meta?.serial ||
      externalIds?.["samsara.serial"] ||
      (row as { gateway?: { serial?: string } }).gateway?.serial ||
      null;
    vehicles.push({
      id,
      name: String(row.name || meta?.name || "").trim(),
      serial,
      vin: meta?.vin ?? null,
      licensePlate: meta?.licensePlate ?? null,
      latitude: lat,
      longitude: lng,
      speedMilesPerHour: row.gps?.speedMilesPerHour ?? null,
      heading: row.gps?.headingDegrees ?? null,
      time: row.gps?.time ?? null
    });
  }
  return vehicles;
}

export type MatchVehicleHints = {
  samsaraVehicleName?: string | null;
  samsaraSerial?: string | null;
  samsaraVehicleId?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
};

/**
 * Match priority: vehicle id → exact name → serial → VIN (name-disambiguated) → plate → loose name.
 * VIN alone is unsafe: Fitdog has a duplicate VIN on "Ignore this" and Van 06.
 */
export function matchVehicleByName(
  vehicles: SamsaraVehicleLocation[],
  samsaraVehicleName: string | null | undefined,
  samsaraSerial?: string | null,
  vinOrHints?: string | null | MatchVehicleHints
): SamsaraVehicleLocation | null {
  const hints: MatchVehicleHints =
    vinOrHints && typeof vinOrHints === "object"
      ? vinOrHints
      : {
          samsaraVehicleName,
          samsaraSerial,
          vin: typeof vinOrHints === "string" ? vinOrHints : null
        };

  const name = hints.samsaraVehicleName ?? samsaraVehicleName;
  const serial = normalizeSamsaraSerial(hints.samsaraSerial ?? samsaraSerial);
  const vin = normalizeVin(hints.vin);
  const plate = String(hints.licensePlate || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const vehicleId = String(hints.samsaraVehicleId || "").trim();
  const target = normalizeSamsaraVanLabel(name);

  if (vehicleId) {
    const byId = vehicles.find((v) => v.id === vehicleId);
    if (byId) return byId;
  }

  if (target) {
    const exact = vehicles.find((v) => normalizeSamsaraVanLabel(v.name) === target);
    if (exact) return exact;
  }

  if (serial) {
    const bySerial = vehicles.find((v) => normalizeSamsaraSerial(v.serial) === serial);
    if (bySerial) return bySerial;
  }

  if (vin) {
    const vinMatches = vehicles.filter((v) => normalizeVin(v.vin) === vin);
    if (vinMatches.length === 1) return vinMatches[0];
    if (vinMatches.length > 1 && target) {
      const named = vinMatches.find((v) => normalizeSamsaraVanLabel(v.name) === target);
      if (named) return named;
    }
    // Prefer real van labels over junk names like "Ignore this".
    const vanLabeled = vinMatches.find((v) => /^van\s*\d+$/i.test(normalizeSamsaraVanLabel(v.name)));
    if (vanLabeled) return vanLabeled;
    if (vinMatches[0]) return vinMatches[0];
  }

  if (plate) {
    const byPlate = vehicles.find(
      (v) =>
        String(v.licensePlate || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "") === plate
    );
    if (byPlate) return byPlate;
  }

  if (!target) return null;
  const loose = vehicles.find((v) => {
    const n = normalizeSamsaraVanLabel(v.name);
    return n.includes(target) || target.includes(n);
  });
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
