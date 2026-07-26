import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import {
  DEFAULT_FITDOG_LOCATIONS,
  detectFitdogFacility,
  resolveBaseLocation,
  type FitdogBaseKey,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { householdKey, parseAddress } from "@/lib/route-generator/address";
import type { HouseholdStopGroup } from "@/lib/route-generator/households";
import { formatStopDisplayName, groupHouseholds } from "@/lib/route-generator/households";

export type FacilityAwareItem = NormalizedReportItem & {
  facilityKey?: FitdogBaseKey | null;
  atFacility?: boolean;
};

/**
 * Mark dogs whose pickup/drop-off address is Fitdog Club/Hub (or Fitdog-named location).
 * Those dogs still ride the outing van, but via a facility stop — not a home stop.
 */
export function annotateFacilityItems(
  items: NormalizedReportItem[],
  locations: FitdogLocationsConfig = DEFAULT_FITDOG_LOCATIONS
): FacilityAwareItem[] {
  return items.map((item) => {
    const locationName =
      (item.raw?.location_name as string | undefined) ||
      (item.raw?.name as string | undefined) ||
      (item.raw?.pickup_location_name as string | undefined) ||
      (item.raw?.dropoff_location_name as string | undefined) ||
      null;
    const facilityKey = detectFitdogFacility({
      addressRaw: item.addressRaw,
      addressStreet: item.addressStreet,
      addressCity: item.addressCity,
      addressZip: item.addressZip,
      locationName,
      locations
    });
    if (!facilityKey) return { ...item, facilityKey: null, atFacility: false };

    const facility = resolveBaseLocation(locations, facilityKey);
    const parsed = parseAddress(facility.address);
    return {
      ...item,
      facilityKey,
      atFacility: true,
      addressRaw: facility.address,
      addressStreet: parsed.street || facility.address,
      addressUnit: null,
      addressCity: parsed.city,
      addressState: parsed.state,
      addressZip: parsed.zip,
      householdKey: householdKey(parsed) || `facility:${facilityKey}`,
      specialNotes: [item.specialNotes, `At ${facility.name} — no home ${item.direction}`]
        .filter(Boolean)
        .join(" · "),
      driverNotes: [item.driverNotes, `Facility stop: ${facility.name}`].filter(Boolean).join(" · "),
      validationStatus: item.validationStatus === "error" ? "warning" : item.validationStatus,
      validationReasons: (item.validationReasons || []).filter((r) => !/missing address/i.test(r))
    };
  });
}

/** Group households and force Fitdog facility stop display names. */
export function groupHouseholdsWithFacilities(
  items: NormalizedReportItem[],
  locations: FitdogLocationsConfig = DEFAULT_FITDOG_LOCATIONS
): HouseholdStopGroup[] {
  const annotated = annotateFacilityItems(items, locations);
  const groups = groupHouseholds(annotated);
  return groups.map((group) => {
    const facilityItem = group.items.find((i) => (i as FacilityAwareItem).atFacility);
    const facilityKey = (facilityItem as FacilityAwareItem | undefined)?.facilityKey;
    if (!facilityKey) {
      return {
        ...group,
        ownerName: formatStopDisplayName(group.items)
      };
    }
    const facility = resolveBaseLocation(locations, facilityKey);
    return {
      ...group,
      householdKey: `facility:${facilityKey}`,
      address: facility.address,
      ownerName: facility.name
    };
  });
}
