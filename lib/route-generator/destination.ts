/**
 * Explicit pickup/drop-off destination types.
 *
 * Pickup and drop-off are independent. NEVER infer afternoon destination from
 * morning pickup, home profile, or "most common" behavior.
 */
import {
  DEFAULT_FITDOG_LOCATIONS,
  detectFitdogFacility,
  resolveBaseLocation,
  type FitdogBaseKey,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { parseAddress } from "@/lib/route-generator/address";

export type LocationType = "HOME" | "FITDOG" | "HUB" | "OUTING" | "CUSTOM";

export type ResolvedDestination = {
  locationType: LocationType;
  facilityKey: FitdogBaseKey | null;
  displayName: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "fitdog_detail" | "facility_registry" | "manual" | "gingr" | "inferred_facility_name";
  sourceLocationId: string | null;
  isDefault: boolean | null;
};

function clean(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return null;
  return text;
}

function facilityLocationType(key: FitdogBaseKey): LocationType {
  if (key === "hub") return "HUB";
  if (key === "club") return "FITDOG";
  return "OUTING";
}

export function formatPostalAddress(parts: {
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string | null {
  const street = [clean(parts.street1), clean(parts.street2)].filter(Boolean).join(" ");
  const cityStateZip = [clean(parts.city), clean(parts.state), clean(parts.postalCode)]
    .filter(Boolean)
    .join(clean(parts.state) && clean(parts.postalCode) ? " " : ", ")
    .replace(/\s+,/g, ",");
  // "Santa Monica, CA 90401"
  const locality = [clean(parts.city), [clean(parts.state), clean(parts.postalCode)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const country = clean(parts.country) || "USA";
  const line = [street || null, locality || cityStateZip || null, country].filter(Boolean).join(", ");
  return line || null;
}

/**
 * Resolve an explicit destination from Fitdog location detail + flags.
 *
 * Rules:
 * - Facility name/address/id → FITDOG / HUB / OUTING from the shared registry
 * - Otherwise a postal address → HOME (customer) or CUSTOM
 * - Empty address with a Fitdog-ish name still resolves via registry
 * - is_default_* is recorded but does not invent a destination from the other leg
 */
export function resolveDestinationFromFitdogDetail(params: {
  detail?: {
    id?: number | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    name?: string | null;
    location_notes?: string | null;
  } | null;
  isDefault?: boolean | null;
  locations?: FitdogLocationsConfig | null;
}): ResolvedDestination {
  const locations = params.locations ?? DEFAULT_FITDOG_LOCATIONS;
  const detail = params.detail ?? null;
  const street1 = clean(detail?.address1);
  const street2 = clean(detail?.address2);
  const city = clean(detail?.city);
  const state = clean(detail?.state);
  const postalCode = clean(detail?.zip_code);
  const displayName = clean(detail?.name);
  const rawJoined = [street1, street2, city, state, postalCode].filter(Boolean).join(", ");

  const facilityKey = detectFitdogFacility({
    addressRaw: rawJoined,
    addressStreet: street1,
    addressCity: city,
    addressZip: postalCode,
    locationName: displayName,
    locations
  });

  if (facilityKey) {
    const facility = resolveBaseLocation(locations, facilityKey);
    const parsed = parseAddress(facility.address);
    return {
      locationType: facilityLocationType(facilityKey),
      facilityKey,
      displayName: facility.name,
      street1: parsed.street || facility.address,
      street2: null,
      city: parsed.city,
      state: parsed.state,
      postalCode: parsed.zip,
      country: "USA",
      formattedAddress: formatPostalAddress({
        street1: parsed.street || facility.address,
        city: parsed.city,
        state: parsed.state,
        postalCode: parsed.zip,
        country: "USA"
      }),
      latitude: facility.latitude,
      longitude: facility.longitude,
      source: "facility_registry",
      sourceLocationId: detail?.id != null ? String(detail.id) : facilityKey,
      isDefault: params.isDefault ?? null
    };
  }

  const formatted = formatPostalAddress({
    street1,
    street2,
    city,
    state,
    postalCode,
    country: "USA"
  });

  return {
    locationType: formatted ? "HOME" : "CUSTOM",
    facilityKey: null,
    displayName,
    street1,
    street2,
    city,
    state,
    postalCode,
    country: "USA",
    formattedAddress: formatted,
    latitude: null,
    longitude: null,
    source: "fitdog_detail",
    sourceLocationId: detail?.id != null ? String(detail.id) : null,
    isDefault: params.isDefault ?? null
  };
}

/** Transport leg is required when the dog must physically move for that wave. */
export function isTransportLegRequired(params: {
  direction: "pickup" | "dropoff";
  locationType: LocationType | null | undefined;
  serviceCanonical?: string | null;
}): { required: boolean; reason: string | null } {
  const type = params.locationType;
  if (!type) {
    return { required: true, reason: null };
  }
  // Facility-only "stay at Fitdog" still needs a facility stop so the van collects them.
  // NOT_REQUIRED only when there is explicitly no movement request (handled upstream).
  return { required: true, reason: null };
}

export function locationTypeLabel(type: LocationType | null | undefined): string {
  switch (type) {
    case "HOME":
      return "HOME";
    case "FITDOG":
      return "FITDOG";
    case "HUB":
      return "HUB";
    case "OUTING":
      return "OUTING";
    case "CUSTOM":
      return "CUSTOM";
    default:
      return "UNKNOWN";
  }
}
