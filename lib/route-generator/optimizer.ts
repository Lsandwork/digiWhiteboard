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
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";
import {
  DEFAULT_FITDOG_LOCATIONS,
  homeBaseForVehiclePool,
  resolveBaseLocation,
  resolveRouteEndpoints,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";

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

  // Assign locked households first
  for (const stop of enriched) {
    const lockedVan = params.lockedVanByHousehold?.[stop.householdKey];
    if (!lockedVan) continue;
    assertNeverVan4(lockedVan);
    const bucket = buckets.get(lockedVan);
    if (!bucket) {
      unassigned.push(stop);
      continue;
    }
    const service = stop.items.find((i) => i.serviceCanonical)?.serviceCanonical;
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
    if (!check.ok) {
      unassigned.push(stop);
      warnings.push(...check.reasons.map((r) => `${stop.address}: ${r}`));
      continue;
    }
    bucket.stops.push(stop);
    bucket.dogs += stop.dogCount;
    bucket.load += stop.load;
    bucket.large += stop.large;
  }

  const unlocked = enriched.filter((s) => !params.lockedVanByHousehold?.[s.householdKey]);
  // Sort by load descending for bin packing, then nearest-neighbor within van
  unlocked.sort((a, b) => b.load - a.load || a.address.localeCompare(b.address));

  for (const stop of unlocked) {
    const service = stop.items.find((i) => i.serviceCanonical)?.serviceCanonical;
    let placed = false;
    const candidates = [...buckets.values()]
      .filter((bucket) => {
        if (!service) return true;
        return isServiceEligibleForVan(service, bucket.vehicle);
      })
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
        return { bucket, check, dist };
      })
      .filter((c) => c.check.ok)
      .sort((a, b) => a.dist - b.dist || a.bucket.dogs - b.bucket.dogs);

    if (candidates[0]) {
      const { bucket } = candidates[0];
      bucket.stops.push(stop);
      bucket.dogs += stop.dogCount;
      bucket.load += stop.load;
      bucket.large += stop.large;
      placed = true;
    }

    if (!placed) {
      unassigned.push(stop);
      if (service) warnings.push(`${stop.address}: no eligible van has capacity for ${service}.`);
      else warnings.push(`${stop.address}: could not assign household.`);
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
      serviceTypes
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

    // Prefer visiting Fitdog Club mid-route when facility dogs are on this van,
    // otherwise keep nearest-neighbor from the start base.
    const facilityStops = bucket.stops.filter((s) => isFacilityHouseholdKey(s.householdKey));
    const homeStops = bucket.stops.filter((s) => !isFacilityHouseholdKey(s.householdKey));
    const orderedHome = nearestNeighborOrder(homeStops, startCoord, rng);
    const ordered =
      params.direction === "pickup"
        ? [...facilityStops, ...orderedHome]
        : [...orderedHome, ...facilityStops];

    let distance = 0;
    let prev = startCoord;
    for (const stop of ordered) {
      if (prev && stop.coord) distance += haversineMiles(prev, stop.coord);
      prev = stop.coord ?? prev;
    }
    if (prev && endCoord) distance += haversineMiles(prev, endCoord);

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
        reservationIds: stop.items.map((i) => i.reservationId || "").filter(Boolean),
        locked: Boolean(params.lockedVanByHousehold?.[stop.householdKey]),
        notes: isFacility
          ? `Fitdog facility stop — ${stop.dogCount} dog(s) already on-site: ${stop.items
              .map((i) => i.dogName)
              .join(", ")}`
          : `${stop.dogCount} dog(s): ${stop.items.map((i) => i.dogName).join(", ")}`
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

    routes.push({
      vanKey: vanKey as FitdogVanKey,
      vehiclePool: bucket.vehicle.vehiclePool,
      direction: params.direction,
      waveName: params.direction === "pickup" ? "Morning Pickup" : "Afternoon Drop-Off",
      stops,
      totalDogs: bucket.dogs,
      loadUnitsUsed: bucket.load,
      largeDogs: bucket.large,
      serviceTypes,
      warnings: [],
      estimatedDistanceMiles: Math.round(distance * 10) / 10,
      estimatedDriveMinutes: Math.round(distance * 3.2)
    });
  }

  let label: OptimizationResult["label"] = "optimized";
  if (unassigned.length) label = "needs_management_review";
  if (!routes.length && params.households.length) label = "infeasible";
  if (routes.length && unassigned.length === 0 && warnings.length) label = "feasible_not_fully_optimized";

  return { label, seed, routes, unassigned, warnings };
}
