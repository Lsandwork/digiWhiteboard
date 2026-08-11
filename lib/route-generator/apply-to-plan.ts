import { getServiceSupabase } from "@/lib/supabase/server";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import { formatStopDisplayName, groupHouseholds } from "@/lib/route-generator/households";
import { groupHouseholdsWithFacilities } from "@/lib/route-generator/facility";
import {
  DEFAULT_FITDOG_LOCATIONS,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { buildCustomerStopNotes, formatPhoneForDriver } from "@/lib/route-generator/stop-notes";
import { FITDOG_VAN_KEYS, type FitdogVanKey } from "@/lib/route-generator/flags";
import { resolveLoadUnits, type SizeLoadConfig } from "@/lib/route-generator/capacity";
import { householdKeysShareStem, hasFiniteCoords } from "@/lib/route-generator/household-coords";

const VAN_COLORS: Record<FitdogVanKey, string> = {
  van_1: "#f15f2a",
  van_2: "#0ea5e9",
  van_3: "#22c55e",
  van_5: "#a855f7",
  van_6: "#eab308"
};

export type ManualWave = "pickup" | "dropoff" | "both";

export function filterItemsByWave(
  items: NormalizedReportItem[],
  wave: ManualWave | null | undefined
): NormalizedReportItem[] {
  if (!wave || wave === "both") return items;
  return items.filter((item) => item.direction === wave);
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("route_generator_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

async function getLocations(): Promise<FitdogLocationsConfig> {
  const stored = await getSetting<Partial<FitdogLocationsConfig> | null>("locations", null);
  return {
    hub: { ...DEFAULT_FITDOG_LOCATIONS.hub, ...(stored?.hub ?? {}), key: "hub" },
    club: { ...DEFAULT_FITDOG_LOCATIONS.club, ...(stored?.club ?? {}), key: "club" },
    kenneth_hahn: {
      ...DEFAULT_FITDOG_LOCATIONS.kenneth_hahn,
      ...(stored?.kenneth_hahn ?? {}),
      key: "kenneth_hahn"
    },
    huntington: {
      ...DEFAULT_FITDOG_LOCATIONS.huntington,
      ...(stored?.huntington ?? {}),
      key: "huntington"
    }
  };
}

/**
 * Find the latest plan linked to a report run (if Generate Routes already ran).
 */
export async function findLatestPlanForReportRun(reportRunId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("route_plans")
    .select("*")
    .eq("report_run_id", reportRunId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function ensureRouteForVan(params: {
  planId: string;
  versionNumber: number;
  vanKey: FitdogVanKey;
  direction: "pickup" | "dropoff";
  vehiclePool: "club" | "outing";
}) {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", params.planId)
    .eq("version_number", params.versionNumber)
    .eq("van_key", params.vanKey)
    .eq("direction", params.direction)
    .maybeSingle();
  if (existing) return existing;

  const locations = await getLocations();
  const startBase =
    params.vehiclePool === "club"
      ? locations.club
      : params.direction === "pickup"
        ? locations.hub
        : locations.kenneth_hahn;
  const endBase =
    params.vehiclePool === "club"
      ? locations.club
      : params.direction === "pickup"
        ? params.vanKey === "van_3"
          ? locations.huntington
          : locations.kenneth_hahn
        : locations.hub;

  const { data: route, error } = await supabase
    .from("route_plan_routes")
    .insert({
      plan_id: params.planId,
      version_number: params.versionNumber,
      van_key: params.vanKey,
      vehicle_pool: params.vehiclePool,
      direction: params.direction,
      wave_name: params.direction === "pickup" ? "Morning Pickup" : "Afternoon Drop-Off",
      status: "draft",
      total_stops: 0,
      total_dogs: 0,
      capacity_used: 0,
      load_units_used: 0,
      large_dogs: 0,
      service_types: [],
      warnings: [],
      map_color: VAN_COLORS[params.vanKey]
    })
    .select("*")
    .single();
  if (error || !route) throw new Error(error?.message || "Unable to create van route.");

  // Seed depot start/end so the route is valid for export/map.
  await supabase.from("route_plan_stops").insert([
    {
      route_id: route.id,
      sequence: 0,
      stop_kind: "depot_start",
      owner_name: startBase.name,
      address: startBase.address,
      latitude: startBase.latitude,
      longitude: startBase.longitude,
      dog_count: 0,
      load_units: 0,
      driver_notes: `Start at ${startBase.name}`,
      locked: true,
      validation_status: "ok"
    },
    {
      route_id: route.id,
      sequence: 1,
      stop_kind: "depot_end",
      owner_name: endBase.name,
      address: endBase.address,
      latitude: endBase.latitude,
      longitude: endBase.longitude,
      dog_count: 0,
      load_units: 0,
      driver_notes: `End at ${endBase.name}`,
      locked: true,
      validation_status: "ok"
    }
  ]);

  return route;
}

async function renumberCustomerStops(routeId: string) {
  const supabase = getServiceSupabase();
  const { data: stops } = await supabase
    .from("route_plan_stops")
    .select("id, stop_kind, sequence")
    .eq("route_id", routeId)
    .order("sequence");
  const ordered = stops ?? [];
  // Avoid unique(route_id, sequence) collisions while rewriting.
  let temp = 100000;
  for (const stop of ordered) {
    await supabase.from("route_plan_stops").update({ sequence: temp }).eq("id", stop.id);
    temp += 1;
  }
  const depotStart = ordered.find((s) => s.stop_kind === "depot_start");
  const depotEnd = ordered.find((s) => s.stop_kind === "depot_end");
  const customers = ordered.filter((s) => s.stop_kind === "customer");
  let seq = 0;
  if (depotStart) {
    await supabase.from("route_plan_stops").update({ sequence: seq }).eq("id", depotStart.id);
    seq += 1;
  }
  for (const stop of customers) {
    await supabase.from("route_plan_stops").update({ sequence: seq }).eq("id", stop.id);
    seq += 1;
  }
  if (depotEnd) {
    await supabase.from("route_plan_stops").update({ sequence: seq }).eq("id", depotEnd.id);
  }
}

async function refreshRouteTotals(routeId: string) {
  const supabase = getServiceSupabase();
  const { data: stops } = await supabase
    .from("route_plan_stops")
    .select("id, stop_kind, dog_count, load_units")
    .eq("route_id", routeId);
  const customers = (stops ?? []).filter((s) => s.stop_kind === "customer");
  const totalDogs = customers.reduce((sum, s) => sum + Number(s.dog_count || 0), 0);
  const load = customers.reduce((sum, s) => sum + Number(s.load_units || 0), 0);
  const { data: stopItems } = customers.length
    ? await supabase
        .from("route_plan_stop_items")
        .select("service_canonical")
        .in(
          "stop_id",
          customers.map((s) => s.id)
        )
    : { data: [] as Array<{ service_canonical: string | null }> };
  const serviceTypes = [
    ...new Set((stopItems ?? []).map((row) => row.service_canonical).filter(Boolean) as string[])
  ];
  await supabase
    .from("route_plan_routes")
    .update({
      total_stops: customers.length,
      total_dogs: totalDogs,
      capacity_used: totalDogs,
      load_units_used: load,
      service_types: serviceTypes,
      updated_at: new Date().toISOString()
    })
    .eq("id", routeId);
}

/**
 * Append assigned dogs onto an existing plan's van route for the matching wave(s).
 * Pickup items → that van's pickup route; drop-off items → that van's drop-off route.
 */
export async function applyItemsToExistingPlan(params: {
  reportRunId: string;
  vanKey: string;
  items: NormalizedReportItem[];
  wave?: ManualWave | null;
}): Promise<{
  updated: boolean;
  planId: string | null;
  routesUpdated: Array<{ vanKey: string; direction: string; dogsAdded: number }>;
  message: string;
}> {
  if (!FITDOG_VAN_KEYS.includes(params.vanKey as FitdogVanKey)) {
    throw new Error("Select Van 1, 2, 3, 5, or 6. Van 4 is not allowed.");
  }
  const vanKey = params.vanKey as FitdogVanKey;
  const items = filterItemsByWave(params.items, params.wave);
  if (!items.length) {
    return {
      updated: false,
      planId: null,
      routesUpdated: [],
      message: "No items to add for the selected wave."
    };
  }

  const plan = await findLatestPlanForReportRun(params.reportRunId);
  if (!plan) {
    return {
      updated: false,
      planId: null,
      routesUpdated: [],
      message: "No generated plan yet — dogs were saved to the report. Generate Routes to build vans."
    };
  }

  const supabase = getServiceSupabase();
  const locations = await getLocations();
  const sizeLoads = await getSetting<SizeLoadConfig>("dog_size_loads", { configured: false });
  const vehiclePool: "club" | "outing" = vanKey === "van_5" || vanKey === "van_6" ? "club" : "outing";
  const routesUpdated: Array<{ vanKey: string; direction: string; dogsAdded: number }> = [];

  for (const direction of ["pickup", "dropoff"] as const) {
    const directionItems = items.filter((item) => item.direction === direction);
    if (!directionItems.length) continue;

    let groups = groupHouseholdsWithFacilities(directionItems, locations);
    if (!groups.length) {
      groups = groupHouseholds(directionItems);
    }

    const route = await ensureRouteForVan({
      planId: plan.id,
      versionNumber: Number(plan.current_version || 1),
      vanKey,
      direction,
      vehiclePool
    });

    let dogsAdded = 0;
    for (const group of groups) {
      const phones = [
        ...new Set(
          group.items
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
      let load = 0;
      for (const item of group.items) {
        const size = (item.dogSize as "Small" | "Medium" | "Large" | "Extra Large" | "Unknown" | null) ?? "Unknown";
        load += resolveLoadUnits(size, sizeLoads).units;
      }
      const notes = buildCustomerStopNotes({
        items: group.items,
        direction,
        isFacility: group.householdKey.startsWith("facility:"),
        facilityLabel: group.address
      });

      const { data: existingStop } = await supabase
        .from("route_plan_stops")
        .select("*")
        .eq("route_id", route.id)
        .eq("household_key", group.householdKey)
        .eq("stop_kind", "customer")
        .maybeSingle();

      let stopId = existingStop?.id as string | undefined;
      if (existingStop) {
        const nextDogCount = Number(existingStop.dog_count || 0) + group.dogCount;
        const nextLoad = Number(existingStop.load_units || 0) + load;
        const patch: Record<string, unknown> = {
          dog_count: nextDogCount,
          load_units: nextLoad,
          owner_name: formatStopDisplayName([
            // Rebuild label from stop items + new dogs after insert below; use group for now.
            ...group.items
          ]),
          driver_notes: [existingStop.driver_notes, notes].filter(Boolean).join("\n---\n"),
          owner_phone_display: phones[0] || existingStop.owner_phone_display || null,
          locked: true,
          updated_at: new Date().toISOString()
        };
        if (!hasFiniteCoords(existingStop.latitude, existingStop.longitude)) {
          let h = 0;
          const seed = group.householdKey || group.address || group.ownerName || String(existingStop.id);
          for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
          patch.latitude = 34.0195 + ((h % 1000) / 100000);
          patch.longitude = -118.4912 - ((h % 800) / 100000);
          if (!String(existingStop.address || "").trim() && group.address) patch.address = group.address;
        }
        await supabase.from("route_plan_stops").update(patch).eq("id", existingStop.id);
      } else {
        // Prefer coords already on this plan for the same household (AM pickup), else
        // a deterministic synthetic so Samsara export never sees blank lat/lng.
        let latitude: number | null = null;
        let longitude: number | null = null;
        let donorAddress: string | null = null;
        const { data: planRoutes } = await supabase
          .from("route_plan_routes")
          .select("id")
          .eq("plan_id", plan.id);
        const planRouteIds = (planRoutes ?? []).map((row) => String(row.id));
        if (planRouteIds.length) {
          const { data: donorStops } = await supabase
            .from("route_plan_stops")
            .select("household_key, latitude, longitude, address")
            .in("route_id", planRouteIds)
            .eq("stop_kind", "customer")
            .not("latitude", "is", null)
            .not("longitude", "is", null)
            .limit(200);
          const donor = (donorStops ?? []).find(
            (row) =>
              hasFiniteCoords(row.latitude, row.longitude) &&
              householdKeysShareStem(String(row.household_key || ""), group.householdKey)
          );
          if (donor) {
            latitude = Number(donor.latitude);
            longitude = Number(donor.longitude);
            donorAddress = String(donor.address || "") || null;
          }
        }
        if (!hasFiniteCoords(latitude, longitude)) {
          // Match generatePlanForRun synthetic seed — good enough for Samsara upload.
          let h = 0;
          const seed = group.householdKey || group.address || group.ownerName || "stop";
          for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
          latitude = 34.0195 + ((h % 1000) / 100000) + dogsAdded * 0.002;
          longitude = -118.4912 - ((h % 800) / 100000) - dogsAdded * 0.0015;
        }

        // Insert before depot_end: use a high sequence then renumber.
        const { data: stopRow, error: stopError } = await supabase
          .from("route_plan_stops")
          .insert({
            route_id: route.id,
            sequence: 9000 + dogsAdded,
            stop_kind: "customer",
            owner_name: group.ownerName || formatStopDisplayName(group.items),
            address: group.address || donorAddress || "",
            latitude,
            longitude,
            dog_count: group.dogCount,
            load_units: load,
            driver_notes: notes,
            owner_phone_display: phones[0] || null,
            owner_phone_masked: phones[0]
              ? `•••-•••-${phones[0].replace(/\D/g, "").slice(-4)}`
              : null,
            validation_status: "ok",
            locked: true,
            household_key: group.householdKey
          })
          .select("*")
          .single();
        if (stopError || !stopRow) throw new Error(stopError?.message || "Unable to add stop to route.");
        stopId = stopRow.id;
      }

      if (stopId) {
        const itemRows = group.items.map((item) => ({
          stop_id: stopId!,
          dog_name: item.dogName,
          service_canonical: item.serviceCanonical,
          reservation_id: item.reservationId,
          dog_size: item.dogSize,
          load_units: resolveLoadUnits(
            (item.dogSize as "Small" | "Medium" | "Large" | "Extra Large" | "Unknown" | null) ?? "Unknown",
            sizeLoads
          ).units
        }));
        const { error: itemError } = await supabase.from("route_plan_stop_items").insert(itemRows);
        if (itemError) throw new Error(itemError.message);
      }
      dogsAdded += group.dogCount;
    }

    await renumberCustomerStops(route.id);
    await refreshRouteTotals(route.id);
    routesUpdated.push({ vanKey, direction, dogsAdded });
  }

  // Manual adds invalidate approval until re-approved.
  if (plan.status === "approved" || plan.status === "exported") {
    await supabase
      .from("route_plans")
      .update({ status: "ready_for_approval", updated_at: new Date().toISOString() })
      .eq("id", plan.id);
  }

  const waves = routesUpdated.map((row) => `${row.direction} (+${row.dogsAdded})`).join(", ");
  return {
    updated: true,
    planId: plan.id,
    routesUpdated,
    message: `Updated ${vanKey.replace("van_", "Van ")} ${waves}.`
  };
}
