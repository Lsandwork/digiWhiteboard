import {
  assertNeverVan4,
  type CanonicalService,
  type FitdogVanKey,
  FITDOG_VAN_KEYS
} from "@/lib/route-generator/flags";
import {
  capacityAllows,
  isLargeDog,
  isServiceEligibleForVan,
  resolveLoadUnits,
  type SizeLoadConfig,
  type VehicleCapacityConfig
} from "@/lib/route-generator/capacity";
import type { HouseholdStopGroup } from "@/lib/route-generator/households";
import { formatStopDisplayName } from "@/lib/route-generator/households";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";
import {
  DEFAULT_FITDOG_LOCATIONS,
  homeBaseForVehiclePool,
  resolveBaseLocation,
  resolveRouteEndpoints,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { buildCustomerStopNotes, formatPhoneForDriver } from "@/lib/route-generator/stop-notes";
import {
  estimateCustomerStopEtas,
  groupTimelinessSortKey,
  orderStopsForTimeliness,
  sharedDogAffinityBonus,
  sharedDogTimingClashPenalty,
  windowCompatibilityPenalty
} from "@/lib/route-generator/timing";

export type DepotConfig = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  verified: boolean;
};

export type OptimizedStop = {
  sequence: number;
  stopKind: "depot_start" | "customer" | "depot_end";
  householdKey: string | null;
  ownerName: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  dogCount: number;
  loadUnits: number;
  largeDogs: number;
  serviceTypes: CanonicalService[];
  dogNames: string[];
  reservationIds: string[];
  locked: boolean;
  notes: string;
  /** Full owner phone for drivers (Samsara notes + tracking SMS). */
  ownerPhoneDisplay?: string | null;
  requestedWindowStart?: string | null;
  requestedWindowEnd?: string | null;
  etaArrival?: string | null;
  etaDeparture?: string | null;
  dogIds?: string[];
};

export type OptimizedRoute = {
  vanKey: FitdogVanKey;
  vehiclePool: "club" | "outing";
  direction: "pickup" | "dropoff";
  waveName: string;
  stops: OptimizedStop[];
  totalDogs: number;
  loadUnitsUsed: number;
  largeDogs: number;
  serviceTypes: CanonicalService[];
  warnings: string[];
  estimatedDistanceMiles: number;
  estimatedDriveMinutes: number;
};

export type OptimizationResult = {
  label: "optimized" | "feasible_not_fully_optimized" | "infeasible" | "needs_management_review";
  seed: string;
  routes: OptimizedRoute[];
  unassigned: HouseholdStopGroup[];
  warnings: string[];
};

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

type StopCoord = { lat: number; lng: number };

function nearestNeighborOrder(
  stops: Array<HouseholdStopGroup & { coord: StopCoord | null; load: number; large: number }>,
  depot: StopCoord | null,
  rng: () => number
) {
  const remaining = [...stops];
  const ordered: typeof stops = [];
  let current = depot;
  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const stop = remaining[i]!;
      const dist =
        current && stop.coord ? haversineMiles(current, stop.coord) : 50 + rng() * 5;
      if (dist < bestScore) {
        bestScore = dist;
        bestIndex = i;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0]!;
    ordered.push(next);
    current = next.coord ?? current;
  }
  return ordered;
}

export function optimizeRoutes(params: {
  direction: "pickup" | "dropoff";
  households: HouseholdStopGroup[];
  vehicles: VehicleCapacityConfig[];
  depot: DepotConfig;
  /** Dual bases: HUB + CLUB. Falls back to `depot` when a base is missing coords. */
  locations?: FitdogLocationsConfig;
  sizeLoads: SizeLoadConfig;
  seed?: string;
  coordsByHousehold?: Record<string, { lat: number; lng: number }>;
  lockedVanByHousehold?: Record<string, FitdogVanKey>;
  /** YYYY-MM-DD — drives Van 3 Huntington vs Kenneth Hahn schedule. */
  operatingDate?: string | null;
}): OptimizationResult {
  const seed = params.seed || `${params.direction}:${params.households.length}:${Date.now()}`;
  const rng = mulberry32(hashSeed(seed));
  const warnings: string[] = [];
  const unassigned: HouseholdStopGroup[] = [];
  const locations: FitdogLocationsConfig = params.locations ?? {
    ...DEFAULT_FITDOG_LOCATIONS,
    club: {
      ...DEFAULT_FITDOG_LOCATIONS.club,
      // Legacy single-depot configs map onto CLUB when locations were never seeded.
      address: params.depot.address || DEFAULT_FITDOG_LOCATIONS.club.address,
      latitude: params.depot.latitude ?? DEFAULT_FITDOG_LOCATIONS.club.latitude,
      longitude: params.depot.longitude ?? DEFAULT_FITDOG_LOCATIONS.club.longitude,
      verified: params.depot.verified
    }
  };

  const vehicles = params.vehicles
    .filter((v) => v.active)
    .map((v) => {
      assertNeverVan4(v.vanKey);
      return {
        ...v,
        homeBaseKey: v.homeBaseKey || homeBaseForVehiclePool(v.vehiclePool)
      };
    });

  if (!vehicles.length) {
    return {
      label: "infeasible",
      seed,
      routes: [],
      unassigned: params.households,
      warnings: ["No active vans available."]
    };
  }

  type Bucket = {
    vehicle: VehicleCapacityConfig;
    stops: Array<HouseholdStopGroup & { coord: StopCoord | null; load: number; large: number }>;
    dogs: number;
    load: number;
    large: number;
  };

  const buckets = new Map<string, Bucket>();
  for (const vehicle of vehicles) {
    if (!FITDOG_VAN_KEYS.includes(vehicle.vanKey as FitdogVanKey)) continue;
    buckets.set(vehicle.vanKey, { vehicle, stops: [], dogs: 0, load: 0, large: 0 });
  }

  const enriched = params.households.map((h) => {
    let load = 0;
    let large = 0;
    for (const item of h.items) {
      const size = (item.dogSize as "Small" | "Medium" | "Large" | "Extra Large" | "Unknown" | null) ?? "Unknown";
      const resolved = resolveLoadUnits(size, params.sizeLoads);
      load += resolved.units;
      if (isLargeDog(size)) large += 1;
      if (resolved.warning) warnings.push(`${item.dogName || "Dog"}: ${resolved.warning}`);
    }
    return {
      ...h,
      coord: params.coordsByHousehold?.[h.householdKey] ?? null,
      load,
      large
    };
  });

  type EnrichedStop = (typeof enriched)[number];

  function placeOnBucket(bucket: Bucket, stop: EnrichedStop) {
    bucket.stops.push(stop);
    bucket.dogs += stop.dogCount;
    bucket.load += stop.load;
    bucket.large += stop.large;
  }

  function eligibleBuckets(service: CanonicalService | null | undefined): Bucket[] {
    return [...buckets.values()].filter((bucket) => {
      if (!service) return true;
      return isServiceEligibleForVan(service, bucket.vehicle);
    });
  }

  function rankCandidates(
    stop: EnrichedStop,
    service: CanonicalService | null | undefined,
    options?: { ignoreCapacity?: boolean; excludeVanKeys?: Set<string> }
  ) {
    return eligibleBuckets(service)
      .filter((bucket) => !options?.excludeVanKeys?.has(bucket.vehicle.vanKey))
      .map((bucket) => {
        const check = capacityAllows({
          vehicle: bucket.vehicle,
          currentDogs: bucket.dogs,
          currentLoad: bucket.load,
          currentLarge: bucket.large,
          currentStops: bucket.stops.length,
          addDogs: stop.dogCount,
          addLoad: stop.load,
          addLarge: stop.large,
          addStops: 1
        });
        const home = resolveBaseLocation(locations, bucket.vehicle.homeBaseKey);
        const depotCoord =
          home.latitude != null && home.longitude != null
            ? { lat: home.latitude, lng: home.longitude }
            : params.depot.latitude != null && params.depot.longitude != null
              ? { lat: params.depot.latitude, lng: params.depot.longitude }
              : null;
        const last = bucket.stops[bucket.stops.length - 1];
        const from = last?.coord ?? depotCoord;
        const dist = from && stop.coord ? haversineMiles(from, stop.coord) : 25;
        const timingPenalty = windowCompatibilityPenalty(bucket.stops, stop, params.direction);
        const clash = sharedDogTimingClashPenalty(bucket.stops, stop);
        const affinity = sharedDogAffinityBonus(bucket.stops, stop);
        // Lower is better: proximity + window mismatch + shared-dog clash − sequential affinity.
        const score = dist + timingPenalty + clash - affinity;
        return { bucket, check, dist, score, clash };
      })
      .filter((c) => c.clash < 500 && (options?.ignoreCapacity || c.check.ok))
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.dist - b.dist ||
          a.bucket.dogs - b.bucket.dogs ||
          a.bucket.vehicle.vanKey.localeCompare(b.bucket.vehicle.vanKey)
      );
  }

  const placedKeys = new Set<string>();

  // Assign locked households first. If the pinned van is missing/full, fall back to
  // other eligible vans so manual taxi / skipped-class pins are not dead-ends.
  for (const stop of enriched) {
    const lockedVan = params.lockedVanByHousehold?.[stop.householdKey];
    if (!lockedVan) continue;
    assertNeverVan4(lockedVan);
    const service = stop.items.find((i) => i.serviceCanonical)?.serviceCanonical ?? null;
    const bucket = buckets.get(lockedVan);
    if (bucket) {
      if (service && !isServiceEligibleForVan(service, bucket.vehicle)) {
        // Manual / skipped-class / taxi assignments may intentionally pin a service onto a van.
        warnings.push(
          `${stop.address}: locked onto ${lockedVan.replace("van_", "Van ")} even though default eligibility excludes ${service}.`
        );
      }
      const check = capacityAllows({
        vehicle: bucket.vehicle,
        currentDogs: bucket.dogs,
        currentLoad: bucket.load,
        currentLarge: bucket.large,
        currentStops: bucket.stops.length,
        addDogs: stop.dogCount,
        addLoad: stop.load,
        addLarge: stop.large,
        addStops: 1
      });
      if (check.ok) {
        placeOnBucket(bucket, stop);
        placedKeys.add(stop.householdKey);
        continue;
      }
      warnings.push(...check.reasons.map((r) => `${stop.address}: locked ${lockedVan.replace("van_", "Van ")} — ${r}`));
    } else {
      warnings.push(
        `${stop.address}: locked van ${lockedVan.replace("van_", "Van ")} is inactive or missing — trying other eligible vans.`
      );
    }

    const fallback = rankCandidates(stop, service, { excludeVanKeys: new Set([lockedVan]) })[0];
    if (fallback) {
      placeOnBucket(fallback.bucket, stop);
      placedKeys.add(stop.householdKey);
      warnings.push(
        `${stop.address}: moved from locked ${lockedVan.replace("van_", "Van ")} to ${fallback.bucket.vehicle.vanKey.replace("van_", "Van ")} (capacity/availability).`
      );
      continue;
    }

    // Last resort for locked pins: soft-overflow onto the locked van when it exists.
    if (bucket && sharedDogTimingClashPenalty(bucket.stops, stop) < 500) {
      placeOnBucket(bucket, stop);
      placedKeys.add(stop.householdKey);
      warnings.push(
        `${stop.address}: OVERFLOW onto locked ${lockedVan.replace("van_", "Van ")} over capacity — coordinator must rebalance.`
      );
      continue;
    }

    unassigned.push(stop);
  }

  const unlocked = enriched.filter((s) => !placedKeys.has(s.householdKey));
  // Assign earliest deadlines first so late-window proximity packing cannot starve early classes.
  unlocked.sort((a, b) => {
    const aKey = groupTimelinessSortKey(a, params.direction);
    const bKey = groupTimelinessSortKey(b, params.direction);
    if (aKey !== bKey) return aKey - bKey;
    return b.load - a.load || a.address.localeCompare(b.address);
  });

  const deferredOverflow: EnrichedStop[] = [];

  for (const stop of unlocked) {
    const service = stop.items.find((i) => i.serviceCanonical)?.serviceCanonical ?? null;
    const candidates = rankCandidates(stop, service);
    if (candidates[0]) {
      placeOnBucket(candidates[0].bucket, stop);
      placedKeys.add(stop.householdKey);
      continue;
    }

    const clashBlocked = eligibleBuckets(service).some(
      (bucket) => sharedDogTimingClashPenalty(bucket.stops, stop) >= 500
    );
    if (clashBlocked) {
      unassigned.push(stop);
      warnings.push(
        `${stop.address}: shared dog has overlapping class windows with another stop — left unassigned for review.`
      );
      continue;
    }

    // Capacity/eligibility starvation — keep for soft overflow so valid legs still
    // land on a van route the coordinator can edit (never only a blocked list).
    deferredOverflow.push(stop);
  }

  for (const stop of deferredOverflow) {
    const service = stop.items.find((i) => i.serviceCanonical)?.serviceCanonical ?? null;
    const overflow = rankCandidates(stop, service, { ignoreCapacity: true })[0];
    if (overflow) {
      placeOnBucket(overflow.bucket, stop);
      placedKeys.add(stop.householdKey);
      warnings.push(
        `${stop.address}: OVERFLOW onto ${overflow.bucket.vehicle.vanKey.replace("van_", "Van ")} over capacity for ${service || "service"} — coordinator must rebalance or split vans.`
      );
      continue;
    }

    unassigned.push(stop);
    if (service) {
      const anyEligible = eligibleBuckets(service).length > 0;
      warnings.push(
        anyEligible
          ? `${stop.address}: no eligible van could take ${service} (timing clash on every candidate).`
          : `${stop.address}: no active van is eligible for ${service}.`
      );
    } else {
      warnings.push(`${stop.address}: could not assign household.`);
    }
  }

  const routes: OptimizedRoute[] = [];
  for (const vanKey of FITDOG_VAN_KEYS) {
    const bucket = buckets.get(vanKey);
    if (!bucket || !bucket.stops.length) continue;

    const serviceTypes = [
      ...new Set(
        bucket.stops.flatMap((s) =>
          s.items.map((i) => i.serviceCanonical).filter(Boolean)
        ) as CanonicalService[]
      )
    ];
    const { startKey, endKey } = resolveRouteEndpoints({
      vanKey,
      direction: params.direction,
      serviceTypes,
      operatingDate: params.operatingDate
    });
    const startBase = resolveBaseLocation(locations, startKey);
    const endBase = resolveBaseLocation(locations, endKey);
    const startCoord =
      startBase.latitude != null && startBase.longitude != null
        ? { lat: startBase.latitude, lng: startBase.longitude }
        : params.depot.latitude != null && params.depot.longitude != null
          ? { lat: params.depot.latitude, lng: params.depot.longitude }
          : null;
    const endCoord =
      endBase.latitude != null && endBase.longitude != null
        ? { lat: endBase.latitude, lng: endBase.longitude }
        : startCoord;

    // Facility stops stay first (pickup) / last (dropoff). Home stops are ordered by
    // class-window deadline + proximity so shared-class timing stays feasible.
    const facilityStops = bucket.stops.filter((s) => isFacilityHouseholdKey(s.householdKey));
    const homeStops = bucket.stops.filter((s) => !isFacilityHouseholdKey(s.householdKey));
    const orderedHome = orderStopsForTimeliness(homeStops, startCoord, params.direction, rng);
    // Keep proximity fallback available for routes with no windows at all.
    const orderedHomeFinal =
      orderedHome.some((stop) => stop.items.some((item) => item.timeWindowStart || item.timeWindowEnd))
        ? orderedHome
        : nearestNeighborOrder(homeStops, startCoord, rng);
    const ordered =
      params.direction === "pickup"
        ? [...facilityStops, ...orderedHomeFinal]
        : [...orderedHomeFinal, ...facilityStops];

    let distance = 0;
    let prev = startCoord;
    for (const stop of ordered) {
      if (prev && stop.coord) distance += haversineMiles(prev, stop.coord);
      prev = stop.coord ?? prev;
    }
    if (prev && endCoord) distance += haversineMiles(prev, endCoord);

    const etaByIndex = estimateCustomerStopEtas({
      ordered,
      direction: params.direction,
      operatingDate: params.operatingDate || new Date().toISOString().slice(0, 10),
      vanKey,
      coordsByHousehold: Object.fromEntries(
        ordered
          .filter((stop) => stop.coord)
          .map((stop) => [stop.householdKey, stop.coord as { lat: number; lng: number }])
      ),
      startCoord
    });

    const stops: OptimizedStop[] = [
      {
        sequence: 0,
        stopKind: "depot_start",
        householdKey: null,
        ownerName: startBase.name,
        address: startBase.address,
        latitude: startBase.latitude,
        longitude: startBase.longitude,
        dogCount: 0,
        loadUnits: 0,
        largeDogs: 0,
        serviceTypes: [],
        dogNames: [],
        reservationIds: [],
        locked: true,
        notes: `Start at ${startBase.name}`
      }
    ];

    ordered.forEach((stop, index) => {
      const services = [
        ...new Set(
          stop.items.map((i) => i.serviceCanonical).filter(Boolean) as CanonicalService[]
        )
      ];
      const isFacility = isFacilityHouseholdKey(stop.householdKey);
      const phones = [
        ...new Set(
          stop.items
            .map((item) =>
              formatPhoneForDriver(
                (item.raw?.phone as string | undefined) ||
                  (item.raw?.owner_phone as string | undefined) ||
                  null
              )
            )
            .filter((value): value is string => Boolean(value))
        )
      ];
      const eta = etaByIndex[index];
      const windowNote =
        eta?.requestedWindowStart || eta?.requestedWindowEnd
          ? `Window ${eta.requestedWindowStart || "?"}–${eta.requestedWindowEnd || "?"}`
          : null;
      stops.push({
        sequence: index + 1,
        stopKind: "customer",
        householdKey: stop.householdKey,
        ownerName: stop.ownerName,
        address: stop.address,
        latitude: stop.coord?.lat ?? null,
        longitude: stop.coord?.lng ?? null,
        dogCount: stop.dogCount,
        loadUnits: stop.load,
        largeDogs: stop.large,
        serviceTypes: services,
        dogNames: stop.items.map((i) => i.dogName || "Dog"),
        dogIds: stop.items.map((i) => i.dogId || "").filter(Boolean),
        reservationIds: stop.items.map((i) => i.reservationId || "").filter(Boolean),
        locked: Boolean(params.lockedVanByHousehold?.[stop.householdKey]),
        ownerPhoneDisplay: phones[0] ?? null,
        requestedWindowStart: eta?.requestedWindowStart ?? null,
        requestedWindowEnd: eta?.requestedWindowEnd ?? null,
        etaArrival: eta?.arrivalIso ?? null,
        etaDeparture: eta?.departureIso ?? null,
        notes: [
          buildCustomerStopNotes({
            items: stop.items,
            direction: params.direction,
            isFacility,
            facilityLabel: isFacility ? stop.address : null
          }),
          windowNote
        ]
          .filter(Boolean)
          .join(" | ")
      });
    });

    stops.push({
      sequence: ordered.length + 1,
      stopKind: "depot_end",
      householdKey: null,
      ownerName: endBase.name,
      address: endBase.address,
      latitude: endBase.latitude,
      longitude: endBase.longitude,
      dogCount: 0,
      loadUnits: 0,
      largeDogs: 0,
      serviceTypes: [],
      dogNames: [],
      reservationIds: [],
      locked: true,
      notes: `End at ${endBase.name}`
    });

    const vanLabel = String(vanKey).replace("van_", "Van ");
    const routeWarnings = warnings.filter((w) => w.includes(vanLabel) || w.includes(String(vanKey)));
    const hasOverflow = routeWarnings.some((w) => /OVERFLOW/i.test(w));
    routes.push({
      vanKey: vanKey as FitdogVanKey,
      vehiclePool: bucket.vehicle.vehiclePool,
      direction: params.direction,
      waveName: hasOverflow
        ? `${params.direction === "pickup" ? "Morning Pickup" : "Afternoon Drop-Off"} (OVERFLOW — rebalance)`
        : params.direction === "pickup"
          ? "Morning Pickup"
          : "Afternoon Drop-Off",
      stops,
      totalDogs: bucket.dogs,
      loadUnitsUsed: bucket.load,
      largeDogs: bucket.large,
      serviceTypes,
      warnings: routeWarnings,
      estimatedDistanceMiles: Math.round(distance * 10) / 10,
      estimatedDriveMinutes: Math.round(distance * 3.2)
    });
  }

  const hasOverflow = warnings.some((w) => /OVERFLOW/i.test(w));
  let label: OptimizationResult["label"] = "optimized";
  if (unassigned.length || hasOverflow) label = "needs_management_review";
  if (!routes.length && params.households.length) label = "infeasible";
  if (routes.length && unassigned.length === 0 && warnings.length && !hasOverflow) {
    label = "feasible_not_fully_optimized";
  }

  return { label, seed, routes, unassigned, warnings };
}

/** Map reservation IDs from pickup routes → van that collected them. */
export function vanByReservationFromPickupRoutes(
  pickupRoutes: OptimizedRoute[]
): Map<string, FitdogVanKey> {
  const map = new Map<string, FitdogVanKey>();
  for (const route of pickupRoutes) {
    for (const stop of route.stops) {
      if (stop.stopKind !== "customer") continue;
      for (const reservationId of stop.reservationIds) {
        const id = String(reservationId || "").trim();
        if (!id) continue;
        map.set(id, route.vanKey);
      }
    }
  }
  return map;
}

/**
 * Drop-off vans must match pickup vans: a dog only rides Van 3 drop-off if Van 3 picked them up.
 * Splits mixed households when dogs were collected by different vans.
 */
export function lockDropoffGroupsToPickupVans(params: {
  pickupRoutes: OptimizedRoute[];
  dropoffGroups: HouseholdStopGroup[];
  existingLocks?: Record<string, FitdogVanKey>;
}): {
  dropoffGroups: HouseholdStopGroup[];
  lockedVanByHousehold: Record<string, FitdogVanKey>;
  warnings: string[];
} {
  const vanByReservation = vanByReservationFromPickupRoutes(params.pickupRoutes);
  const lockedVanByHousehold: Record<string, FitdogVanKey> = { ...(params.existingLocks || {}) };
  const warnings: string[] = [];
  const nextGroups: HouseholdStopGroup[] = [];

  for (const group of params.dropoffGroups) {
    if (lockedVanByHousehold[group.householdKey]) {
      nextGroups.push(group);
      continue;
    }

    const byVan = new Map<FitdogVanKey | "unassigned", typeof group.items>();
    for (const item of group.items) {
      const reservationId = String(item.reservationId || "").trim();
      const van = reservationId ? vanByReservation.get(reservationId) : undefined;
      const key = (van || "unassigned") as FitdogVanKey | "unassigned";
      const list = byVan.get(key) ?? [];
      list.push(item);
      byVan.set(key, list);
    }

    if (byVan.size <= 1) {
      const only = [...byVan.keys()][0];
      if (only && only !== "unassigned") {
        lockedVanByHousehold[group.householdKey] = only;
      } else if (only === "unassigned") {
        warnings.push(
          `${group.address || group.ownerName || "Stop"}: drop-off dog(s) had no matching pickup reservation — left unlocked.`
        );
      }
      nextGroups.push(group);
      continue;
    }

    // Same address, dogs collected by different vans → split so each van only drops its own dogs.
    for (const [van, items] of byVan) {
      if (van === "unassigned") {
        warnings.push(
          `${group.address || group.ownerName || "Stop"}: ${items.length} drop-off dog(s) had no matching pickup reservation.`
        );
        nextGroups.push({
          ...group,
          householdKey: `${group.householdKey}::unassigned`,
          items,
          dogCount: items.length,
          ownerName: formatStopDisplayName(items)
        });
        continue;
      }
      const splitKey = `${group.householdKey}::${van}`;
      lockedVanByHousehold[splitKey] = van;
      nextGroups.push({
        ...group,
        householdKey: splitKey,
        items,
        dogCount: items.length,
        ownerName: formatStopDisplayName(items)
      });
    }
  }

  return { dropoffGroups: nextGroups, lockedVanByHousehold, warnings };
}
