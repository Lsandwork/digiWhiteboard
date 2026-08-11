/**
 * Route reconciliation: every valid service occurrence must be ACCOUNTABLE.
 * Status is ASSIGNED | NOT_REQUIRED | BLOCKED_WITH_REASON — never silently omitted.
 */
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import type { LocationType } from "@/lib/route-generator/destination";
import { locationTypeLabel } from "@/lib/route-generator/destination";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";

export type LegStatus = "ASSIGNED" | "NOT_REQUIRED" | "BLOCKED_WITH_REASON" | "UNASSIGNED";

export type TransportLegExpectation = {
  legId: string;
  serviceOccurrenceId: string;
  reservationId: string | null;
  dogId: string | null;
  dogName: string | null;
  ownerName: string | null;
  serviceRaw: string | null;
  serviceCanonical: string | null;
  direction: "pickup" | "dropoff";
  locationType: LocationType | "UNKNOWN";
  locationLabel: string;
  address: string | null;
  source: string;
  status: LegStatus;
  reason: string | null;
  routeVanKey: string | null;
  routeName: string | null;
  stopId: string | null;
};

export type ReconciliationReport = {
  expectedCount: number;
  assignedCount: number;
  notRequiredCount: number;
  blockedCount: number;
  unassignedCount: number;
  missingCount: number;
  ok: boolean;
  legs: TransportLegExpectation[];
  missing: TransportLegExpectation[];
  blocked: TransportLegExpectation[];
  unassigned: TransportLegExpectation[];
};

function occurrenceId(item: NormalizedReportItem): string {
  const reservation = item.reservationId || item.dogId || item.dogName || "unknown";
  return `${reservation}:${item.direction}:${item.serviceCanonical || item.serviceRaw || "svc"}`;
}

function legId(item: NormalizedReportItem): string {
  return `${occurrenceId(item)}:leg`;
}

function itemSource(item: NormalizedReportItem): string {
  const raw = item.raw as Record<string, unknown>;
  if (raw?.source === "manual" || raw?.source === "manual_taxi" || raw?.manual === true) return "Manual";
  if (raw?.source === "gingr_taxi" || String(raw?.source || "").includes("gingr")) return "Gingr";
  return "Fitdog/Gingr";
}

function itemLocationType(item: NormalizedReportItem): LocationType | "UNKNOWN" {
  const raw = item.raw as Record<string, unknown>;
  const typed = raw?.location_type || raw?.locationType;
  if (
    typed === "HOME" ||
    typed === "FITDOG" ||
    typed === "HUB" ||
    typed === "OUTING" ||
    typed === "CUSTOM"
  ) {
    return typed;
  }
  if (item.householdKey && isFacilityHouseholdKey(item.householdKey)) {
    if (item.householdKey.includes(":hub")) return "HUB";
    if (item.householdKey.includes(":kenneth_hahn") || item.householdKey.includes(":huntington")) {
      return "OUTING";
    }
    return "FITDOG";
  }
  if (item.addressRaw) return "HOME";
  return "UNKNOWN";
}

export function buildExpectedTransportLegs(
  items: NormalizedReportItem[]
): TransportLegExpectation[] {
  return items.map((item) => {
    const locationType = itemLocationType(item);
    const blocked =
      item.validationStatus === "error" ||
      !item.serviceCanonical ||
      (!item.addressRaw && locationType === "UNKNOWN");
    return {
      legId: legId(item),
      serviceOccurrenceId: occurrenceId(item),
      reservationId: item.reservationId,
      dogId: item.dogId,
      dogName: item.dogName,
      ownerName: item.ownerFullName,
      serviceRaw: item.serviceRaw,
      serviceCanonical: item.serviceCanonical,
      direction: item.direction,
      locationType,
      locationLabel: locationTypeLabel(locationType === "UNKNOWN" ? null : locationType),
      address: item.addressRaw,
      source: itemSource(item),
      status: blocked ? "BLOCKED_WITH_REASON" : "UNASSIGNED",
      reason: blocked
        ? item.validationReasons?.join("; ") ||
          (!item.serviceCanonical ? "Unrecognized service" : "Missing address")
        : null,
      routeVanKey: null,
      routeName: null,
      stopId: null
    };
  });
}

export type AssignedStopRef = {
  stopId: string;
  routeVanKey: string;
  routeName?: string | null;
  direction: "pickup" | "dropoff";
  reservationIds: string[];
  dogIds: string[];
  dogNames: string[];
  householdKey?: string | null;
};

/**
 * Reconcile expected legs against generated stop assignments.
 * Capacity overflow stays UNASSIGNED (visible) — never disappears.
 */
export function reconcileTransportLegs(params: {
  items: NormalizedReportItem[];
  assignedStops: AssignedStopRef[];
  notRequiredLegIds?: string[];
}): ReconciliationReport {
  const legs = buildExpectedTransportLegs(params.items);
  const notRequired = new Set(params.notRequiredLegIds ?? []);

  for (const leg of legs) {
    if (notRequired.has(leg.legId)) {
      leg.status = "NOT_REQUIRED";
      leg.reason = leg.reason || "No transportation leg required for this service occurrence.";
      continue;
    }
    if (leg.status === "BLOCKED_WITH_REASON") continue;

    const match = params.assignedStops.find((stop) => {
      if (stop.direction !== leg.direction) return false;
      if (leg.reservationId && stop.reservationIds.includes(leg.reservationId)) return true;
      if (leg.dogId && stop.dogIds.includes(leg.dogId)) return true;
      if (
        leg.dogName &&
        stop.dogNames.some((name) => name.toLowerCase() === String(leg.dogName).toLowerCase())
      ) {
        return true;
      }
      return false;
    });

    if (match) {
      leg.status = "ASSIGNED";
      leg.reason = null;
      leg.routeVanKey = match.routeVanKey;
      leg.routeName = match.routeName ?? null;
      leg.stopId = match.stopId;
    } else {
      leg.status = "UNASSIGNED";
      leg.reason = leg.reason || "Not placed on any route (capacity, eligibility, or generator skip).";
    }
  }

  const assigned = legs.filter((l) => l.status === "ASSIGNED");
  const blocked = legs.filter((l) => l.status === "BLOCKED_WITH_REASON");
  const unassigned = legs.filter((l) => l.status === "UNASSIGNED");
  const notRequiredLegs = legs.filter((l) => l.status === "NOT_REQUIRED");
  const missing = [...unassigned, ...blocked];

  return {
    expectedCount: legs.length,
    assignedCount: assigned.length,
    notRequiredCount: notRequiredLegs.length,
    blockedCount: blocked.length,
    unassignedCount: unassigned.length,
    missingCount: missing.length,
    ok: missing.length === 0,
    legs,
    missing,
    blocked,
    unassigned
  };
}

export function formatMissingLeg(leg: TransportLegExpectation): string {
  const dog = leg.dogName || "Unknown dog";
  const service = leg.serviceCanonical || leg.serviceRaw || "Service";
  const wave = leg.direction === "pickup" ? "Pickup" : "Drop-off";
  const where = leg.locationLabel;
  const why = leg.reason ? ` — ${leg.reason}` : "";
  return `${dog} — ${service} — ${wave} (${where})${why}`;
}
