/**
 * Pre-approval / pre-export validation gate.
 * Routes must not silently approve when locations or dogs are wrong.
 */
import type { ReconciliationReport } from "@/lib/route-generator/reconciliation";
import { formatMissingLeg } from "@/lib/route-generator/reconciliation";
import { hasFiniteCoords } from "@/lib/route-generator/household-coords";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";
import { looksLikePostalAddress } from "@/lib/route-generator/address";
import type { DailyDogItinerary } from "@/lib/route-generator/itinerary";
import { findVanContinuityBreaks } from "@/lib/route-generator/itinerary";

export type PlanValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  stopId?: string | null;
  dogName?: string | null;
};

export type PlanValidationResult = {
  ok: boolean;
  ready: boolean;
  issues: PlanValidationIssue[];
  checks: Array<{ id: string; pass: boolean; detail: string }>;
  addressIssueCount: number;
  missingLegCount: number;
  missingDogs: string[];
  duplicateDogs: string[];
};

export type ValidatableStop = {
  id: string;
  stopKind: string;
  ownerName?: string | null;
  address?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  householdKey?: string | null;
  locationType?: string | null;
  dogNames?: string[];
  dogIds?: string[];
  reservationIds?: string[];
  direction?: "pickup" | "dropoff" | string | null;
  vanKey?: string | null;
};

function dogIdentity(params: {
  reservationId?: string | null;
  dogId?: string | null;
  dogName?: string | null;
  direction?: string | null;
}): string | null {
  const core = String(params.reservationId || params.dogId || params.dogName || "").trim();
  if (!core) return null;
  return `${core}|${params.direction || ""}`;
}

function isFitdogFacilityAddress(address: string): boolean {
  return /1712\s+21st|2140\s+Westwood|fitdog club|westwood hub|kenneth hahn|huntington dog beach/i.test(
    address
  );
}

export function validateRoutePlan(params: {
  reconciliation: ReconciliationReport;
  stops: ValidatableStop[];
  requireCoordinates?: boolean;
  expectedDogKeys?: string[];
  itineraries?: DailyDogItinerary[];
}): PlanValidationResult {
  const issues: PlanValidationIssue[] = [];
  const checks: PlanValidationResult["checks"] = [];
  const requireCoordinates = params.requireCoordinates !== false;

  // 1) Reconciliation
  const missing = params.reconciliation.missing;
  checks.push({
    id: "legs_reconciled",
    pass: missing.length === 0,
    detail:
      missing.length === 0
        ? `All ${params.reconciliation.expectedCount} transport legs accounted for.`
        : `${missing.length} transport leg(s) unassigned or blocked.`
  });
  for (const leg of missing.slice(0, 40)) {
    issues.push({
      code: leg.status === "BLOCKED_WITH_REASON" ? "leg_blocked" : "leg_unassigned",
      severity: "error",
      message: formatMissingLeg(leg),
      dogName: leg.dogName
    });
  }

  // 2) Physical stop locations
  let addressIssueCount = 0;
  const customerStops = params.stops.filter((s) => s.stopKind === "customer" || s.stopKind === "depot_start" || s.stopKind === "depot_end");
  for (const stop of customerStops) {
    const address = String(stop.formattedAddress || stop.address || "").trim();
    const isFacilityKey = isFacilityHouseholdKey(stop.householdKey);
    const isFacilityType =
      stop.locationType === "FITDOG" || stop.locationType === "HUB" || stop.locationType === "OUTING";
    if (!address) {
      addressIssueCount += 1;
      issues.push({
        code: "address_blank",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" is missing a postal address.`,
        stopId: stop.id,
        dogName: stop.ownerName
      });
      continue;
    }
    // Dog/owner names must never masquerade as geocodable addresses.
    if (/^[A-Za-z][A-Za-z\s'+.-]{1,40}$/.test(address) && !/\d/.test(address) && !isFacilityKey && !isFitdogFacilityAddress(address)) {
      addressIssueCount += 1;
      issues.push({
        code: "address_looks_like_name",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" address looks like a name ("${address}"), not a postal address.`,
        stopId: stop.id,
        dogName: stop.ownerName
      });
    }
    if (requireCoordinates && !hasFiniteCoords(stop.latitude, stop.longitude)) {
      addressIssueCount += 1;
      issues.push({
        code: "coords_missing",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" needs valid latitude/longitude before Samsara export.`,
        stopId: stop.id,
        dogName: stop.ownerName
      });
    }
    // HOME must not point at Fitdog Club street; FITDOG must not be a random home street without facility key.
    if (stop.locationType === "HOME" && isFitdogFacilityAddress(address)) {
      addressIssueCount += 1;
      issues.push({
        code: "home_points_at_fitdog",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" is marked HOME but address is a Fitdog facility.`,
        stopId: stop.id,
        dogName: stop.ownerName
      });
    }
    if (
      isFacilityType &&
      looksLikePostalAddress(address) &&
      !isFitdogFacilityAddress(address) &&
      !isFacilityKey
    ) {
      addressIssueCount += 1;
      issues.push({
        code: "fitdog_replaced_with_home",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" is marked ${stop.locationType} but the address looks like a home street ("${address}").`,
        stopId: stop.id,
        dogName: stop.ownerName
      });
    }
  }
  checks.push({
    id: "addresses_resolved",
    pass: addressIssueCount === 0,
    detail:
      addressIssueCount === 0
        ? "All stops have resolvable locations."
        : `${addressIssueCount} stop(s) need location review before Samsara.`
  });
  checks.push({
    id: "destinations_preserved",
    pass: !issues.some((issue) => issue.code === "fitdog_replaced_with_home" || issue.code === "home_points_at_fitdog"),
    detail: "Pickup/drop-off location types were not substituted."
  });

  checks.push({
    id: "no_duplicate_silent_drops",
    pass: params.reconciliation.unassignedCount === params.reconciliation.unassigned.length,
    detail: "Unassigned legs are explicitly listed."
  });

  // 3) Dog identity: expected vs routed (per direction).
  const routedKeys: string[] = [];
  const pickupVanByDog: Record<string, string> = {};
  const dropoffVanByDog: Record<string, string> = {};
  for (const stop of params.stops.filter((s) => s.stopKind === "customer")) {
    const names = stop.dogNames?.length ? stop.dogNames : stop.ownerName ? [stop.ownerName] : [];
    const ids = stop.dogIds ?? [];
    const reservations = stop.reservationIds ?? [];
    const count = Math.max(names.length, ids.length, reservations.length, 1);
    for (let i = 0; i < count; i += 1) {
      const identity = dogIdentity({
        reservationId: reservations[i] ?? reservations[0] ?? null,
        dogId: ids[i] ?? ids[0] ?? null,
        dogName: names[i] ?? names[0] ?? null,
        direction: stop.direction ?? null
      });
      if (identity) routedKeys.push(identity);
      const core = String(reservations[i] || ids[i] || names[i] || "").trim();
      if (core && stop.vanKey) {
        if (stop.direction === "dropoff") dropoffVanByDog[core] = String(stop.vanKey);
        else pickupVanByDog[core] = String(stop.vanKey);
      }
    }
  }

  const duplicateDogs: string[] = [];
  const seen = new Map<string, number>();
  for (const key of routedKeys) {
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) {
      const [core, direction] = key.split("|");
      duplicateDogs.push(`${core} (${direction || "route"})`);
      issues.push({
        code: "dog_duplicate",
        severity: "error",
        message: `${core} appears ${count} times on ${direction || "the route"}`,
        dogName: core
      });
    }
  }

  const expectedKeys = params.expectedDogKeys ?? [];
  const missingDogs: string[] = [];
  if (expectedKeys.length) {
    const routedSet = new Set(routedKeys);
    for (const key of expectedKeys) {
      if (!routedSet.has(key)) {
        const [core, direction] = key.split("|");
        missingDogs.push(`${core} — ${direction || "transport"}`);
        issues.push({
          code: "dog_missing",
          severity: "error",
          message: `${core} — ${direction || "transport"}`,
          dogName: core
        });
      }
    }
  }

  checks.push({
    id: "no_duplicate_dogs",
    pass: duplicateDogs.length === 0,
    detail: duplicateDogs.length === 0 ? "No duplicate dogs." : `${duplicateDogs.length} duplicate dog(s).`
  });
  checks.push({
    id: "no_missing_dogs",
    pass: missingDogs.length === 0 && missing.length === 0,
    detail:
      missingDogs.length === 0 && missing.length === 0
        ? "All expected transport dogs are present."
        : `${missingDogs.length || missing.length} dog(s) missing from generated stops.`
  });

  const continuityBreaks = params.itineraries
    ? findVanContinuityBreaks({ itineraries: params.itineraries, pickupVanByDog, dropoffVanByDog })
    : Object.keys(pickupVanByDog)
        .filter((key) => dropoffVanByDog[key] && dropoffVanByDog[key] !== pickupVanByDog[key])
        .map((key) => ({
          dogName: key,
          reservationId: null,
          pickupVan: pickupVanByDog[key]!,
          dropoffVan: dropoffVanByDog[key]!
        }));
  for (const row of continuityBreaks) {
    issues.push({
      code: "van_continuity",
      severity: "error",
      message: `${row.dogName} pickup ${row.pickupVan.replace("van_", "Van ")} does not match drop-off ${row.dropoffVan.replace("van_", "Van ")}. Create an explicit transfer to change vans.`,
      dogName: row.dogName
    });
  }
  checks.push({
    id: "van_continuity",
    pass: continuityBreaks.length === 0,
    detail:
      continuityBreaks.length === 0
        ? "Pickup and drop-off vans match."
        : `${continuityBreaks.length} dog(s) switched vans without an explicit transfer.`
  });

  const errorIssues = issues.filter((i) => i.severity === "error");
  return {
    ok: errorIssues.length === 0,
    ready: errorIssues.length === 0,
    issues,
    checks,
    addressIssueCount,
    missingLegCount: missing.length,
    missingDogs,
    duplicateDogs
  };
}
