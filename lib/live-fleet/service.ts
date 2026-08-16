import { toDisplayPhotoUrl } from "@/lib/gingr-photo-display";
import {
  buildNextStopInfo,
  computeRouteProgress,
  directionForStop,
  findNextStop,
  normalizeStopKind,
  resolveStopStatuses
} from "@/lib/live-fleet/progress";
import { classifyFreshness, classifyGpsStatus } from "@/lib/live-fleet/status";
import type {
  LiveFleetDog,
  LiveFleetNextStop,
  LiveFleetRouteSummary,
  LiveFleetSnapshot,
  LiveFleetStop,
  LiveFleetVehicle,
  LiveVehicleTelemetry
} from "@/lib/live-fleet/types";
import { getLiveFleetSyncMeta, loadVehicleConfigs, syncLiveFleetTelemetry } from "@/lib/live-fleet/sync";
import { ensureLiveFleetSchema } from "@/lib/live-fleet/ensure-schema";
import { todayInLosAngeles } from "@/lib/route-generator/samsara-csv";
import { getServiceSupabase } from "@/lib/supabase/server";

function samsaraDashboardUrl(): string {
  return (
    process.env.SAMSARA_DASHBOARD_URL?.trim() ||
    process.env.SAMSARA_CLOUD_URL?.trim() ||
    "https://cloud.samsara.com"
  );
}

function vehicleNumberFromName(displayName: string, vanKey: string): string | null {
  const fromDisplay = displayName.match(/(\d+)/);
  if (fromDisplay) return fromDisplay[1];
  const fromKey = vanKey.match(/(\d+)/);
  return fromKey ? fromKey[1] : null;
}

function routeLabel(params: {
  direction: string;
  waveName: string | null;
  serviceTypes: string[];
  vanDisplay: string;
}): string {
  if (params.waveName?.trim()) return params.waveName.trim();
  if (params.serviceTypes[0]) return params.serviceTypes[0];
  const dir = params.direction === "dropoff" ? "Drop-off" : params.direction === "pickup" ? "Pickup" : "Route";
  return `${params.vanDisplay} ${dir}`;
}

async function loadTodaysPlan(operatingDate: string) {
  const supabase = getServiceSupabase();
  const preferred = ["approved", "exported", "synced_to_samsara", "ready_for_approval", "needs_review"];
  for (const status of preferred) {
    const { data } = await supabase
      .from("route_plans")
      .select("*")
      .eq("operating_date", operatingDate)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("route_plans")
    .select("*")
    .eq("operating_date", operatingDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function loadPlanBundle(plan: Record<string, unknown>, operatingDate: string) {
  const supabase = getServiceSupabase();
  const planId = String(plan.id);
  const version = Number(plan.current_version ?? 1);

  const { data: routes } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", planId)
    .eq("version_number", version)
    .order("van_key");

  const routeIds = (routes ?? []).map((r) => String(r.id));
  const { data: stops } = routeIds.length
    ? await supabase.from("route_plan_stops").select("*").in("route_id", routeIds).order("sequence")
    : { data: [] as Array<Record<string, unknown>> };

  const stopIds = (stops ?? []).map((s) => String(s.id));
  const { data: stopItems } = stopIds.length
    ? await supabase.from("route_plan_stop_items").select("*").in("stop_id", stopIds)
    : { data: [] as Array<Record<string, unknown>> };

  const reportRunId = plan.report_run_id ? String(plan.report_run_id) : null;
  const { data: reportItems } = reportRunId
    ? await supabase.from("route_report_items").select("*").eq("report_run_id", reportRunId)
    : { data: [] as Array<Record<string, unknown>> };

  const { data: tracking } = await supabase
    .from("route_owner_tracking")
    .select("stop_id, status, dog_names, direction")
    .eq("operating_date", operatingDate)
    .not("status", "eq", "cancelled");

  return {
    routes: routes ?? [],
    stops: stops ?? [],
    stopItems: stopItems ?? [],
    reportItems: reportItems ?? [],
    tracking: tracking ?? []
  };
}

function buildRouteForVan(params: {
  vanKey: string;
  displayName: string;
  planId: string;
  route: Record<string, unknown>;
  stops: Array<Record<string, unknown>>;
  stopItems: Array<Record<string, unknown>>;
  reportItems: Array<Record<string, unknown>>;
  trackingByStopId: Map<string, string[]>;
  telemetry: LiveVehicleTelemetry | null;
  gpsFresh: boolean;
}): { route: LiveFleetRouteSummary; nextStop: LiveFleetNextStop | null } {
  const routeDirection = String(params.route.direction || "");
  const serviceTypes = Array.isArray(params.route.service_types)
    ? (params.route.service_types as string[])
    : [];
  const waveName = params.route.wave_name == null ? null : String(params.route.wave_name);

  const routeStopsRaw = params.stops
    .filter((s) => String(s.route_id) === String(params.route.id))
    .sort((a, b) => Number(a.sequence) - Number(b.sequence));

  const statusMap = resolveStopStatuses({
    stops: routeStopsRaw.map((s) => ({
      id: String(s.id),
      stopKind: normalizeStopKind(String(s.stop_kind)),
      sequence: Number(s.sequence)
    })),
    trackingByStopId: params.trackingByStopId
  });

  const itemsByStop = new Map<string, Array<Record<string, unknown>>>();
  for (const item of params.stopItems) {
    const key = String(item.stop_id);
    const list = itemsByStop.get(key) ?? [];
    list.push(item);
    itemsByStop.set(key, list);
  }

  const reportById = new Map(params.reportItems.map((r) => [String(r.id), r]));

  let currentAssigned = false;
  const stops: LiveFleetStop[] = routeStopsRaw.map((stop) => {
    const id = String(stop.id);
    const stopKind = normalizeStopKind(String(stop.stop_kind));
    const direction = directionForStop({
      stopKind,
      routeDirection,
      locationType: stop.location_type == null ? null : String(stop.location_type)
    });
    const items = itemsByStop.get(id) ?? [];
    const dogNames = items
      .map((i) => String(i.dog_name || "").trim())
      .filter(Boolean);
    let status = statusMap.get(id) ?? "upcoming";
    let isNext = false;
    if (status === "current" && !currentAssigned) {
      isNext = true;
      currentAssigned = true;
    } else if (status === "current" && currentAssigned) {
      status = "upcoming";
    }
    const label =
      stopKind === "depot_start"
        ? "Fitdog Departure"
        : stopKind === "depot_end"
          ? String(stop.owner_name || "Fitdog Arrival")
          : dogNames[0] || String(stop.owner_name || "Stop");

    return {
      id,
      sequence: Number(stop.sequence),
      stopKind,
      direction,
      label,
      dogNames,
      address: stop.formatted_address
        ? String(stop.formatted_address)
        : stop.address
          ? String(stop.address)
          : null,
      locationType: stop.location_type == null ? null : String(stop.location_type),
      latitude: stop.latitude == null ? null : Number(stop.latitude),
      longitude: stop.longitude == null ? null : Number(stop.longitude),
      etaArrival: stop.eta_arrival == null ? null : String(stop.eta_arrival),
      status,
      isNext
    };
  });

  if (!currentAssigned) {
    const upcoming = stops.find((s) => s.status === "upcoming");
    if (upcoming) {
      upcoming.status = "current";
      upcoming.isNext = true;
    }
  }

  const progress = computeRouteProgress(stops);
  const dogs = buildDogsForRoute({
    stops,
    stopItems: params.stopItems,
    reportById,
    routeDirection
  });

  const next = findNextStop(stops);
  const nextStop = buildNextStopInfo({
    stop: next,
    vehicle:
      params.telemetry?.latitude != null && params.telemetry.longitude != null
        ? {
            lat: params.telemetry.latitude,
            lng: params.telemetry.longitude,
            speedMph: params.telemetry.speedMph
          }
        : null,
    gpsFresh: params.gpsFresh
  });

  const route: LiveFleetRouteSummary = {
    routeId: String(params.route.id),
    planId: params.planId,
    routeName: routeLabel({
      direction: routeDirection,
      waveName,
      serviceTypes,
      vanDisplay: params.displayName
    }),
    serviceType: serviceTypes[0] ?? null,
    serviceTypes,
    direction: routeDirection || "unknown",
    waveName,
    driverName: params.route.driver_name == null ? null : String(params.route.driver_name),
    startTime: params.route.departure_at == null ? null : String(params.route.departure_at),
    estimatedCompletion: params.route.return_at == null ? null : String(params.route.return_at),
    completedStops: progress.completedStops,
    remainingStops: progress.remainingStops,
    totalStops: progress.totalStops,
    progressPercent: progress.progressPercent,
    routeStatus: progress.routeStatus,
    stops,
    dogs
  };

  return { route, nextStop };
}

function buildDogsForRoute(params: {
  stops: LiveFleetStop[];
  stopItems: Array<Record<string, unknown>>;
  reportById: Map<string, Record<string, unknown>>;
  routeDirection: string;
}): LiveFleetDog[] {
  const stopStatusById = new Map(params.stops.map((s) => [s.id, s]));
  const dogs = new Map<string, LiveFleetDog>();

  for (const item of params.stopItems) {
    const stopId = String(item.stop_id);
    const stop = stopStatusById.get(stopId);
    if (!stop) continue;
    const dogName = String(item.dog_name || "").trim();
    if (!dogName) continue;
    const report = item.report_item_id ? params.reportById.get(String(item.report_item_id)) : null;
    const dogId = report?.dog_id == null ? null : String(report.dog_id);
    const key = dogId || `${dogName}|${item.reservation_id || stopId}`;
    const photoUrl = dogId ? toDisplayPhotoUrl(null, dogId) : null;
    const existing = dogs.get(key);
    const dir = stop.direction;
    const locationType = stop.locationType;
    if (!existing) {
      dogs.set(key, {
        dogId,
        dogName,
        service: item.service_canonical ? String(item.service_canonical) : report?.service_canonical ? String(report.service_canonical) : null,
        photoUrl,
        pickupStatus: dir === "pickup" ? stop.status : null,
        dropoffStatus: dir === "dropoff" ? stop.status : null,
        pickupLocationType: dir === "pickup" ? locationType : null,
        dropoffLocationType: dir === "dropoff" ? locationType : null,
        relevantStopId: stopId,
        timelineStatus: stop.status
      });
    } else {
      if (dir === "pickup") {
        existing.pickupStatus = stop.status;
        existing.pickupLocationType = locationType;
      }
      if (dir === "dropoff") {
        existing.dropoffStatus = stop.status;
        existing.dropoffLocationType = locationType;
      }
      if (stop.isNext || stop.status === "current") {
        existing.relevantStopId = stopId;
        existing.timelineStatus = stop.status;
      }
    }
  }

  return [...dogs.values()].sort((a, b) => a.dogName.localeCompare(b.dogName));
}

/**
 * Build the full Live Fleet snapshot for authorized internal users.
 * Triggers a controlled Samsara sync when due; browsers only hit RuffOps.
 */
export async function getLiveFleetSnapshot(options?: {
  forceSync?: boolean;
}): Promise<LiveFleetSnapshot> {
  const operatingDate = todayInLosAngeles();
  const supabase = getServiceSupabase();
  const schema = await ensureLiveFleetSchema(supabase);
  if (!schema.ready) {
    console.warn(
      JSON.stringify({
        scope: "live_fleet",
        event: "schema_not_ready",
        detail: schema.detail
      })
    );
  }
  const sync = await syncLiveFleetTelemetry({ force: options?.forceSync });
  const syncMeta = await getLiveFleetSyncMeta();
  const configs = await loadVehicleConfigs();
  const activeConfigs = configs.filter((c) => c.active);

  const { data: telemetryRows } = await supabase.from("route_fleet_vehicle_telemetry").select("*");
  const telemetryByVan = new Map(
    (telemetryRows ?? []).map((row) => [String(row.van_key), row])
  );

  const plan = await loadTodaysPlan(operatingDate);
  const bundle = plan ? await loadPlanBundle(plan as Record<string, unknown>, operatingDate) : null;

  const trackingByStopId = new Map<string, string[]>();
  for (const row of bundle?.tracking ?? []) {
    const stopId = row.stop_id == null ? null : String(row.stop_id);
    if (!stopId) continue;
    const list = trackingByStopId.get(stopId) ?? [];
    list.push(String(row.status || "pending"));
    trackingByStopId.set(stopId, list);
  }

  const routesByVan = new Map<string, Array<Record<string, unknown>>>();
  for (const route of bundle?.routes ?? []) {
    const vanKey = String(route.van_key);
    const list = routesByVan.get(vanKey) ?? [];
    list.push(route);
    routesByVan.set(vanKey, list);
  }

  const vehicles: LiveFleetVehicle[] = activeConfigs.map((config) => {
    const row = telemetryByVan.get(config.van_key);
    let telemetry: LiveVehicleTelemetry | null = null;
    if (row) {
      const latitude = row.latitude == null ? null : Number(row.latitude);
      const longitude = row.longitude == null ? null : Number(row.longitude);
      const speedMph = row.speed_mph == null ? null : Number(row.speed_mph);
      const gpsTimestamp = row.gps_timestamp == null ? null : String(row.gps_timestamp);
      const status = classifyGpsStatus({
        latitude,
        longitude,
        speedMph,
        gpsTimestamp
      });
      telemetry = {
        vehicleId: config.van_key,
        samsaraVehicleId: row.samsara_vehicle_id == null ? config.samsara_vehicle_id : String(row.samsara_vehicle_id),
        name: String(row.samsara_vehicle_name || config.samsara_vehicle_name || config.display_name),
        latitude,
        longitude,
        heading: row.heading == null ? null : Number(row.heading),
        speedMph,
        address: row.address == null ? null : String(row.address),
        gpsTimestamp,
        receivedAt: String(row.received_at || row.updated_at || new Date().toISOString()),
        status,
        simulated: Boolean(row.simulated)
      };
    }

    const hasPosition =
      telemetry?.latitude != null &&
      telemetry.longitude != null &&
      Number.isFinite(telemetry.latitude) &&
      Number.isFinite(telemetry.longitude);
    const { freshness, label: freshnessLabel } = classifyFreshness({
      gpsTimestamp: telemetry?.gpsTimestamp ?? null,
      hasPosition: Boolean(hasPosition)
    });
    const gpsFresh = freshness === "live" || freshness === "delayed";

    const vanRoutes = routesByVan.get(config.van_key) ?? [];
    // Prefer the route that is not complete; else first.
    let selectedRoute: LiveFleetRouteSummary | null = null;
    let nextStop: LiveFleetVehicle["nextStop"] = null;
    let driverFromRoute: string | null = null;

    for (const routeRow of vanRoutes) {
      const built = buildRouteForVan({
        vanKey: config.van_key,
        displayName: config.display_name,
        planId: String(plan!.id),
        route: routeRow,
        stops: bundle!.stops,
        stopItems: bundle!.stopItems,
        reportItems: bundle!.reportItems,
        trackingByStopId,
        telemetry,
        gpsFresh
      });
      if (!selectedRoute || (selectedRoute.routeStatus === "complete" && built.route.routeStatus === "active")) {
        selectedRoute = built.route;
        nextStop = built.nextStop;
      }
      driverFromRoute = built.route.driverName || driverFromRoute;
    }

    const mappingStatus: LiveFleetVehicle["mappingStatus"] =
      config.samsara_vehicle_id || telemetry?.samsaraVehicleId
        ? "mapped"
        : config.samsara_vehicle_name || config.samsara_serial
          ? "partial"
          : "unmapped";

    let attention: string | null = null;
    if (telemetry?.simulated) attention = "SIMULATED GPS";
    else if (!syncMeta.configured && !sync.simulated) attention = "GPS temporarily unavailable";
    else if (sync.lastError && !hasPosition) attention = "GPS temporarily unavailable";
    else if (freshness === "stale") attention = "GPS stale";
    else if (!selectedRoute) attention = "No route assigned";
    else if (selectedRoute.routeStatus === "complete") attention = "Route complete";

    return {
      vanKey: config.van_key,
      ruffopsVehicleId: config.van_key,
      displayName: config.display_name,
      vehicleNumber: vehicleNumberFromName(config.display_name, config.van_key),
      samsaraVehicleName: config.samsara_vehicle_name,
      samsaraVehicleId: config.samsara_vehicle_id || telemetry?.samsaraVehicleId || null,
      samsaraSerial: config.samsara_serial,
      driverName: driverFromRoute || config.driver_name,
      telemetry,
      freshness,
      freshnessLabel,
      route: selectedRoute,
      nextStop,
      dogCount: selectedRoute?.dogs.length ?? 0,
      mappingStatus,
      attention
    };
  });

  return {
    operatingDate,
    generatedAt: new Date().toISOString(),
    vehicles,
    sync: {
      configured: syncMeta.configured || sync.configured,
      simulated: sync.simulated || syncMeta.simulated,
      lastSyncAt: sync.lastSyncAt ?? syncMeta.lastSyncAt,
      lastSuccessAt: sync.lastSuccessAt ?? syncMeta.lastSuccessAt,
      lastError: sync.lastError ?? syncMeta.lastError,
      lastErrorStatus: sync.lastErrorStatus ?? syncMeta.lastErrorStatus,
      lastUpdateCount: sync.updateCount || syncMeta.lastUpdateCount,
      hasNextPage: sync.hasNextPage || syncMeta.hasNextPage,
      syncSkipped: sync.skipped,
      syncSkippedReason: sync.skipReason
    },
    planId: plan ? String(plan.id) : null,
    planStatus: plan ? String(plan.status) : null,
    samsaraDashboardUrl: samsaraDashboardUrl()
  };
}
