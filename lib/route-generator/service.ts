import { readFile } from "node:fs/promises";
import path from "node:path";
import { getServiceSupabase } from "@/lib/supabase/server";
import { fitdogRouteReportProvider } from "@/lib/route-generator/fitdog-provider";
import { groupHouseholds } from "@/lib/route-generator/households";
import { optimizeRoutes, type DepotConfig } from "@/lib/route-generator/optimizer";
import {
  autoMapSamsaraHeaders,
  buildCsv,
  buildRouteName,
  validateExport,
  type ExportStopRow,
  type SamsaraTemplate
} from "@/lib/route-generator/samsara-csv";
import { writeRouteAuditEvent } from "@/lib/route-generator/audit";
import { FITDOG_VAN_KEYS, type FitdogVanKey } from "@/lib/route-generator/flags";
import type { VehicleCapacityConfig, SizeLoadConfig } from "@/lib/route-generator/capacity";
import type { CanonicalService } from "@/lib/route-generator/flags";

const VAN_COLORS: Record<FitdogVanKey, string> = {
  van_1: "#f15f2a",
  van_2: "#0ea5e9",
  van_3: "#22c55e",
  van_5: "#a855f7",
  van_6: "#eab308"
};

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("route_generator_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

async function listVehicles(): Promise<VehicleCapacityConfig[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("route_vehicle_configs").select("*").order("van_key");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    vanKey: String(row.van_key),
    active: Boolean(row.active),
    vehiclePool: row.vehicle_pool as "club" | "outing",
    maxDogs: row.max_dogs == null ? null : Number(row.max_dogs),
    maxLoadUnits: row.max_load_units == null ? null : Number(row.max_load_units),
    maxLargeDogs: row.max_large_dogs == null ? null : Number(row.max_large_dogs),
    maxStops: row.max_stops == null ? null : Number(row.max_stops),
    eligibleServices: (row.eligible_services ?? []) as CanonicalService[],
    capacityConfigured: Boolean(row.capacity_configured)
  }));
}

function syntheticCoords(householdKey: string, index: number) {
  // Deterministic Santa Monica-ish synthetic coords for shadow/fixtures — not real customer locations.
  const baseLat = 34.0195;
  const baseLng = -118.4912;
  let h = 0;
  for (let i = 0; i < householdKey.length; i += 1) h = (h * 31 + householdKey.charCodeAt(i)) >>> 0;
  return {
    lat: baseLat + ((h % 1000) / 100000) + index * 0.002,
    lng: baseLng - ((h % 800) / 100000) - index * 0.0015
  };
}

export async function getRouteGeneratorBootstrap() {
  const supabase = getServiceSupabase();
  const [depot, sizeLoads, checklist, vehicles, connection, latestPlan] = await Promise.all([
    getSetting<DepotConfig>("depot", {
      name: "",
      address: "",
      latitude: null,
      longitude: null,
      timezone: "America/Los_Angeles",
      verified: false
    }),
    getSetting<SizeLoadConfig>("dog_size_loads", { configured: false }),
    getSetting<Record<string, unknown>>("feature_checklist", { shadow_mode: true, production_enabled: false }),
    listVehicles(),
    supabase.from("route_report_connections").select("*").eq("provider", "fitdog").maybeSingle(),
    supabase.from("route_plans").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    depot,
    sizeLoads,
    checklist,
    vehicles,
    connection: connection.data,
    latestPlan: latestPlan.data,
    vanKeys: FITDOG_VAN_KEYS,
    mapColors: VAN_COLORS
  };
}

export async function pullReportForDate(params: {
  date: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const pull = await fitdogRouteReportProvider.pullForDate({ date: params.date });

  const { data: run, error } = await supabase
    .from("route_report_runs")
    .insert({
      operating_date: params.date,
      status: pull.formatChanged ? "completed_with_warnings" : "completed",
      source_mode: pull.sourceMode,
      pickup_count: pull.pickupItems.length,
      dropoff_count: pull.dropoffItems.length,
      warning_count: pull.warnings.length,
      error_count: [...pull.pickupItems, ...pull.dropoffItems].filter((i) => i.validationStatus === "error").length,
      format_changed: pull.formatChanged,
      started_by: params.actorAdminId ?? null,
      started_by_email: params.actorEmail ?? null,
      completed_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (error || !run) throw new Error(error?.message || "Unable to create report run.");

  const itemRows = [...pull.pickupItems, ...pull.dropoffItems].map((item) => ({
    report_run_id: run.id,
    direction: item.direction,
    reservation_id: item.reservationId,
    customer_id: item.customerId,
    owner_first_name: item.ownerFirstName,
    owner_last_name: item.ownerLastName,
    owner_full_name: item.ownerFullName,
    dog_id: item.dogId,
    dog_name: item.dogName,
    service_raw: item.serviceRaw,
    service_canonical: item.serviceCanonical,
    address_raw: item.addressRaw,
    address_street: item.addressStreet,
    address_unit: item.addressUnit,
    address_city: item.addressCity,
    address_state: item.addressState,
    address_zip: item.addressZip,
    owner_phone_masked: item.ownerPhoneMasked,
    dog_size: item.dogSize,
    special_notes: item.specialNotes,
    driver_notes: item.driverNotes,
    reservation_notes: item.reservationNotes,
    validation_status: item.validationStatus,
    validation_reasons: item.validationReasons,
    raw: item.raw
  }));

  if (itemRows.length) {
    const { error: itemError } = await supabase.from("route_report_items").insert(itemRows);
    if (itemError) throw new Error(itemError.message);
  }

  await supabase.from("route_report_source_files").insert([
    {
      report_run_id: run.id,
      direction: "pickup",
      sanitized_snapshot: { csvPreview: pull.pickupCsv.slice(0, 4000) },
      content_type: "text/csv"
    },
    {
      report_run_id: run.id,
      direction: "dropoff",
      sanitized_snapshot: { csvPreview: pull.dropoffCsv.slice(0, 4000) },
      content_type: "text/csv"
    }
  ]);

  await supabase
    .from("route_report_connections")
    .update({ last_successful_pull_at: new Date().toISOString(), status: "connected" })
    .eq("provider", "fitdog");

  await writeRouteAuditEvent({
    action: "route_generator.report_pulled",
    entityType: "route_report_run",
    entityId: run.id,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: { date: params.date, pickup: pull.pickupItems.length, dropoff: pull.dropoffItems.length }
  });

  return { run, pull };
}

export async function generatePlanForRun(params: {
  reportRunId: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const { data: run, error } = await supabase.from("route_report_runs").select("*").eq("id", params.reportRunId).single();
  if (error || !run) throw new Error(error?.message || "Report run not found.");

  const { data: items, error: itemsError } = await supabase
    .from("route_report_items")
    .select("*")
    .eq("report_run_id", params.reportRunId);
  if (itemsError) throw new Error(itemsError.message);

  const vehicles = await listVehicles();
  const activeUnconfigured = vehicles.filter((v) => v.active && !v.capacityConfigured);
  const checklist = await getSetting<{ shadow_mode?: boolean; production_enabled?: boolean }>("feature_checklist", {
    shadow_mode: true,
    production_enabled: false
  });
  if (activeUnconfigured.length && checklist.production_enabled) {
    throw new Error(
      "Prevented production route generation: all active vans must have valid capacity settings. Configure vans in Route Generator Settings."
    );
  }
  // Shadow / setup mode: temporarily treat unconfigured vans as capacity-ready with conservative placeholders.
  const effectiveVehicles = vehicles.map((v) =>
    v.capacityConfigured
      ? v
      : {
          ...v,
          maxDogs: v.maxDogs ?? 8,
          maxLoadUnits: v.maxLoadUnits ?? 12,
          maxLargeDogs: v.maxLargeDogs ?? 4,
          maxStops: v.maxStops ?? 20,
          capacityConfigured: true
        }
  );

  const depot = await getSetting<DepotConfig>("depot", {
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    timezone: "America/Los_Angeles",
    verified: false
  });
  if (!depot.verified || !depot.address) {
    // Allow shadow generation with synthetic depot, but mark needs review
  }

  const sizeLoads = await getSetting<SizeLoadConfig>("dog_size_loads", { configured: false });

  const normalized = (items ?? []).map((row) => ({
    direction: row.direction as "pickup" | "dropoff",
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    ownerFirstName: row.owner_first_name,
    ownerLastName: row.owner_last_name,
    ownerFullName: row.owner_full_name,
    dogId: row.dog_id,
    dogName: row.dog_name,
    serviceRaw: row.service_raw,
    serviceCanonical: row.service_canonical,
    addressRaw: row.address_raw,
    addressStreet: row.address_street,
    addressUnit: row.address_unit,
    addressCity: row.address_city,
    addressState: row.address_state,
    addressZip: row.address_zip,
    ownerPhoneMasked: row.owner_phone_masked,
    timeWindowStart: null,
    timeWindowEnd: null,
    dogSize: row.dog_size,
    specialNotes: row.special_notes,
    driverNotes: row.driver_notes,
    reservationNotes: row.reservation_notes,
    householdKey: [row.address_street, row.address_unit, row.address_city, row.address_state, row.address_zip]
      .filter(Boolean)
      .join("|")
      .toLowerCase(),
    validationStatus: row.validation_status,
    validationReasons: row.validation_reasons ?? [],
    raw: row.raw ?? {}
  }));

  const pickupGroups = groupHouseholds(normalized.filter((i) => i.direction === "pickup" && i.validationStatus !== "error"));
  const dropoffGroups = groupHouseholds(normalized.filter((i) => i.direction === "dropoff" && i.validationStatus !== "error"));
  const needsReview = normalized.filter((i) => i.validationStatus !== "ok");

  const coords: Record<string, { lat: number; lng: number }> = {};
  [...pickupGroups, ...dropoffGroups].forEach((g, index) => {
    coords[g.householdKey] = syntheticCoords(g.householdKey, index);
  });

  const effectiveDepot: DepotConfig = {
    ...depot,
    latitude: depot.latitude ?? 34.011,
    longitude: depot.longitude ?? -118.495,
    address: depot.address || "Fitdog Depot (configure in Settings)",
    name: depot.name || "Fitdog"
  };

  const pickupOpt = optimizeRoutes({
    direction: "pickup",
    households: pickupGroups,
    vehicles: effectiveVehicles,
    depot: effectiveDepot,
    sizeLoads,
    seed: `pickup:${run.operating_date}:${params.reportRunId}`,
    coordsByHousehold: coords
  });
  const dropoffOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropoffGroups,
    vehicles: effectiveVehicles,
    depot: effectiveDepot,
    sizeLoads,
    seed: `dropoff:${run.operating_date}:${params.reportRunId}`,
    coordsByHousehold: coords
  });
  if (activeUnconfigured.length) {
    pickupOpt.warnings.push(
      "Active van capacities are not fully configured — shadow placeholders were used. Confirm capacities before production."
    );
  }

  const status =
    needsReview.some((i) => i.validationStatus === "error") ||
    pickupOpt.unassigned.length ||
    dropoffOpt.unassigned.length
      ? "needs_review"
      : "ready_for_approval";

  const { data: plan, error: planError } = await supabase
    .from("route_plans")
    .insert({
      operating_date: run.operating_date,
      report_run_id: run.id,
      status,
      current_version: 1,
      shadow_mode: true,
      summary: {
        pickupDogs: pickupGroups.reduce((n, g) => n + g.dogCount, 0),
        dropoffDogs: dropoffGroups.reduce((n, g) => n + g.dogCount, 0),
        households: pickupGroups.length + dropoffGroups.length,
        vansUsed: new Set([...pickupOpt.routes, ...dropoffOpt.routes].map((r) => r.vanKey)).size,
        unassigned: pickupOpt.unassigned.length + dropoffOpt.unassigned.length,
        needsReview: needsReview.length,
        pickupLabel: pickupOpt.label,
        dropoffLabel: dropoffOpt.label
      },
      created_by: params.actorAdminId ?? null,
      created_by_email: params.actorEmail ?? null
    })
    .select("*")
    .single();
  if (planError || !plan) throw new Error(planError?.message || "Unable to create plan.");

  const snapshot = { pickupOpt, dropoffOpt, needsReviewCount: needsReview.length };
  await supabase.from("route_plan_versions").insert({
    plan_id: plan.id,
    version_number: 1,
    snapshot,
    optimization_seed: `${pickupOpt.seed}|${dropoffOpt.seed}`,
    optimization_label: status === "needs_review" ? "needs_management_review" : "optimized",
    created_by: params.actorAdminId ?? null,
    created_by_email: params.actorEmail ?? null
  });

  for (const route of [...pickupOpt.routes, ...dropoffOpt.routes]) {
    const { data: routeRow, error: routeError } = await supabase
      .from("route_plan_routes")
      .insert({
        plan_id: plan.id,
        version_number: 1,
        van_key: route.vanKey,
        vehicle_pool: route.vehiclePool,
        direction: route.direction,
        wave_name: route.waveName,
        status: "draft",
        total_stops: route.stops.filter((s) => s.stopKind === "customer").length,
        total_dogs: route.totalDogs,
        capacity_used: route.totalDogs,
        load_units_used: route.loadUnitsUsed,
        large_dogs: route.largeDogs,
        estimated_distance_miles: route.estimatedDistanceMiles,
        estimated_drive_minutes: route.estimatedDriveMinutes,
        service_types: route.serviceTypes,
        warnings: route.warnings,
        map_color: VAN_COLORS[route.vanKey]
      })
      .select("*")
      .single();
    if (routeError || !routeRow) throw new Error(routeError?.message || "Unable to save route.");

    for (const stop of route.stops) {
      await supabase.from("route_plan_stops").insert({
        route_id: routeRow.id,
        sequence: stop.sequence,
        stop_kind: stop.stopKind,
        owner_name: stop.ownerName,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        dog_count: stop.dogCount,
        load_units: stop.loadUnits,
        driver_notes: stop.notes,
        validation_status: "ok",
        locked: stop.locked,
        household_key: stop.householdKey
      });
    }
  }

  await writeRouteAuditEvent({
    action: "route_generator.route_generated",
    entityType: "route_plan",
    entityId: plan.id,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole
  });

  return getPlanBundle(plan.id);
}

export async function getPlanBundle(planId: string) {
  const supabase = getServiceSupabase();
  const { data: plan, error } = await supabase.from("route_plans").select("*").eq("id", planId).single();
  if (error || !plan) throw new Error(error?.message || "Plan not found.");

  const { data: routes } = await supabase
    .from("route_plan_routes")
    .select("*")
    .eq("plan_id", planId)
    .eq("version_number", plan.current_version)
    .order("van_key");

  const routeIds = (routes ?? []).map((r) => r.id);
  const { data: stops } = routeIds.length
    ? await supabase.from("route_plan_stops").select("*").in("route_id", routeIds).order("sequence")
    : { data: [] as Array<Record<string, unknown>> };

  const { data: items } = plan.report_run_id
    ? await supabase.from("route_report_items").select("*").eq("report_run_id", plan.report_run_id)
    : { data: [] as Array<Record<string, unknown>> };

  return { plan, routes: routes ?? [], stops: stops ?? [], items: items ?? [] };
}

export async function approvePlan(params: {
  planId: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const { data: plan, error } = await supabase
    .from("route_plans")
    .update({
      status: "approved",
      approved_by: params.actorAdminId ?? null,
      approved_at: new Date().toISOString()
    })
    .eq("id", params.planId)
    .select("*")
    .single();
  if (error || !plan) throw new Error(error?.message || "Unable to approve plan.");
  await writeRouteAuditEvent({
    action: "route_generator.plan_approved",
    entityType: "route_plan",
    entityId: params.planId,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole
  });
  return plan;
}

export async function exportSamsaraCsv(params: {
  planId: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  emergencyOverride?: boolean;
  overrideReason?: string;
}) {
  const bundle = await getPlanBundle(params.planId);
  if (bundle.plan.status !== "approved" && !params.emergencyOverride) {
    throw new Error("CSV generation was blocked because the route plan has not been approved.");
  }
  if (params.emergencyOverride && !params.overrideReason?.trim()) {
    throw new Error("Emergency export requires a written reason.");
  }

  const templateCsv = await readFile(
    path.join(process.cwd(), "scripts/fixtures/route-generator/samsara-template.csv"),
    "utf8"
  );
  const headers = templateCsv.trim().split(/\r?\n/)[0]!.split(",");
  const template: SamsaraTemplate = {
    headers,
    delimiter: ",",
    encoding: "utf-8",
    mappings: autoMapSamsaraHeaders(headers)
  };

  const vehicles = await listVehicles();
  const vehicleNameByKey = new Map(
    vehicles.map((v) => [v.vanKey, v.vanKey.replace("van_", "Van ").replace("_", " ")])
  );
  // Prefer configured Samsara names from DB
  const supabase = getServiceSupabase();
  const { data: vehicleRows } = await supabase.from("route_vehicle_configs").select("van_key, display_name, samsara_vehicle_name");
  for (const row of vehicleRows ?? []) {
    vehicleNameByKey.set(
      String(row.van_key),
      String(row.samsara_vehicle_name || row.display_name || row.van_key)
    );
  }

  const rows: ExportStopRow[] = [];
  for (const route of bundle.routes) {
    const routeStops = bundle.stops.filter((s) => s.route_id === route.id).sort((a, b) => a.sequence - b.sequence);
    const vanDisplay = vehicleNameByKey.get(String(route.van_key)) || String(route.van_key);
    const routeName = buildRouteName({
      date: String(bundle.plan.operating_date),
      direction: route.direction as "pickup" | "dropoff",
      vanDisplay: String(route.display_name || vanDisplay)
    });
    for (const stop of routeStops) {
      rows.push({
        routeName,
        routeNotes: `${route.wave_name} · ${route.vehicle_pool}`,
        vehicleName: vanDisplay,
        driverName: route.driver_name || "",
        stopName: stop.owner_name || stop.stop_kind,
        stopNotes: stop.driver_notes || "",
        stopAddress: stop.address || "",
        scheduledArrival: "",
        scheduledDeparture: "",
        routeDate: String(bundle.plan.operating_date),
        stopOrder: Number(stop.sequence),
        latitude: stop.latitude == null ? "" : String(stop.latitude),
        longitude: stop.longitude == null ? "" : String(stop.longitude)
      });
    }
  }

  const built = buildCsv({ template, rows });
  const validation = validateExport({ template, rows, csv: built.csv });
  if (!validation.ok) {
    throw new Error(
      `CSV validation failed: ${(validation.report.errors as string[]).join("; ") || "unknown error"}`
    );
  }

  const fileName = `fitdog-samsara-routes-${bundle.plan.operating_date}.csv`;
  const { data: job, error } = await supabase
    .from("route_export_jobs")
    .insert({
      plan_id: params.planId,
      version_number: bundle.plan.current_version,
      status: "completed",
      file_name: fileName,
      validation_report: validation.report,
      emergency_override: Boolean(params.emergencyOverride),
      override_reason: params.overrideReason ?? null,
      created_by: params.actorAdminId ?? null,
      created_by_email: params.actorEmail ?? null,
      completed_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("route_plans").update({ status: "exported" }).eq("id", params.planId);

  await writeRouteAuditEvent({
    action: "route_generator.csv_exported",
    entityType: "route_export_job",
    entityId: job?.id,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    reason: params.overrideReason
  });

  // Create owner live-tracking sessions from the exported plan (shadow-safe by default).
  let trackingSessions: { created: number; tokensIssued: number } | null = null;
  try {
    const { createTrackingSessionsFromPlan } = await import("@/lib/live-tracking/sessions");
    const created = await createTrackingSessionsFromPlan({
      planId: params.planId,
      actorAdminId: params.actorAdminId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole
    });
    trackingSessions = { created: created.created, tokensIssued: created.tokensIssued };
  } catch {
    trackingSessions = null;
  }

  return { fileName, csv: built.csv, validation: validation.report, job, trackingSessions };
}
