import { getServiceSupabase } from "@/lib/supabase/server";
import { fitdogRouteReportProvider } from "@/lib/route-generator/fitdog-provider";
import { groupHouseholdsWithFacilities } from "@/lib/route-generator/facility";
import {
  promoteSkippedOccurrenceToItems,
  serviceForAssignedVan,
  type SkippedOccurrence
} from "@/lib/route-generator/fitdog-api";
import {
  listGingrTaxiServicesByDate,
  manualTaxiToReportItems,
  taxiRowToReportItems,
  type GingrTaxiServiceRow
} from "@/lib/route-generator/gingr-taxi";
import {
  lockDropoffGroupsToPickupVans,
  optimizeRoutes,
  type DepotConfig
} from "@/lib/route-generator/optimizer";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import {
  buildCsv,
  buildRouteName,
  formatSamsaraCsvDateTime,
  formatSamsaraCoordinate,
  getCanonicalSamsaraTemplate,
  normalizeSamsaraVehicleName,
  sanitizeSamsaraNotes,
  synthesizeStopSchedule,
  validateExport,
  type ExportStopRow,
  type SamsaraTemplate
} from "@/lib/route-generator/samsara-csv";
import { writeRouteAuditEvent } from "@/lib/route-generator/audit";
import { FITDOG_VAN_KEYS, type CanonicalService, type FitdogVanKey } from "@/lib/route-generator/flags";
import type { VehicleCapacityConfig, SizeLoadConfig } from "@/lib/route-generator/capacity";
import {
  DEFAULT_FITDOG_LOCATIONS,
  homeBaseForVehiclePool,
  normalizeBaseKey,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";
import { createOwnerTrackingForPlan } from "@/lib/route-generator/owner-tracking";
import { buildCustomerStopNotesFromReportRows } from "@/lib/route-generator/stop-notes";
import {
  applyItemsToExistingPlan,
  type ManualWave
} from "@/lib/route-generator/apply-to-plan";

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

const DEFAULT_VAN_SERVICES: Record<string, CanonicalService[]> = {
  van_1: ["Adventure Hike"],
  van_2: ["Adventure Hike"],
  // Van 3 destination flips by weekday; it can carry Beach or Adventure.
  van_3: ["Beach Excursion", "Adventure Hike"],
  // Van 5/6 live at the Club — taxi, group class, training (not Hahn/Beach outings).
  van_5: ["Trainer-Led Hike", "Group Class", "Taxi Service"],
  van_6: ["Trainer-Led Hike", "Group Class", "Taxi Service"]
};

function vehiclePoolForVan(vanKey: string): "club" | "outing" {
  return vanKey === "van_5" || vanKey === "van_6" ? "club" : "outing";
}

export type ReportRunMetadata = {
  warnings: string[];
  skippedOccurrences: SkippedOccurrence[];
  gingrTaxiImported?: string[];
  manualTaxiIds?: string[];
};

async function listVehicles(): Promise<VehicleCapacityConfig[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("route_vehicle_configs").select("*").order("van_key");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const vanKey = String(row.van_key);
    const vehiclePool = vehiclePoolForVan(vanKey);
    const storedServices = (row.eligible_services ?? []) as CanonicalService[];
    const eligibleServices = DEFAULT_VAN_SERVICES[vanKey] ?? storedServices;
    const defaultHome = homeBaseForVehiclePool(vehiclePool);
    // Van 5/6 always home at Club even if legacy rows still say hub/Hahn.
    const homeBaseKey =
      vanKey === "van_5" || vanKey === "van_6"
        ? ("club" as const)
        : normalizeBaseKey(String(row.starting_depot_key || defaultHome), defaultHome);
    return {
      vanKey,
      active: Boolean(row.active),
      vehiclePool,
      homeBaseKey,
      maxDogs: row.max_dogs == null ? null : Number(row.max_dogs),
      maxLoadUnits: row.max_load_units == null ? null : Number(row.max_load_units),
      maxLargeDogs: row.max_large_dogs == null ? null : Number(row.max_large_dogs),
      maxStops: row.max_stops == null ? null : Number(row.max_stops),
      eligibleServices,
      capacityConfigured: Boolean(row.capacity_configured)
    };
  });
}

function asReportRunMetadata(value: unknown): ReportRunMetadata {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const skipped = Array.isArray(raw.skippedOccurrences) ? (raw.skippedOccurrences as SkippedOccurrence[]) : [];
  const warnings = Array.isArray(raw.warnings) ? (raw.warnings as string[]) : [];
  return {
    warnings,
    skippedOccurrences: skipped,
    gingrTaxiImported: Array.isArray(raw.gingrTaxiImported) ? (raw.gingrTaxiImported as string[]) : undefined,
    manualTaxiIds: Array.isArray(raw.manualTaxiIds) ? (raw.manualTaxiIds as string[]) : undefined
  };
}

async function getLocations(depot: DepotConfig): Promise<FitdogLocationsConfig> {
  const stored = await getSetting<Partial<FitdogLocationsConfig> | null>("locations", null);
  const hub = {
    ...DEFAULT_FITDOG_LOCATIONS.hub,
    ...(stored?.hub ?? {})
  };
  const club = {
    ...DEFAULT_FITDOG_LOCATIONS.club,
    ...(stored?.club ?? {}),
    // Keep club aligned with legacy depot when locations.club was never seeded.
    ...(stored?.club
      ? {}
      : {
          address: depot.address || DEFAULT_FITDOG_LOCATIONS.club.address,
          latitude: depot.latitude ?? DEFAULT_FITDOG_LOCATIONS.club.latitude,
          longitude: depot.longitude ?? DEFAULT_FITDOG_LOCATIONS.club.longitude,
          verified: depot.verified
        })
  };
  const kennethHahn = {
    ...DEFAULT_FITDOG_LOCATIONS.kenneth_hahn,
    ...(stored?.kenneth_hahn ?? {})
  };
  const huntington = {
    ...DEFAULT_FITDOG_LOCATIONS.huntington,
    ...(stored?.huntington ?? {})
  };
  return {
    hub: { ...hub, key: "hub", name: hub.name || DEFAULT_FITDOG_LOCATIONS.hub.name },
    club: { ...club, key: "club", name: club.name || DEFAULT_FITDOG_LOCATIONS.club.name },
    kenneth_hahn: {
      ...kennethHahn,
      key: "kenneth_hahn",
      name: kennethHahn.name || DEFAULT_FITDOG_LOCATIONS.kenneth_hahn.name
    },
    huntington: {
      ...huntington,
      key: "huntington",
      name: huntington.name || DEFAULT_FITDOG_LOCATIONS.huntington.name
    }
  };
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
  const depot = await getSetting<DepotConfig>("depot", {
    name: "",
    address: "",
    latitude: null,
    longitude: null,
    timezone: "America/Los_Angeles",
    verified: false
  });
  const [locations, sizeLoads, checklist, vehicles, connection, latestPlan] = await Promise.all([
    getLocations(depot),
    getSetting<SizeLoadConfig>("dog_size_loads", { configured: false }),
    getSetting<Record<string, unknown>>("feature_checklist", { shadow_mode: true, production_enabled: false }),
    listVehicles(),
    supabase.from("route_report_connections").select("*").eq("provider", "fitdog").maybeSingle(),
    supabase.from("route_plans").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    depot,
    locations,
    sizeLoads,
    checklist,
    vehicles,
    connection: connection.data,
    latestPlan: latestPlan.data,
    vanKeys: FITDOG_VAN_KEYS,
    mapColors: VAN_COLORS,
    mapsProvider: process.env.MAPS_PROVIDER?.trim() || "google",
    mapsConfigured: Boolean(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim()
    )
  };
}

function reportItemsFromNormalized(runId: string, items: NormalizedReportItem[]) {
  return items.map((item) => ({
    report_run_id: runId,
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
}

export async function pullReportForDate(params: {
  date: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const pull = await fitdogRouteReportProvider.pullForDate({ date: params.date });
  const metadata: ReportRunMetadata = {
    warnings: pull.warnings,
    skippedOccurrences: pull.skippedOccurrences ?? []
  };

  const { data: inserted, error } = await supabase
    .from("route_report_runs")
    .insert({
      operating_date: params.date,
      status:
        pull.formatChanged || metadata.skippedOccurrences.length
          ? "completed_with_warnings"
          : "completed",
      source_mode: pull.sourceMode,
      pickup_count: pull.pickupItems.length,
      dropoff_count: pull.dropoffItems.length,
      warning_count: pull.warnings.length,
      error_count: [...pull.pickupItems, ...pull.dropoffItems].filter((i) => i.validationStatus === "error").length,
      format_changed: pull.formatChanged,
      metadata,
      started_by: params.actorAdminId ?? null,
      started_by_email: params.actorEmail ?? null,
      completed_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (error || !inserted) throw new Error(error?.message || "Unable to create report run.");

  let run = inserted;
  // PostgREST can silently drop unknown columns if schema cache is stale — force metadata.
  const persistedMeta = asReportRunMetadata(run.metadata);
  if (
    metadata.skippedOccurrences.length &&
    !persistedMeta.skippedOccurrences.length
  ) {
    const { data: updated, error: metaError } = await supabase
      .from("route_report_runs")
      .update({ metadata })
      .eq("id", run.id)
      .select("*")
      .single();
    if (metaError) {
      console.error("route_report_runs.metadata update failed", metaError.message);
    } else if (updated) {
      run = updated;
    }
  }

  const itemRows = reportItemsFromNormalized(run.id, [...pull.pickupItems, ...pull.dropoffItems]);

  if (itemRows.length) {
    const { error: itemError } = await supabase.from("route_report_items").insert(itemRows);
    if (itemError) throw new Error(itemError.message);
  }

  // Dual-write skipped list into source snapshots so UI can recover if metadata is empty.
  await supabase.from("route_report_source_files").insert([
    {
      report_run_id: run.id,
      direction: "pickup",
      sanitized_snapshot: {
        csvPreview: pull.pickupCsv.slice(0, 4000),
        warnings: metadata.warnings,
        skippedOccurrences: metadata.skippedOccurrences
      },
      content_type: "text/csv"
    },
    {
      report_run_id: run.id,
      direction: "dropoff",
      sanitized_snapshot: {
        csvPreview: pull.dropoffCsv.slice(0, 4000),
        warnings: metadata.warnings,
        skippedOccurrences: metadata.skippedOccurrences
      },
      content_type: "text/csv"
    }
  ]);

  await supabase
    .from("route_report_connections")
    .update({
      last_successful_pull_at: new Date().toISOString(),
      status: "connected",
      source_mode: pull.sourceMode,
      last_error: null
    })
    .eq("provider", "fitdog");

  await writeRouteAuditEvent({
    action: "route_generator.report_pulled",
    entityType: "route_report_run",
    entityId: run.id,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: {
      date: params.date,
      pickup: pull.pickupItems.length,
      dropoff: pull.dropoffItems.length,
      skippedOccurrences: metadata.skippedOccurrences.length
    }
  });

  // Always return in-memory skipped list even if DB metadata write was stripped.
  return {
    run: { ...run, metadata },
    pull: { ...pull, skippedOccurrences: metadata.skippedOccurrences },
    metadata
  };
}

async function metadataFromSourceFiles(reportRunId: string): Promise<ReportRunMetadata | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("route_report_source_files")
    .select("sanitized_snapshot")
    .eq("report_run_id", reportRunId)
    .eq("direction", "pickup")
    .maybeSingle();
  const snap = data?.sanitized_snapshot;
  if (!snap || typeof snap !== "object") return null;
  const meta = asReportRunMetadata(snap);
  if (!meta.skippedOccurrences.length && !meta.warnings.length) return null;
  return meta;
}

export async function getReportRun(reportRunId: string) {
  const supabase = getServiceSupabase();
  const { data: run, error } = await supabase.from("route_report_runs").select("*").eq("id", reportRunId).single();
  if (error || !run) throw new Error(error?.message || "Report run not found.");
  const { data: items } = await supabase.from("route_report_items").select("*").eq("report_run_id", reportRunId);
  let metadata = asReportRunMetadata(run.metadata);
  if (!metadata.skippedOccurrences.length) {
    const fromSource = await metadataFromSourceFiles(reportRunId);
    if (fromSource?.skippedOccurrences.length) {
      metadata = {
        ...metadata,
        ...fromSource,
        skippedOccurrences: fromSource.skippedOccurrences,
        warnings: metadata.warnings.length ? metadata.warnings : fromSource.warnings
      };
      // Best-effort heal empty metadata column for future loads.
      await supabase.from("route_report_runs").update({ metadata }).eq("id", reportRunId);
    }
  }
  return { run, items: items ?? [], metadata };
}

export async function assignSkippedOccurrence(params: {
  reportRunId: string;
  occurrenceId: number;
  vanKey: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  if (!FITDOG_VAN_KEYS.includes(params.vanKey as FitdogVanKey)) {
    throw new Error("Select Van 1, 2, 3, 5, or 6. Van 4 is not allowed.");
  }
  const supabase = getServiceSupabase();
  const { run, metadata } = await getReportRun(params.reportRunId);
  const skipped = [...(metadata.skippedOccurrences || [])];
  const target = skipped.find((row) => row.occurrenceId === params.occurrenceId);
  if (!target) throw new Error("That skipped class occurrence was not found on this report run.");
  if (target.assignedVanKey) {
    throw new Error(`Already assigned to ${target.assignedVanKey.replace("van_", "Van ")}.`);
  }

  const serviceCanonical = serviceForAssignedVan(params.vanKey);
  const promoted = await promoteSkippedOccurrenceToItems({
    occurrenceId: params.occurrenceId,
    vanKey: params.vanKey,
    serviceCanonical
  });
  if (!promoted.items.length) {
    throw new Error("No scheduled dogs found on that class occurrence to assign.");
  }

  const { error: itemError } = await supabase
    .from("route_report_items")
    .insert(reportItemsFromNormalized(params.reportRunId, promoted.items));
  if (itemError) throw new Error(itemError.message);

  const nextSkipped = skipped.map((row) =>
    row.occurrenceId === params.occurrenceId
      ? {
          ...row,
          assignedVanKey: params.vanKey,
          assignedService: serviceCanonical,
          assignedAt: new Date().toISOString()
        }
      : row
  );
  const nextMetadata: ReportRunMetadata = {
    ...metadata,
    skippedOccurrences: nextSkipped
  };
  const pickupCount = (run.pickup_count || 0) + promoted.items.filter((i) => i.direction === "pickup").length;
  const dropoffCount = (run.dropoff_count || 0) + promoted.items.filter((i) => i.direction === "dropoff").length;
  const { data: updated, error: updateError } = await supabase
    .from("route_report_runs")
    .update({
      metadata: nextMetadata,
      pickup_count: pickupCount,
      dropoff_count: dropoffCount,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.reportRunId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message || "Unable to update report run.");

  const planApply = await applyItemsToExistingPlan({
    reportRunId: params.reportRunId,
    vanKey: params.vanKey,
    items: promoted.items,
    wave: "both"
  });

  await writeRouteAuditEvent({
    action: "route_generator.skipped_occurrence_assigned",
    entityType: "route_report_run",
    entityId: params.reportRunId,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: {
      occurrenceId: params.occurrenceId,
      className: promoted.className,
      vanKey: params.vanKey,
      serviceCanonical,
      dogCount: promoted.items.filter((i) => i.direction === "pickup").length,
      planUpdated: planApply.updated,
      planId: planApply.planId,
      routesUpdated: planApply.routesUpdated
    }
  });

  return {
    run: updated,
    metadata: nextMetadata,
    assigned: {
      occurrenceId: params.occurrenceId,
      className: promoted.className,
      vanKey: params.vanKey,
      serviceCanonical,
      itemCount: promoted.items.length
    },
    planApply
  };
}

export async function addTaxiToReportRun(params: {
  reportRunId: string;
  source: "manual" | "gingr";
  vanKey?: string | null;
  /** pickup | dropoff | both — which wave(s) to add onto the assigned van route */
  wave?: ManualWave | null;
  gingrReservationId?: string | null;
  gingrRow?: GingrTaxiServiceRow | null;
  dogName?: string | null;
  ownerName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  notes?: string | null;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  if (params.vanKey && !FITDOG_VAN_KEYS.includes(params.vanKey as FitdogVanKey)) {
    throw new Error("Select Van 1, 2, 3, 5, or 6. Van 4 is not allowed.");
  }
  const supabase = getServiceSupabase();
  const { run, metadata } = await getReportRun(params.reportRunId);
  const wave: ManualWave = params.wave === "pickup" || params.wave === "dropoff" ? params.wave : "both";
  let items: NormalizedReportItem[] = [];

  if (params.source === "gingr") {
    let row = params.gingrRow || null;
    if (!row && params.gingrReservationId) {
      const gingr = await listGingrTaxiServicesByDate(String(run.operating_date));
      row = gingr.services.find((service) => service.reservationId === params.gingrReservationId) || null;
    }
    if (!row) throw new Error("Select a Gingr taxi reservation to add.");
    items = taxiRowToReportItems({ row, vanKey: params.vanKey });
    if (wave !== "both") items = items.filter((item) => item.direction === wave);
  } else {
    if (!params.dogName?.trim() || !params.address?.trim()) {
      throw new Error("Taxi entries need a dog name and address.");
    }
    items = manualTaxiToReportItems({
      dogName: params.dogName,
      ownerName: params.ownerName,
      address: params.address,
      city: params.city,
      state: params.state,
      zip: params.zip,
      phone: params.phone,
      notes: params.notes,
      vanKey: params.vanKey,
      wave
    });
  }

  const { error: itemError } = await supabase
    .from("route_report_items")
    .insert(reportItemsFromNormalized(params.reportRunId, items));
  if (itemError) throw new Error(itemError.message);

  const nextMetadata: ReportRunMetadata = {
    ...metadata,
    gingrTaxiImported:
      params.source === "gingr"
        ? [...(metadata.gingrTaxiImported || []), String(items[0]?.reservationId)]
        : metadata.gingrTaxiImported || [],
    manualTaxiIds:
      params.source === "manual"
        ? [...(metadata.manualTaxiIds || []), String(items[0]?.reservationId)]
        : metadata.manualTaxiIds || []
  };
  const pickupCount = (run.pickup_count || 0) + items.filter((i) => i.direction === "pickup").length;
  const dropoffCount = (run.dropoff_count || 0) + items.filter((i) => i.direction === "dropoff").length;
  const { data: updated, error: updateError } = await supabase
    .from("route_report_runs")
    .update({
      metadata: nextMetadata,
      pickup_count: pickupCount,
      dropoff_count: dropoffCount,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.reportRunId)
    .select("*")
    .single();
  if (updateError || !updated) throw new Error(updateError?.message || "Unable to update report run.");

  let planApply: Awaited<ReturnType<typeof applyItemsToExistingPlan>> | null = null;
  if (params.vanKey) {
    planApply = await applyItemsToExistingPlan({
      reportRunId: params.reportRunId,
      vanKey: params.vanKey,
      items,
      wave
    });
  }

  await writeRouteAuditEvent({
    action: "route_generator.taxi_added",
    entityType: "route_report_run",
    entityId: params.reportRunId,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: {
      source: params.source,
      vanKey: params.vanKey ?? null,
      wave,
      dogName: items[0]?.dogName,
      reservationId: items[0]?.reservationId,
      planUpdated: planApply?.updated ?? false,
      planId: planApply?.planId ?? null,
      routesUpdated: planApply?.routesUpdated ?? []
    }
  });

  return { run: updated, metadata: nextMetadata, items, planApply };
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
  const locations = await getLocations(depot);
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

  const pickupGroups = groupHouseholdsWithFacilities(
    normalized.filter((i) => i.direction === "pickup" && i.validationStatus !== "error"),
    locations
  );
  const dropoffGroups = groupHouseholdsWithFacilities(
    normalized.filter((i) => i.direction === "dropoff" && i.validationStatus !== "error"),
    locations
  );
  const needsReview = normalized.filter((i) => i.validationStatus !== "ok");

  const lockedVanByHousehold: Record<string, FitdogVanKey> = {};
  for (const group of [...pickupGroups, ...dropoffGroups]) {
    for (const item of group.items) {
      const locked = String((item.raw as Record<string, unknown> | undefined)?.locked_van || "").trim();
      if (FITDOG_VAN_KEYS.includes(locked as FitdogVanKey)) {
        lockedVanByHousehold[group.householdKey] = locked as FitdogVanKey;
        break;
      }
    }
  }

  const coords: Record<string, { lat: number; lng: number }> = {};
  [...pickupGroups, ...dropoffGroups].forEach((g, index) => {
    if (
      g.householdKey.startsWith("facility:club") &&
      locations.club.latitude != null &&
      locations.club.longitude != null
    ) {
      coords[g.householdKey] = { lat: locations.club.latitude, lng: locations.club.longitude };
      return;
    }
    if (
      g.householdKey.startsWith("facility:hub") &&
      locations.hub.latitude != null &&
      locations.hub.longitude != null
    ) {
      coords[g.householdKey] = { lat: locations.hub.latitude, lng: locations.hub.longitude };
      return;
    }
    coords[g.householdKey] = syntheticCoords(g.householdKey, index);
  });

  const effectiveDepot: DepotConfig = {
    ...depot,
    latitude: locations.hub.latitude ?? depot.latitude ?? 34.0447,
    longitude: locations.hub.longitude ?? depot.longitude ?? -118.4323,
    address: locations.hub.address || depot.address || DEFAULT_FITDOG_LOCATIONS.hub.address,
    name: locations.hub.name || DEFAULT_FITDOG_LOCATIONS.hub.name
  };

  const operatingDate = String(run.operating_date).slice(0, 10);
  const pickupOpt = optimizeRoutes({
    direction: "pickup",
    households: pickupGroups,
    vehicles: effectiveVehicles,
    depot: effectiveDepot,
    locations,
    sizeLoads,
    seed: `pickup:${run.operating_date}:${params.reportRunId}`,
    coordsByHousehold: coords,
    lockedVanByHousehold,
    operatingDate
  });

  // Drop-off must use the same van that picked each dog up (Van 3 never drops dogs it did not collect).
  const dropoffLock = lockDropoffGroupsToPickupVans({
    pickupRoutes: pickupOpt.routes,
    dropoffGroups,
    existingLocks: lockedVanByHousehold
  });
  for (const group of dropoffLock.dropoffGroups) {
    const baseKey = group.householdKey.split("::")[0]!;
    if (!coords[group.householdKey] && coords[baseKey]) {
      coords[group.householdKey] = coords[baseKey]!;
    }
  }

  const dropoffOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropoffLock.dropoffGroups,
    vehicles: effectiveVehicles,
    depot: effectiveDepot,
    locations,
    sizeLoads,
    seed: `dropoff:${run.operating_date}:${params.reportRunId}`,
    coordsByHousehold: coords,
    lockedVanByHousehold: dropoffLock.lockedVanByHousehold,
    operatingDate
  });
  if (dropoffLock.warnings.length) {
    dropoffOpt.warnings.push(...dropoffLock.warnings);
  }
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
      const { data: stopRow, error: stopError } = await supabase
        .from("route_plan_stops")
        .insert({
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
          owner_phone_masked: stop.ownerPhoneDisplay
            ? `•••-•••-${String(stop.ownerPhoneDisplay).replace(/\D/g, "").slice(-4)}`
            : null,
          owner_phone_display: stop.ownerPhoneDisplay ?? null,
          validation_status: "ok",
          locked: stop.locked,
          household_key: stop.householdKey
        })
        .select("*")
        .single();
      if (stopError || !stopRow) throw new Error(stopError?.message || "Unable to save stop.");

      if (stop.stopKind === "customer" && stop.reservationIds.length) {
        const itemRows = stop.reservationIds.map((reservationId, index) => ({
          stop_id: stopRow.id,
          dog_name: stop.dogNames[index] || null,
          service_canonical: stop.serviceTypes[0] || null,
          reservation_id: reservationId,
          dog_size: null,
          load_units: 1
        }));
        const { error: itemError } = await supabase.from("route_plan_stop_items").insert(itemRows);
        if (itemError) throw new Error(itemError.message);
      }
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

  let metadata: ReportRunMetadata = { warnings: [], skippedOccurrences: [] };
  let reportRun: Record<string, unknown> | null = null;
  if (plan.report_run_id) {
    const loaded = await getReportRun(String(plan.report_run_id));
    reportRun = loaded.run as Record<string, unknown>;
    metadata = loaded.metadata;
  }

  return {
    plan,
    routes: routes ?? [],
    stops: stops ?? [],
    items: items ?? [],
    reportRun,
    metadata
  };
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

  // Create owner tracking links (+ SMS when Twilio is configured).
  try {
    const tracking = await createOwnerTrackingForPlan(params.planId);
    await writeRouteAuditEvent({
      action: "route_generator.owner_tracking_created",
      entityType: "route_plan",
      entityId: params.planId,
      actorAdminId: params.actorAdminId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      newValue: tracking
    });
  } catch (trackingError) {
    console.error("owner tracking create failed", trackingError);
  }

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

  // Always use Samsara's exact A–K bulk-upload headers. Never trust a stale
  // DB/fixture alias set — unsupported names fail cloud.samsara.com upload.
  const template: SamsaraTemplate = getCanonicalSamsaraTemplate();

  const vehicles = await listVehicles();
  const vehicleNameByKey = new Map(
    vehicles.map((v) => [v.vanKey, normalizeSamsaraVehicleName(v.vanKey.replace("van_", "Van "))])
  );
  // Prefer configured Samsara names from DB, then normalize to Van 01… style.
  const supabase = getServiceSupabase();
  const { data: vehicleRows } = await supabase.from("route_vehicle_configs").select("van_key, display_name, samsara_vehicle_name");
  for (const row of vehicleRows ?? []) {
    const configured = String(row.samsara_vehicle_name || row.display_name || row.van_key);
    vehicleNameByKey.set(String(row.van_key), normalizeSamsaraVehicleName(configured));
  }

  // Load stop→reservation links so export can rebuild Fitdog pickup instructions + phones.
  const stopIds = bundle.stops.map((s) => String(s.id));
  const { data: stopItems } = stopIds.length
    ? await supabase.from("route_plan_stop_items").select("*").in("stop_id", stopIds)
    : { data: [] as Array<Record<string, unknown>> };
  const stopItemsByStop = new Map<string, Array<Record<string, unknown>>>();
  for (const item of stopItems ?? []) {
    const key = String(item.stop_id);
    const list = stopItemsByStop.get(key) ?? [];
    list.push(item);
    stopItemsByStop.set(key, list);
  }
  const reportItems = (bundle.items ?? []) as Array<Record<string, unknown>>;
  const reportByReservation = new Map(
    reportItems
      .filter((item) => item.reservation_id != null)
      .map((item) => [`${item.direction}|${item.reservation_id}`, item])
  );

  const rows: ExportStopRow[] = [];
  for (const route of bundle.routes) {
    const routeStops = bundle.stops.filter((s) => s.route_id === route.id).sort((a, b) => a.sequence - b.sequence);
    const vanDisplay = vehicleNameByKey.get(String(route.van_key)) || String(route.van_key);
    const direction = route.direction as "pickup" | "dropoff";
    const routeName = buildRouteName({
      date: String(bundle.plan.operating_date),
      direction,
      vanDisplay: String(route.display_name || vanDisplay)
    });
    routeStops.forEach((stop, stopIndex) => {
      let stopNotes = String(stop.driver_notes || "");
      if (stop.stop_kind === "customer") {
        const linked = stopItemsByStop.get(String(stop.id)) ?? [];
        const matchedReport = linked
          .map((item) => reportByReservation.get(`${direction}|${item.reservation_id}`))
          .filter((row): row is Record<string, unknown> => Boolean(row));
        // Fallback: same household + direction from the report run.
        const householdMatches =
          matchedReport.length > 0
            ? matchedReport
            : reportItems.filter(
                (item) =>
                  item.direction === direction &&
                  stop.household_key &&
                  String(item.address_raw || "")
                    .toLowerCase()
                    .includes(String(stop.address || "").slice(0, 12).toLowerCase())
              );
        if (householdMatches.length) {
          stopNotes = buildCustomerStopNotesFromReportRows(householdMatches, direction, {
            isFacility: isFacilityHouseholdKey(stop.household_key),
            facilityLabel: stop.address
          });
        }
        // Ensure phone is present even if older notes only had dog counts.
        if (stop.owner_phone_display && !/Phone:/i.test(stopNotes)) {
          stopNotes = `${stopNotes}\nPhone: ${stop.owner_phone_display}`.trim();
        }
      }
      const stopRecord = stop as Record<string, unknown>;
      const etaArrival = stopRecord.eta_arrival ? new Date(String(stopRecord.eta_arrival)) : null;
      const etaDeparture = stopRecord.eta_departure
        ? new Date(String(stopRecord.eta_departure))
        : null;
      const synthesized = synthesizeStopSchedule({
        operatingDate: String(bundle.plan.operating_date),
        direction,
        stopIndex,
        stopCount: routeStops.length,
        vanKey: String(route.van_key ?? "")
      });
      let scheduledArrival =
        etaArrival && !Number.isNaN(etaArrival.getTime())
          ? formatSamsaraCsvDateTime(etaArrival)
          : synthesized.arrival;
      let scheduledDeparture =
        etaDeparture && !Number.isNaN(etaDeparture.getTime())
          ? formatSamsaraCsvDateTime(etaDeparture)
          : synthesized.departure;
      // Samsara requires both times; departure must not precede arrival.
      const arrivalMs = etaArrival && !Number.isNaN(etaArrival.getTime()) ? etaArrival.getTime() : null;
      const departureMs = etaDeparture && !Number.isNaN(etaDeparture.getTime()) ? etaDeparture.getTime() : null;
      if (arrivalMs != null && (departureMs == null || departureMs < arrivalMs)) {
        scheduledDeparture = formatSamsaraCsvDateTime(new Date(arrivalMs + 5 * 60_000));
      }
      if (!scheduledArrival.trim()) scheduledArrival = synthesized.arrival;
      if (!scheduledDeparture.trim()) scheduledDeparture = synthesized.departure;
      // Prefer stop notes; include route wave context when present.
      const notesWithRoute =
        stopNotes.trim() ||
        `${route.wave_name || ""}`.trim();
      rows.push({
        routeName,
        routeNotes: `${route.wave_name} · ${route.vehicle_pool}`,
        // Assign by vehicle only — Samsara rejects assigning both driver + vehicle.
        vehicleName: normalizeSamsaraVehicleName(vanDisplay),
        driverName: "",
        stopName: String(stop.owner_name || stop.stop_kind || "Stop").trim(),
        stopNotes: sanitizeSamsaraNotes(notesWithRoute),
        stopAddress: stop.address || "",
        scheduledArrival,
        scheduledDeparture,
        routeDate: String(bundle.plan.operating_date),
        stopOrder: Number(stop.sequence),
        latitude: formatSamsaraCoordinate(stop.latitude == null ? "" : String(stop.latitude)),
        longitude: formatSamsaraCoordinate(stop.longitude == null ? "" : String(stop.longitude))
      });
    });
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

  return { fileName, csv: built.csv, validation: validation.report, job };
}
