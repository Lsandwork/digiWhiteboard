import type { CanonicalService } from "@/lib/route-generator/flags";
import { CLUB_SERVICES, OUTING_SERVICES, assertNeverVan4 } from "@/lib/route-generator/flags";

export type DogSize = "Small" | "Medium" | "Large" | "Extra Large" | "Unknown";

export type VehicleCapacityConfig = {
  vanKey: string;
  active: boolean;
  vehiclePool: "club" | "outing";
  maxDogs: number | null;
  maxLoadUnits: number | null;
  maxLargeDogs: number | null;
  maxStops: number | null;
  eligibleServices: CanonicalService[];
  capacityConfigured: boolean;
};

export type SizeLoadConfig = Partial<Record<DogSize, number | null>> & { configured?: boolean };

export function resolveLoadUnits(size: DogSize | null | undefined, loads: SizeLoadConfig): {
  units: number;
  unknown: boolean;
  warning?: string;
} {
  const key: DogSize = size && ["Small", "Medium", "Large", "Extra Large", "Unknown"].includes(size) ? size : "Unknown";
  const configured = loads[key];
  if (configured == null || !Number.isFinite(configured)) {
    const fallback = loads.Unknown;
    if (fallback == null || !Number.isFinite(fallback)) {
      return {
        units: 1,
        unknown: key === "Unknown" || size == null,
        warning: "Size load units are not configured — using conservative placeholder 1."
      };
    }
    return {
      units: Number(fallback),
      unknown: true,
      warning: key === "Unknown" || size == null ? "Size Unknown — applying conservative unknown-size load." : undefined
    };
  }
  return { units: Number(configured), unknown: key === "Unknown" };
}

export function isServiceEligibleForVan(service: CanonicalService, vehicle: VehicleCapacityConfig): boolean {
  assertNeverVan4(vehicle.vanKey);
  if (!vehicle.active) return false;
  if (vehicle.eligibleServices.length) return vehicle.eligibleServices.includes(service);
  return vehicle.vehiclePool === "club" ? CLUB_SERVICES.includes(service) : OUTING_SERVICES.includes(service);
}

export function capacityAllows(params: {
  vehicle: VehicleCapacityConfig;
  currentDogs: number;
  currentLoad: number;
  currentLarge: number;
  currentStops: number;
  addDogs: number;
  addLoad: number;
  addLarge: number;
  addStops?: number;
}): { ok: boolean; reasons: string[] } {
  assertNeverVan4(params.vehicle.vanKey);
  const reasons: string[] = [];
  if (!params.vehicle.capacityConfigured) {
    reasons.push("Van capacity is not configured.");
  }
  if (params.vehicle.maxDogs != null && params.currentDogs + params.addDogs > params.vehicle.maxDogs) {
    reasons.push("Maximum dog count exceeded.");
  }
  if (params.vehicle.maxLoadUnits != null && params.currentLoad + params.addLoad > params.vehicle.maxLoadUnits) {
    reasons.push("Maximum load units exceeded.");
  }
  if (params.vehicle.maxLargeDogs != null && params.currentLarge + params.addLarge > params.vehicle.maxLargeDogs) {
    reasons.push("Maximum large-dog count exceeded.");
  }
  const addStops = params.addStops ?? 0;
  if (params.vehicle.maxStops != null && params.currentStops + addStops > params.vehicle.maxStops) {
    reasons.push("Maximum stop count exceeded.");
  }
  return { ok: reasons.length === 0, reasons };
}

export function isLargeDog(size: DogSize | null | undefined): boolean {
  return size === "Large" || size === "Extra Large";
}
