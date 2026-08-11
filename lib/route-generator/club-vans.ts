/**
 * Club vans (Van 5 / Van 6) carry Group Class + Taxi Service.
 * Operational rule: only ONE club van per operating day — primarily Van 5.
 * Van 6 is the spare when Van 5 is inactive/unavailable.
 */

import type { FitdogVanKey } from "@/lib/route-generator/flags";
import type { VehicleCapacityConfig } from "@/lib/route-generator/capacity";

export const PRIMARY_CLUB_VAN: FitdogVanKey = "van_5";
export const SECONDARY_CLUB_VAN: FitdogVanKey = "van_6";
export const CLUB_VAN_KEYS: readonly FitdogVanKey[] = [PRIMARY_CLUB_VAN, SECONDARY_CLUB_VAN];

export function isClubVanKey(vanKey: string): vanKey is FitdogVanKey {
  return vanKey === "van_5" || vanKey === "van_6";
}

export type ClubVanFleetResolution = {
  /** Vehicles after excluding the non-selected club van. */
  vehicles: VehicleCapacityConfig[];
  /** Club van used for this day (null if none active). */
  primaryClubVan: FitdogVanKey | null;
  /** Club vans present but excluded for mutual exclusivity. */
  excludedClubVans: FitdogVanKey[];
  warnings: string[];
};

/**
 * Keep at most one club van in the active fleet.
 * Prefer Van 5; fall back to Van 6 only when Van 5 is inactive/missing.
 */
export function resolveClubVanFleet(vehicles: VehicleCapacityConfig[]): ClubVanFleetResolution {
  const warnings: string[] = [];
  const active = vehicles.filter((v) => v.active);
  const activeClub = active.filter((v) => isClubVanKey(v.vanKey));

  if (activeClub.length === 0) {
    return {
      vehicles,
      primaryClubVan: null,
      excludedClubVans: [],
      warnings
    };
  }

  const van5 = activeClub.find((v) => v.vanKey === PRIMARY_CLUB_VAN);
  const van6 = activeClub.find((v) => v.vanKey === SECONDARY_CLUB_VAN);
  const primaryClubVan: FitdogVanKey = van5 ? PRIMARY_CLUB_VAN : SECONDARY_CLUB_VAN;
  const excludedClubVans: FitdogVanKey[] = [];

  if (van5 && van6) {
    excludedClubVans.push(SECONDARY_CLUB_VAN);
    warnings.push(
      "Club vans Van 5 and Van 6 are mutually exclusive for Group Class / Taxi — using Van 5 only (primary). Van 6 left unused for this day."
    );
  } else if (!van5 && van6) {
    warnings.push(
      "Club Van 5 is inactive — using Van 6 for Group Class / Taxi today."
    );
  }

  const excluded = new Set(excludedClubVans);
  const filtered = vehicles.filter((v) => !excluded.has(v.vanKey as FitdogVanKey));

  return {
    vehicles: filtered,
    primaryClubVan,
    excludedClubVans,
    warnings
  };
}

/**
 * Remap locks that point at an excluded club van onto the day's primary club van.
 */
export function remapClubVanLocks(params: {
  lockedVanByHousehold?: Record<string, FitdogVanKey>;
  primaryClubVan: FitdogVanKey | null;
  excludedClubVans: FitdogVanKey[];
}): { locks: Record<string, FitdogVanKey>; warnings: string[] } {
  const warnings: string[] = [];
  const locks: Record<string, FitdogVanKey> = {
    ...(params.lockedVanByHousehold || {})
  };
  if (!params.primaryClubVan || !params.excludedClubVans.length) {
    return { locks, warnings };
  }
  const excluded = new Set(params.excludedClubVans);
  for (const [householdKey, vanKey] of Object.entries(locks)) {
    if (excluded.has(vanKey)) {
      locks[householdKey] = params.primaryClubVan;
      warnings.push(
        `${householdKey}: remapped lock from ${vanKey.replace("van_", "Van ")} → ${params.primaryClubVan.replace("van_", "Van ")} (club vans are either/or; Van 5 primary).`
      );
    }
  }
  return { locks, warnings };
}
