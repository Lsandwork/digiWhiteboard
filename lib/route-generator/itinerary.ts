/**
 * Canonical daily transportation itinerary.
 *
 * Pickup + dog + service + drop-off stay linked. Drop-off vans are copied from
 * pickup unless transferAllowed is explicitly true.
 */
import type { FitdogVanKey } from "@/lib/route-generator/flags";
import type { LocationType } from "@/lib/route-generator/destination";
import { locationTypeLabel } from "@/lib/route-generator/destination";
import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";

export type ItineraryStop = {
  locationType: LocationType | "UNKNOWN";
  address: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  householdKey: string | null;
  stopId: string | null;
};

export type DailyDogItinerary = {
  dogId: string;
  dogName: string;
  reservationId: string | null;
  serviceType: string | null;
  serviceClass: string | null;
  pickup: ItineraryStop;
  dropoff: ItineraryStop;
  assignedVanId: FitdogVanKey | null;
  assignedDriverId: string | null;
  pickupStopId: string | null;
  dropoffStopId: string | null;
  assignmentLocked: boolean;
  transferAllowed: boolean;
  diagnostics: string[];
};

function itemKey(item: NormalizedReportItem): string {
  return String(item.reservationId || item.dogId || `${item.dogName || "dog"}:${item.serviceCanonical || ""}`);
}

function locationFromItem(item: NormalizedReportItem): LocationType | "UNKNOWN" {
  if (item.locationType) return item.locationType;
  const raw = item.raw as Record<string, unknown> | undefined;
  const typed = String(raw?.location_type || raw?.locationType || "").toUpperCase();
  if (typed === "HOME" || typed === "FITDOG" || typed === "HUB" || typed === "OUTING" || typed === "CUSTOM") {
    return typed;
  }
  if (item.householdKey && isFacilityHouseholdKey(item.householdKey)) {
    if (item.householdKey.includes(":hub")) return "HUB";
    if (item.householdKey.includes(":kenneth_hahn") || item.householdKey.includes(":huntington")) return "OUTING";
    return "FITDOG";
  }
  return "UNKNOWN";
}

function stopFromItem(
  item: NormalizedReportItem | undefined,
  coords?: { lat: number; lng: number } | null
): ItineraryStop {
  if (!item) {
    return {
      locationType: "UNKNOWN",
      address: null,
      formattedAddress: null,
      latitude: null,
      longitude: null,
      householdKey: null,
      stopId: null
    };
  }
  const locationType = locationFromItem(item);
  const facilityAddress =
    locationType === "FITDOG"
      ? DEFAULT_FITDOG_LOCATIONS.club.address
      : locationType === "HUB"
        ? DEFAULT_FITDOG_LOCATIONS.hub.address
        : null;
  const address = item.addressRaw || facilityAddress;
  return {
    locationType,
    address,
    formattedAddress: address,
    latitude: coords?.lat ?? null,
    longitude: coords?.lng ?? null,
    householdKey: item.householdKey,
    stopId: null
  };
}

export type AssignedStopRef = {
  direction: "pickup" | "dropoff";
  vanKey: string;
  householdKey?: string | null;
  reservationIds?: string[];
  dogIds?: string[];
  dogNames?: string[];
  stopId?: string | null;
};

export function buildDailyDogItineraries(params: {
  items: NormalizedReportItem[];
  assignedStops: AssignedStopRef[];
  coordsByHousehold?: Record<string, { lat: number; lng: number }>;
  transferAllowedKeys?: Set<string>;
}): DailyDogItinerary[] {
  const byKey = new Map<string, { pickup?: NormalizedReportItem; dropoff?: NormalizedReportItem }>();
  for (const item of params.items) {
    const key = itemKey(item);
    const row = byKey.get(key) ?? {};
    if (item.direction === "pickup") row.pickup = item;
    else row.dropoff = item;
    byKey.set(key, row);
  }

  const vanByKey = new Map<string, { pickup?: string; dropoff?: string; pickupStop?: string | null; dropoffStop?: string | null }>();
  for (const stop of params.assignedStops) {
    const ids = [
      ...(stop.reservationIds ?? []),
      ...(stop.dogIds ?? []),
      ...(stop.dogNames ?? [])
    ].map((value) => String(value));
    for (const id of ids) {
      const row = vanByKey.get(id) ?? {};
      if (stop.direction === "pickup") {
        row.pickup = stop.vanKey;
        row.pickupStop = stop.stopId ?? null;
      } else {
        row.dropoff = stop.vanKey;
        row.dropoffStop = stop.stopId ?? null;
      }
      vanByKey.set(id, row);
    }
  }

  const itineraries: DailyDogItinerary[] = [];
  for (const [key, pair] of [...byKey.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const sample = pair.pickup || pair.dropoff;
    if (!sample) continue;
    const lookup =
      vanByKey.get(String(sample.reservationId || "")) ||
      vanByKey.get(String(sample.dogId || "")) ||
      vanByKey.get(String(sample.dogName || "")) ||
      {};
    const transferAllowed = Boolean(params.transferAllowedKeys?.has(key));
    const assignedVanId = (lookup.pickup || lookup.dropoff || null) as FitdogVanKey | null;
    const pickupCoords = pair.pickup?.householdKey
      ? params.coordsByHousehold?.[pair.pickup.householdKey] ?? null
      : null;
    const dropoffCoords = pair.dropoff?.householdKey
      ? params.coordsByHousehold?.[pair.dropoff.householdKey] ?? null
      : null;
    const diagnostics: string[] = [];
    if (assignedVanId) diagnostics.push(`assigned ${assignedVanId.replace("van_", "Van ")}`);
    if (!transferAllowed && lookup.pickup && lookup.dropoff && lookup.pickup === lookup.dropoff) {
      diagnostics.push("preserves original van continuity");
    }
    itineraries.push({
      dogId: String(sample.dogId || key),
      dogName: String(sample.dogName || "Dog"),
      reservationId: sample.reservationId,
      serviceType: sample.serviceCanonical || sample.serviceRaw,
      serviceClass: sample.serviceCanonical || sample.serviceRaw,
      pickup: stopFromItem(pair.pickup, pickupCoords),
      dropoff: stopFromItem(pair.dropoff, dropoffCoords),
      assignedVanId,
      assignedDriverId: null,
      pickupStopId: lookup.pickupStop ?? null,
      dropoffStopId: lookup.dropoffStop ?? null,
      assignmentLocked: Boolean(assignedVanId) && !transferAllowed,
      transferAllowed,
      diagnostics
    });
  }
  return itineraries;
}

export function findVanContinuityBreaks(params: {
  itineraries: DailyDogItinerary[];
  pickupVanByDog: Record<string, string>;
  dropoffVanByDog: Record<string, string>;
}): Array<{ dogName: string; reservationId: string | null; pickupVan: string; dropoffVan: string }> {
  const breaks: Array<{ dogName: string; reservationId: string | null; pickupVan: string; dropoffVan: string }> = [];
  for (const row of params.itineraries) {
    if (row.transferAllowed) continue;
    const key = String(row.reservationId || row.dogId || row.dogName);
    const pickupVan = params.pickupVanByDog[key] || params.pickupVanByDog[row.dogName];
    const dropoffVan = params.dropoffVanByDog[key] || params.dropoffVanByDog[row.dogName];
    if (pickupVan && dropoffVan && pickupVan !== dropoffVan) {
      breaks.push({
        dogName: row.dogName,
        reservationId: row.reservationId,
        pickupVan,
        dropoffVan
      });
    }
  }
  return breaks;
}

export function formatItineraryDebug(row: DailyDogItinerary): string {
  return [
    `DOG: ${row.dogName}`,
    `SOURCE: ${row.reservationId ? `Gingr reservation ${row.reservationId}` : "report item"}`,
    `PICKUP: ${locationTypeLabel(row.pickup.locationType === "UNKNOWN" ? null : row.pickup.locationType)}`,
    `SERVICE: ${row.serviceType || "—"}`,
    `DROPOFF: ${locationTypeLabel(row.dropoff.locationType === "UNKNOWN" ? null : row.dropoff.locationType)}`,
    `VAN: ${row.assignedVanId ? row.assignedVanId.replace("van_", "Van ") : "unassigned"}`
  ].join("\n");
}
