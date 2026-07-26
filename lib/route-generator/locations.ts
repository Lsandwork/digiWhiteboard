export type FitdogBaseKey = "hub" | "club";

export type FitdogBaseLocation = {
  key: FitdogBaseKey;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  verified: boolean;
  note?: string;
};

export type FitdogLocationsConfig = {
  hub: FitdogBaseLocation;
  club: FitdogBaseLocation;
};

/** Operational bases — HUB (outing vans) and CLUB (hotel/daycare/training/grooming). */
export const DEFAULT_FITDOG_LOCATIONS: FitdogLocationsConfig = {
  hub: {
    key: "hub",
    name: "HUB",
    address: "2140 Westwood Blvd, West Los Angeles, CA 90025",
    latitude: 34.0447222,
    longitude: -118.4323383,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "3 outing vans start and end here."
  },
  club: {
    key: "club",
    name: "CLUB",
    address: "1712 21st St, Santa Monica, CA 90404",
    latitude: 34.02485,
    longitude: -118.4738934,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Hotel, daycare, training, and grooming center. 2 club vans start and end here."
  }
};

export function normalizeBaseKey(value: string | null | undefined): FitdogBaseKey {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "hub" || raw === "westwood") return "hub";
  if (raw === "club" || raw === "fitdog" || raw === "santa_monica" || raw === "santamonica") return "club";
  return "hub";
}

export function resolveBaseLocation(
  locations: FitdogLocationsConfig | null | undefined,
  key: string | null | undefined
): FitdogBaseLocation {
  const bases = locations ?? DEFAULT_FITDOG_LOCATIONS;
  const normalized = normalizeBaseKey(key);
  return bases[normalized] ?? bases.hub;
}

export function homeBaseForVehiclePool(pool: "club" | "outing"): FitdogBaseKey {
  return pool === "club" ? "club" : "hub";
}

export function labelForStopKind(stopKind: string, baseName?: string | null) {
  if (stopKind === "depot_start" || stopKind === "depot_end") {
    return (baseName || "HUB").toUpperCase() === "CLUB" ? "CLUB" : "HUB";
  }
  return null;
}
