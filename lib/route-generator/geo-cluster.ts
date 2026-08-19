/**
 * Stage 1 geographic clustering for Fitdog route generation.
 *
 * Nearby dogs are grouped into territories first. Vans then own those
 * territories. Stop order is a later stage (see optimizer.ts).
 *
 * Uses haversine as the default clustering metric. Road travel-time can be
 * layered on when a cached matrix exists — we do not call Distance Matrix
 * per pair.
 */
import type { FitdogVanKey } from "@/lib/route-generator/flags";
import type { CanonicalService } from "@/lib/route-generator/flags";
import { isServiceEligibleForVan, type VehicleCapacityConfig } from "@/lib/route-generator/capacity";
import type { HouseholdStopGroup } from "@/lib/route-generator/households";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";

/** Households within this radius form one geographic cluster. */
export const GEO_CLUSTER_RADIUS_MILES = 2.4;
/** Extra cost for dumping a distant cluster onto a van that already owns another area. */
export const NEW_AREA_ON_BUSY_VAN_PENALTY = 12;
/** Heavy cost for a second van entering a cluster another van already owns. */
export const SECOND_VAN_IN_OWNED_CLUSTER_PENALTY = 80;
export const CROSS_TOWN_MILES = 6;

export type GeoCoord = { lat: number; lng: number };

export function haversineMiles(a: GeoCoord, b: GeoCoord): number {
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

export type GeoCluster = {
  id: string;
  householdKeys: string[];
  centroid: GeoCoord;
  dogCount: number;
};

export type VanAssignmentReason = {
  householdKey: string;
  vanKey: FitdogVanKey;
  reasons: string[];
};

export type GeographicLockResult = {
  lockedVanByHousehold: Record<string, FitdogVanKey>;
  clusters: GeoCluster[];
  diagnostics: VanAssignmentReason[];
  warnings: string[];
};

function parentOf(parent: Map<string, string>, key: string): string {
  let current = key;
  while (parent.get(current) !== current) {
    const next = parent.get(current);
    if (!next) break;
    parent.set(current, parent.get(next) ?? next);
    current = next;
  }
  return current;
}

function union(parent: Map<string, string>, a: string, b: string) {
  const pa = parentOf(parent, a);
  const pb = parentOf(parent, b);
  if (pa === pb) return;
  if (pa < pb) parent.set(pb, pa);
  else parent.set(pa, pb);
}

function centroidOf(coords: GeoCoord[]): GeoCoord {
  const lat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
  const lng = coords.reduce((sum, c) => sum + c.lng, 0) / coords.length;
  return { lat, lng };
}

export function clusterHouseholdsByProximity(params: {
  households: HouseholdStopGroup[];
  coordsByHousehold: Record<string, GeoCoord>;
  radiusMiles?: number;
}): GeoCluster[] {
  const radius = params.radiusMiles ?? GEO_CLUSTER_RADIUS_MILES;
  const points = params.households
    .filter((h) => !isFacilityHouseholdKey(h.householdKey))
    .map((h) => ({
      key: h.householdKey,
      coord: params.coordsByHousehold[h.householdKey] ?? null,
      dogCount: h.dogCount
    }))
    .filter((p): p is { key: string; coord: GeoCoord; dogCount: number } => Boolean(p.coord))
    .sort(
      (a, b) =>
        a.coord.lng - b.coord.lng || a.coord.lat - b.coord.lat || a.key.localeCompare(b.key)
    );

  const parent = new Map<string, string>();
  for (const point of points) parent.set(point.key, point.key);

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i]!;
      const b = points[j]!;
      if (Math.abs(a.coord.lng - b.coord.lng) * 55 > radius * 2) continue;
      if (haversineMiles(a.coord, b.coord) <= radius) {
        union(parent, a.key, b.key);
      }
    }
  }

  const groups = new Map<string, typeof points>();
  for (const point of points) {
    const root = parentOf(parent, point.key);
    const list = groups.get(root) ?? [];
    list.push(point);
    groups.set(root, list);
  }

  return [...groups.entries()]
    .map(([id, members]) => ({
      id,
      householdKeys: members.map((m) => m.key).sort((a, b) => a.localeCompare(b)),
      centroid: centroidOf(members.map((m) => m.coord)),
      dogCount: members.reduce((n, m) => n + m.dogCount, 0)
    }))
    .sort(
      (a, b) =>
        b.dogCount - a.dogCount ||
        a.centroid.lng - b.centroid.lng ||
        a.centroid.lat - b.centroid.lat ||
        a.id.localeCompare(b.id)
    );
}

function primaryService(households: HouseholdStopGroup[]): CanonicalService | null {
  return households.find((h) => h.items.find((i) => i.serviceCanonical))?.items.find((i) => i.serviceCanonical)
    ?.serviceCanonical ?? null;
}

function clusterFits(vehicle: VehicleCapacityConfig, dogs: number): boolean {
  if (vehicle.maxDogs == null) return true;
  return dogs <= vehicle.maxDogs;
}

/**
 * Assign geographic clusters to vans. Existing locks always win.
 * A second van only enters an owned cluster when capacity requires a split.
 */
export function assignGeographicVanLocks(params: {
  households: HouseholdStopGroup[];
  vehicles: VehicleCapacityConfig[];
  coordsByHousehold: Record<string, GeoCoord>;
  existingLocks?: Record<string, FitdogVanKey>;
}): GeographicLockResult {
  const existing = { ...(params.existingLocks || {}) };
  const warnings: string[] = [];
  const diagnostics: VanAssignmentReason[] = [];
  const lockedVanByHousehold: Record<string, FitdogVanKey> = { ...existing };

  const vehicles = params.vehicles
    .filter((v) => v.active)
    .sort((a, b) => a.vanKey.localeCompare(b.vanKey));

  const unlocked = params.households.filter((h) => !existing[h.householdKey]);
  const byPool = new Map<"outing" | "club", HouseholdStopGroup[]>();
  for (const group of unlocked) {
    const service = group.items.find((i) => i.serviceCanonical)?.serviceCanonical ?? null;
    const eligible = vehicles.filter((v) => !service || isServiceEligibleForVan(service, v));
    const pool: "outing" | "club" = eligible.some((v) => v.vehiclePool === "club") &&
      eligible.every((v) => v.vehiclePool === "club")
      ? "club"
      : "outing";
    const list = byPool.get(pool) ?? [];
    list.push(group);
    byPool.set(pool, list);
  }

  const allClusters: GeoCluster[] = [];

  for (const [pool, groups] of byPool) {
    const poolVehicles = vehicles.filter((v) => v.vehiclePool === pool);
    if (!poolVehicles.length) continue;
    const clusters = clusterHouseholdsByProximity({
      households: groups,
      coordsByHousehold: params.coordsByHousehold
    });
    allClusters.push(...clusters);

    const owned: Array<{ vanKey: FitdogVanKey; centroid: GeoCoord; dogCount: number; clusterIds: string[] }> =
      poolVehicles.map((v) => ({
        vanKey: v.vanKey as FitdogVanKey,
        centroid: { lat: 0, lng: 0 },
        dogCount: 0,
        clusterIds: []
      }));
    const ownedByVan = new Map(owned.map((row) => [row.vanKey, row]));

    for (const cluster of clusters) {
      const clusterGroups = groups.filter((g) => cluster.householdKeys.includes(g.householdKey));
      const service = primaryService(clusterGroups);
      const remaining = [...cluster.householdKeys];

      while (remaining.length) {
        const remainingDogs = clusterGroups
          .filter((g) => remaining.includes(g.householdKey))
          .reduce((n, g) => n + g.dogCount, 0);

        const scored = poolVehicles
          .filter((v) => !service || isServiceEligibleForVan(service, v))
          .map((vehicle) => {
            const vanKey = vehicle.vanKey as FitdogVanKey;
            const state = ownedByVan.get(vanKey)!;
            const capacityOk = clusterFits(vehicle, state.dogCount + remainingDogs) || clusterFits(vehicle, remainingDogs);
            let score = 0;
            const reasons: string[] = [];
            if (!capacityOk) {
              score = Number.POSITIVE_INFINITY;
              reasons.push("over capacity");
            } else {
              const ownersNearby = [...ownedByVan.values()].filter((row) => {
                if (!row.clusterIds.length) return false;
                return haversineMiles(row.centroid, cluster.centroid) <= GEO_CLUSTER_RADIUS_MILES;
              });
              if (state.clusterIds.length === 0) {
                score = 5;
                reasons.push("empty van — new territory");
                if (ownersNearby.length && !ownersNearby.some((row) => row.vanKey === vanKey)) {
                  score += SECOND_VAN_IN_OWNED_CLUSTER_PENALTY;
                  reasons.push("penalty: another van already owns this area");
                }
              } else {
                const dist = haversineMiles(state.centroid, cluster.centroid);
                score = dist;
                reasons.push(`${dist.toFixed(1)} mi from existing territory`);
                if (dist <= GEO_CLUSTER_RADIUS_MILES) {
                  reasons.push("same cluster as existing stops");
                } else {
                  score += NEW_AREA_ON_BUSY_VAN_PENALTY;
                  reasons.push("penalty: new area on a busy van");
                }
                if (ownersNearby.length && !ownersNearby.some((row) => row.vanKey === vanKey)) {
                  score += SECOND_VAN_IN_OWNED_CLUSTER_PENALTY;
                  reasons.push("penalty: cluster overlap with another van");
                }
              }
            }
            return { vehicle, vanKey, score, reasons, capacityOk };
          })
          .sort(
            (a, b) =>
              a.score - b.score || a.vanKey.localeCompare(b.vanKey)
          );

        const winner = scored.find((row) => Number.isFinite(row.score));
        if (!winner) {
          warnings.push(
            `Geographic cluster ${cluster.id} could not be assigned — coordinator must place remaining stops.`
          );
          break;
        }

        const vehicle = winner.vehicle;
        const room = vehicle.maxDogs == null ? remaining.length : Math.max(0, (vehicle.maxDogs ?? 0) - (ownedByVan.get(winner.vanKey)?.dogCount ?? 0));
        const takeKeys: string[] = [];
        let takeDogs = 0;
        for (const key of remaining) {
          const group = clusterGroups.find((g) => g.householdKey === key);
          const add = group?.dogCount ?? 1;
          if (room > 0 && takeDogs + add > room && takeKeys.length) break;
          takeKeys.push(key);
          takeDogs += add;
        }
        if (!takeKeys.length) {
          warnings.push(`Van ${winner.vanKey.replace("van_", "")} could not accept cluster ${cluster.id}.`);
          break;
        }

        const state = ownedByVan.get(winner.vanKey)!;
        for (const key of takeKeys) {
          lockedVanByHousehold[key] = winner.vanKey;
          diagnostics.push({
            householdKey: key,
            vanKey: winner.vanKey,
            reasons: [
              `same cluster as ${cluster.dogCount} stop(s)`,
              ...winner.reasons,
              "within capacity",
              "preserves geographic territory"
            ]
          });
        }
        const nextDogs = state.dogCount + takeDogs;
        const nextCentroid =
          state.clusterIds.length === 0
            ? cluster.centroid
            : {
                lat: (state.centroid.lat * state.dogCount + cluster.centroid.lat * takeDogs) / nextDogs,
                lng: (state.centroid.lng * state.dogCount + cluster.centroid.lng * takeDogs) / nextDogs
              };
        state.dogCount = nextDogs;
        state.centroid = nextCentroid;
        state.clusterIds.push(cluster.id);
        for (const key of takeKeys) {
          const idx = remaining.indexOf(key);
          if (idx >= 0) remaining.splice(idx, 1);
        }
        if (remaining.length) {
          warnings.push(
            `Cluster ${cluster.id} split across vans because of capacity — ${remaining.length} household(s) remain.`
          );
        }
      }
    }
  }

  return { lockedVanByHousehold, clusters: allClusters, diagnostics, warnings };
}

export function clusterOverlapWarnings(params: {
  routes: Array<{ vanKey: string; stops: Array<{ householdKey?: string | null; latitude?: number | null; longitude?: number | null }> }>;
  radiusMiles?: number;
}): string[] {
  const radius = params.radiusMiles ?? GEO_CLUSTER_RADIUS_MILES;
  const vanCentroids = params.routes
    .map((route) => {
      const coords = route.stops
        .map((stop) =>
          stop.latitude != null && stop.longitude != null
            ? { lat: Number(stop.latitude), lng: Number(stop.longitude) }
            : null
        )
        .filter((c): c is GeoCoord => Boolean(c));
      if (!coords.length) return null;
      return { vanKey: route.vanKey, centroid: centroidOf(coords) };
    })
    .filter(Boolean) as Array<{ vanKey: string; centroid: GeoCoord }>;

  const warnings: string[] = [];
  for (let i = 0; i < vanCentroids.length; i += 1) {
    for (let j = i + 1; j < vanCentroids.length; j += 1) {
      const a = vanCentroids[i]!;
      const b = vanCentroids[j]!;
      const dist = haversineMiles(a.centroid, b.centroid);
      if (dist <= radius) {
        warnings.push(
          `${a.vanKey.replace("van_", "Van ")} and ${b.vanKey.replace("van_", "Van ")} overlap heavily (${dist.toFixed(1)} mi between route centers).`
        );
      }
    }
  }
  return warnings;
}
