import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import {
  DEFAULT_FITDOG_LOCATIONS,
  detectFitdogFacility,
  resolveBaseLocation,
  type FitdogBaseKey,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { parseAddress } from "@/lib/route-generator/address";
import type { HouseholdStopGroup } from "@/lib/route-generator/households";
import { formatStopDisplayName, groupHouseholds } from "@/lib/route-generator/households";
import type { CanonicalService } from "@/lib/route-generator/flags";
import { splitItemsByServiceAndWindow, timingHouseholdSuffix } from "@/lib/route-generator/timing";

export type FacilityAwareItem = NormalizedReportItem & {
  facilityKey?: FitdogBaseKey | null;
  atFacility?: boolean;
};

function serviceSlug(service: string | null | undefined): string {
  const cleaned = String(service || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

/** facility:club:adventure-hike — keeps Beach and Adventure Club stops on separate vans. */
export function facilityHouseholdKey(
  facilityKey: FitdogBaseKey,
  serviceCanonical: CanonicalService | string | null | undefined
): string {
  return `facility:${facilityKey}:${serviceSlug(serviceCanonical)}`;
}

export function isFacilityHouseholdKey(value: string | null | undefined): boolean {
  return String(value || "").startsWith("facility:");
}

export function facilityBaseKeyFromHousehold(value: string | null | undefined): FitdogBaseKey | null {
  const match = String(value || "").match(/^facility:(hub|club|kenneth_hahn|huntington)(?::|$)/);
  return (match?.[1] as FitdogBaseKey | undefined) ?? null;
}

/**
 * Mark dogs whose pickup/drop-off address is Fitdog Club/Hub (or Fitdog-named location).
 * Those dogs still ride the outing van, but via a facility stop — not a home stop.
 * Facility household keys are split by service so Adventure and Beach never share one stop group.
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
    const key = facilityHouseholdKey(facilityKey, item.serviceCanonical || item.serviceRaw);
    const locationType =
      facilityKey === "hub" ? "HUB" : facilityKey === "club" ? "FITDOG" : "OUTING";
    return {
      ...item,
      facilityKey,
      atFacility: true,
      locationType,
      addressRaw: facility.address,
      addressStreet: parsed.street || facility.address,
      addressUnit: null,
      addressCity: parsed.city,
      addressState: parsed.state,
      addressZip: parsed.zip,
      householdKey: key,
      specialNotes: [item.specialNotes, `At ${facility.name} — no home ${item.direction}`]
        .filter(Boolean)
        .join(" | "),
      driverNotes: [item.driverNotes, `Facility stop: ${facility.name}`].filter(Boolean).join(" | "),
      validationStatus: item.validationStatus === "error" ? "warning" : item.validationStatus,
      validationReasons: (item.validationReasons || []).filter((r) => !/missing address/i.test(r)),
      raw: {
        ...item.raw,
        location_type: locationType,
        location_name: facility.name,
        address: facility.address
      }
    };
  });
}

/** Group households and force Fitdog facility stop display names (per service). */
export function groupHouseholdsWithFacilities(
  items: NormalizedReportItem[],
  locations: FitdogLocationsConfig = DEFAULT_FITDOG_LOCATIONS
): HouseholdStopGroup[] {
  // Facility first, then split home addresses by service + class window band.
  const annotated = splitItemsByServiceAndWindow(annotateFacilityItems(items, locations));
  const groups = groupHouseholds(annotated);
  const out: HouseholdStopGroup[] = [];

  for (const group of groups) {
    const facilityItem = group.items.find((i) => (i as FacilityAwareItem).atFacility) as
      | FacilityAwareItem
      | undefined;
    const facilityKey = facilityItem?.facilityKey;
    if (!facilityKey) {
      out.push({
        ...group,
        ownerName: formatStopDisplayName(group.items)
      });
      continue;
    }

    const facility = resolveBaseLocation(locations, facilityKey);
    // Split by service AND class window so Adventure 7–9am ≠ Adventure noon at Club.
    const byServiceWindow = new Map<string, NormalizedReportItem[]>();
    for (const item of group.items) {
      const service = String(item.serviceCanonical || item.serviceRaw || "unknown");
      const band = timingHouseholdSuffix(item);
      const key = `${service}::${band}`;
      const list = byServiceWindow.get(key) || [];
      list.push(item);
      byServiceWindow.set(key, list);
    }

    for (const [, serviceItems] of byServiceWindow) {
      const service = serviceItems[0]?.serviceCanonical || serviceItems[0]?.serviceRaw || "unknown";
      const band = timingHouseholdSuffix(serviceItems[0]!);
      out.push({
        householdKey: `${facilityHouseholdKey(facilityKey, service)}|${band}`,
        direction: group.direction,
        address: facility.address,
        ownerName: facility.name,
        items: serviceItems,
        dogCount: serviceItems.length
      });
    }
  }

  return out;
}
