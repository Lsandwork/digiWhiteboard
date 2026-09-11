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

/**
 * Samsara / coordinator label for Club destination stops (drop-off after an outing).
 * Canonical club address stays on DEFAULT_FITDOG_LOCATIONS.club — do not duplicate it.
 */
export const FITDOG_CLUB_STOP_NAME = "Fitdog";

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
    note: "Adventure destination for Van 1 / Van 2 (Mon–Fri) and Van 3 (Tue/Thu)."
  },
  huntington: {
    key: "huntington",
    name: "Huntington Dog Beach",
    address: "Huntington Dog Beach, Huntington Beach, CA 92648",
    latitude: 33.6392,
    longitude: -117.9756,
    timezone: "America/Los_Angeles",
    verified: false,
    note: "Beach destination for Van 3 on Mon/Wed/Fri."
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

/** True when this leg is the Santa Monica Club (not Hub, Hahn, or Huntington). */
export function isClubFitdogLocation(params: {
  locationType?: string | null;
  facilityKey?: string | null;
  householdKey?: string | null;
  locationName?: string | null;
  addressRaw?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressZip?: string | null;
  locations?: FitdogLocationsConfig | null;
}): boolean {
  const type = String(params.locationType || "").toUpperCase();
  if (type === "HUB" || type === "OUTING" || type === "HOME" || type === "CUSTOM") return false;
  if (params.facilityKey === "club") return true;
  if (params.facilityKey && params.facilityKey !== "club") return false;
  const household = String(params.householdKey || "");
  if (household.startsWith("facility:club")) return true;
  if (/^facility:(hub|kenneth_hahn|huntington)(?::|$)/.test(household)) return false;
  const detected = detectFitdogFacility({
    addressRaw: params.addressRaw,
    addressStreet: params.addressStreet,
    addressCity: params.addressCity,
    addressZip: params.addressZip,
    locationName: params.locationName,
    locations: params.locations
  });
  if (detected === "club") return true;
  if (detected) return false;
  return type === "FITDOG";
}

export type VanRouteEndpoints = {
  pickupStart: FitdogBaseKey;
  pickupEnd: FitdogBaseKey;
  dropoffStart: FitdogBaseKey;
  dropoffEnd: FitdogBaseKey;
};

/**
 * Canonical van start/end bases.
 * - Van 1/2: Hub ↔ Kenneth Hahn (Mon–Fri outing)
 * - Van 3: Hub ↔ Huntington (Mon/Wed/Fri) or Kenneth Hahn (Tue/Thu) — see endpointsForVan
 * - Van 5/6: live at Club for taxi / group / training pickups (never Kenneth Hahn)
 */
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
    pickupStart: "club",
    pickupEnd: "club",
    dropoffStart: "club",
    dropoffEnd: "club"
  },
  van_6: {
    pickupStart: "club",
    pickupEnd: "club",
    dropoffStart: "club",
    dropoffEnd: "club"
  }
};

/** Weekday in America/Los_Angeles: 0=Sun … 6=Sat. */
export function weekdayInLosAngeles(date: string | Date | null | undefined): number | null {
  if (date == null || date === "") return null;
  const raw = typeof date === "string" ? date.trim() : date.toISOString().slice(0, 10);
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  // Noon UTC keeps the calendar day stable for LA (UTC-7/-8).
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short"
  }).formatToParts(new Date(`${day}T12:00:00.000Z`));
  const wd = parts.find((p) => p.type === "weekday")?.value;
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return wd && wd in map ? map[wd]! : null;
}

/** Van 3: Huntington Mon/Wed/Fri; Kenneth Hahn Tue/Thu. Default Huntington when date unknown. */
export function van3DestinationKey(operatingDate?: string | null): FitdogBaseKey {
  const weekday = weekdayInLosAngeles(operatingDate);
  if (weekday === 2 || weekday === 4) return "kenneth_hahn";
  return "huntington";
}

export function endpointsForVan(vanKey: string, operatingDate?: string | null): VanRouteEndpoints {
  if (vanKey === "van_3") {
    const destination = van3DestinationKey(operatingDate);
    return {
      pickupStart: "hub",
      pickupEnd: destination,
      dropoffStart: destination,
      dropoffEnd: "hub"
    };
  }
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
 * Resolve start/end for a route using van schedule + operating date.
 * Van 5/6 stay Club-based. Van 3 destination flips by weekday.
 */
export function resolveRouteEndpoints(params: {
  vanKey: string;
  direction: "pickup" | "dropoff";
  serviceTypes?: string[];
  operatingDate?: string | null;
}): { startKey: FitdogBaseKey; endKey: FitdogBaseKey } {
  const base = endpointsForVan(params.vanKey, params.operatingDate);

  if (params.vanKey === "van_5" || params.vanKey === "van_6") {
    return params.direction === "pickup"
      ? { startKey: base.pickupStart, endKey: base.pickupEnd }
      : { startKey: base.dropoffStart, endKey: base.dropoffEnd };
  }

  if (params.direction === "pickup") {
    return { startKey: base.pickupStart, endKey: base.pickupEnd };
  }
  return { startKey: base.dropoffStart, endKey: base.dropoffEnd };
}
