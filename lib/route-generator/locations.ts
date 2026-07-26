export type FitdogBaseKey = "hub" | "club" | "kenneth_hahn" | "huntington";

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
  kenneth_hahn: FitdogBaseLocation;
  huntington: FitdogBaseLocation;
};

/** Operational bases + outing destinations used by Route Generator. */
export const DEFAULT_FITDOG_LOCATIONS: FitdogLocationsConfig = {
  hub: {
    key: "hub",
    name: "Fitdog Westwood Hub",
    address: "2140 Westwood Blvd, West Los Angeles, CA 90025",
    latitude: 34.0447222,
    longitude: -118.4323383,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Outing vans start morning pickup here and return here after drop-off."
  },
  club: {
    key: "club",
    name: "Fitdog Club",
    address: "1712 21st St, Santa Monica, CA 90404",
    latitude: 34.02485,
    longitude: -118.4738934,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Hotel/daycare/training. Mid-route stop when dogs are already at Fitdog."
  },
  kenneth_hahn: {
    key: "kenneth_hahn",
    name: "Kenneth Hahn Trail",
    address: "Kenneth Hahn State Recreation Area, Los Angeles, CA 90008",
    latitude: 34.0122,
    longitude: -118.3651,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Adventure Hike destination for Van 1 / Van 2."
  },
  huntington: {
    key: "huntington",
    name: "Huntington Dog Beach",
    address: "Huntington Dog Beach, Huntington Beach, CA 92648",
    latitude: 33.6392,
    longitude: -117.9756,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Beach Excursion destination for Van 3."
  }
};

const BASE_ALIASES: Record<string, FitdogBaseKey> = {
  hub: "hub",
  westwood: "hub",
  "fitdog westwood hub": "hub",
  "westwood hub": "hub",
  club: "club",
  fitdog: "club",
  "fitdog club": "club",
  "fitdog hq": "club",
  santa_monica: "club",
  santamonica: "club",
  kenneth_hahn: "kenneth_hahn",
  "kenneth hahn": "kenneth_hahn",
  "kenneth hahn trail": "kenneth_hahn",
  huntington: "huntington",
  "huntington beach": "huntington",
  "huntington dog beach": "huntington",
  beach: "huntington"
};

export function normalizeBaseKey(value: string | null | undefined, fallback: FitdogBaseKey = "hub"): FitdogBaseKey {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return fallback;
  if (BASE_ALIASES[raw]) return BASE_ALIASES[raw]!;
  const compact = raw.replace(/\s+/g, "_");
  if (compact === "kenneth_hahn" || compact === "huntington" || compact === "hub" || compact === "club") {
    return compact;
  }
  if (raw.includes("kenneth") && raw.includes("hahn")) return "kenneth_hahn";
  if (raw.includes("huntington")) return "huntington";
  if (raw.includes("westwood") || raw === "hub") return "hub";
  if (raw.includes("club") || raw.includes("21st")) return "club";
  return fallback;
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
    return baseName?.trim() || "Fitdog Westwood Hub";
  }
  return null;
}

/** Normalize address text for facility matching. */
export function normalizeAddressFingerprint(value: string | null | undefined): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\bboulevard\b/g, "blvd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect dogs already at a Fitdog facility (CLUB / HUB).
 * Matches club/hub street+city fingerprints and Fitdog-marked location names.
 */
export function detectFitdogFacility(params: {
  addressRaw?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  locationName?: string | null;
  locations?: FitdogLocationsConfig | null;
}): FitdogBaseKey | null {
  const locations = params.locations ?? DEFAULT_FITDOG_LOCATIONS;
  const name = String(params.locationName || "").toLowerCase();
  if (
    name &&
    (name.includes("fitdog hq") ||
      name.includes("fitdog club") ||
      name === "fitdog" ||
      (name.includes("fitdog") && (name.includes("club") || name.includes("hq") || name.includes("hub"))))
  ) {
    if (name.includes("westwood") || name.includes("hub")) return "hub";
    return "club";
  }

  const haystack = normalizeAddressFingerprint(
    [params.addressStreet, params.addressRaw, params.addressCity, params.addressZip].filter(Boolean).join(" ")
  );
  if (!haystack) return null;

  const clubFp = normalizeAddressFingerprint(locations.club.address);
  const hubFp = normalizeAddressFingerprint(locations.hub.address);
  if (haystack.includes("1712") && haystack.includes("21st")) return "club";
  if (haystack.includes("2140") && haystack.includes("westwood")) return "hub";
  if (clubFp && haystack.includes(clubFp.split(" ").slice(0, 3).join(" "))) return "club";
  if (hubFp && haystack.includes(hubFp.split(" ").slice(0, 3).join(" "))) return "hub";
  return null;
}

export type VanRouteEndpoints = {
  pickupStart: FitdogBaseKey;
  pickupEnd: FitdogBaseKey;
  dropoffStart: FitdogBaseKey;
  dropoffEnd: FitdogBaseKey;
};

/** Canonical van start/end bases for pickup and drop-off waves. */
export const DEFAULT_VAN_ROUTE_ENDPOINTS: Record<string, VanRouteEndpoints> = {
  van_1: {
    pickupStart: "hub",
    pickupEnd: "kenneth_hahn",
    dropoffStart: "kenneth_hahn",
    dropoffEnd: "hub"
  },
  van_2: {
    pickupStart: "hub",
    pickupEnd: "kenneth_hahn",
    dropoffStart: "kenneth_hahn",
    dropoffEnd: "hub"
  },
  van_3: {
    pickupStart: "hub",
    pickupEnd: "huntington",
    dropoffStart: "huntington",
    dropoffEnd: "hub"
  },
  van_5: {
    pickupStart: "hub",
    pickupEnd: "kenneth_hahn",
    dropoffStart: "kenneth_hahn",
    dropoffEnd: "hub"
  },
  van_6: {
    pickupStart: "hub",
    pickupEnd: "kenneth_hahn",
    dropoffStart: "kenneth_hahn",
    dropoffEnd: "hub"
  }
};

export function endpointsForVan(vanKey: string): VanRouteEndpoints {
  return (
    DEFAULT_VAN_ROUTE_ENDPOINTS[vanKey] ?? {
      pickupStart: "hub",
      pickupEnd: "hub",
      dropoffStart: "hub",
      dropoffEnd: "hub"
    }
  );
}

/**
 * Resolve start/end for a route. Beach-only vans/routes use Huntington;
 * Adventure / default outing vans use Kenneth Hahn.
 */
export function resolveRouteEndpoints(params: {
  vanKey: string;
  direction: "pickup" | "dropoff";
  serviceTypes?: string[];
}): { startKey: FitdogBaseKey; endKey: FitdogBaseKey } {
  const base = endpointsForVan(params.vanKey);
  const services = (params.serviceTypes || []).map((s) => s.toLowerCase());
  const beachOnly =
    params.vanKey === "van_3" ||
    (services.includes("beach excursion") && !services.includes("adventure hike"));

  if (params.direction === "pickup") {
    if (beachOnly) return { startKey: "hub", endKey: "huntington" };
    if (params.vanKey === "van_1" || params.vanKey === "van_2" || params.vanKey === "van_5" || params.vanKey === "van_6") {
      return { startKey: base.pickupStart, endKey: base.pickupEnd };
    }
    return { startKey: base.pickupStart, endKey: base.pickupEnd };
  }

  if (beachOnly) return { startKey: "huntington", endKey: "hub" };
  return { startKey: base.dropoffStart, endKey: base.dropoffEnd };
}
