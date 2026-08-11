/**
 * Pre-approval / pre-export validation gate.
 * Routes must not silently approve when locations or dogs are wrong.
 */
import type { ReconciliationReport } from "@/lib/route-generator/reconciliation";
import { formatMissingLeg } from "@/lib/route-generator/reconciliation";
import { hasFiniteCoords } from "@/lib/route-generator/household-coords";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";

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
};

export function validateRoutePlan(params: {
  reconciliation: ReconciliationReport;
  stops: ValidatableStop[];
  requireCoordinates?: boolean;
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
    const isFacility = isFacilityHouseholdKey(stop.householdKey) || stop.locationType === "FITDOG" || stop.locationType === "HUB" || stop.locationType === "OUTING";
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
    if (/^[A-Za-z][A-Za-z\s'+.-]{1,40}$/.test(address) && !/\d/.test(address) && !isFacility) {
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
    if (stop.locationType === "HOME" && /1712\s+21st|2140\s+Westwood|fitdog club|westwood hub/i.test(address)) {
      addressIssueCount += 1;
      issues.push({
        code: "home_points_at_fitdog",
        severity: "error",
        message: `Stop "${stop.ownerName || stop.id}" is marked HOME but address is a Fitdog facility.`,
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
    id: "no_duplicate_silent_drops",
    pass: params.reconciliation.unassignedCount === params.reconciliation.unassigned.length,
    detail: "Unassigned legs are explicitly listed."
  });

  const errorIssues = issues.filter((i) => i.severity === "error");
  return {
    ok: errorIssues.length === 0,
    ready: errorIssues.length === 0,
    issues,
    checks,
    addressIssueCount,
    missingLegCount: missing.length
  };
}
