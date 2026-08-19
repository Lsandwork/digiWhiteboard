import { getServiceSupabase } from "@/lib/supabase/server";
import { fitdogRouteReportProvider } from "@/lib/route-generator/fitdog-provider";
import { annotateFacilityItems, groupHouseholdsWithFacilities, isFacilityHouseholdKey } from "@/lib/route-generator/facility";
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
  type DepotConfig,
  type OptimizationResult
} from "@/lib/route-generator/optimizer";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import {
  detectSharedDogTimingConflicts,
  extractHhMmFromStored,
  hhMmOnOperatingDateToIso
} from "@/lib/route-generator/timing";
import {
  buildCsv,
  buildRouteName,
  combinedExportFileName,
  enforceMonotonicRouteSchedule,
  splitCombinedExportRows,
  ensureScheduleOnOperatingDate,
  formatSamsaraCsvDateTime,
  formatSamsaraCoordinate,
  getCanonicalSamsaraTemplate,
  isAllowedSamsaraVehicleName,
  normalizeSamsaraVehicleName,
  sanitizeSamsaraNotes,
  sanitizeSamsaraText,
  synthesizeStopSchedule,
  todayInLosAngeles,
  validateExport,
  type ExportStopRow,
  type SamsaraTemplate
} from "@/lib/route-generator/samsara-csv";
import {
  copyCoordsForSplitHouseholdKeys,
  hasFiniteCoords,
  householdKeysShareStem
} from "@/lib/route-generator/household-coords";
import { geocodeMany } from "@/lib/route-generator/geocode";
import { reconcileTransportLegs, formatMissingLeg } from "@/lib/route-generator/reconciliation";
import { formatPostalAddress } from "@/lib/route-generator/destination";
import { looksLikePostalAddress, parseAddress } from "@/lib/route-generator/address";
import { assignGeographicVanLocks, clusterOverlapWarnings } from "@/lib/route-generator/geo-cluster";
import { buildDailyDogItineraries } from "@/lib/route-generator/itinerary";
import { validateRoutePlan, type ValidatableStop } from "@/lib/route-generator/plan-validation";
import { buildRouteHealthSummary, formatApprovalBlockMessage, pickPreferredRoutePlan } from "@/lib/route-generator/route-health";
import { RouteGeneratorClientError } from "@/lib/route-generator/errors";
import { writeRouteAuditEvent } from "@/lib/route-generator/audit";
import {
  FITDOG_VAN_KEYS,
  isRouteOwnerSmsEnabled,
  parseRouteGenerationMode,
  type CanonicalService,
  type FitdogVanKey,
  type RouteGenerationMode
} from "@/lib/route-generator/flags";
import type { VehicleCapacityConfig, SizeLoadConfig } from "@/lib/route-generator/capacity";
import {
  DEFAULT_FITDOG_LOCATIONS,
  homeBaseForVehiclePool,
  normalizeBaseKey,
  type FitdogLocationsConfig
} from "@/lib/route-generator/locations";
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

function reportItemLooksLikeTaxi(row: Record<string, unknown>): boolean {
  return /taxi/i.test(String(row.service_canonical || row.service_raw || ""));
}

function gingrTaxiAlreadyImported(existing: Array<Record<string, unknown>>, row: GingrTaxiServiceRow): boolean {
  const reservationId = `gingr-taxi-${row.reservationId}`;
  if (existing.some((item) => String(item.reservation_id || "") === reservationId)) return true;
  const dogId = String(row.dogId || "").trim();
  if (dogId) {
    return existing.some((item) => String(item.dog_id || "") === dogId && reportItemLooksLikeTaxi(item));
  }
  const dogName = String(row.dogName || "").trim().toLowerCase();
  if (!dogName) return false;
  const street = String(row.address || "").trim().toLowerCase().slice(0, 12);
  return existing.some(
    (item) =>
      reportItemLooksLikeTaxi(item) &&
      String(item.dog_name || "").trim().toLowerCase() === dogName &&
      (!street || String(item.address_raw || "").toLowerCase().includes(street))
  );
}

/**
 * Pull Gingr Taxi reservations for the operating date and add any that are not
 * already on the report. Used by One Big Route so the extras tab is not required.
 */
async function mergeGingrTaxisIntoReportRun(params: {
  reportRunId: string;
  operatingDate: string;
  existingItems: Array<Record<string, unknown>>;
  metadata: ReportRunMetadata;
}): Promise<{
  items: Array<Record<string, unknown>>;
  metadata: ReportRunMetadata;
  added: number;
  warning?: string;
}> {
  const gingr = await listGingrTaxiServicesByDate(params.operatingDate);
  if (!gingr.configured) {
    return {
      items: params.existingItems,
      metadata: params.metadata,
      added: 0,
      warning: gingr.error || "Gingr is not configured — Taxi services were not pulled."
    };
  }
  if (gingr.error) {
    return {
      items: params.existingItems,
      metadata: params.metadata,
      added: 0,
      warning: `Gingr Taxi pull failed: ${gingr.error}`
    };
  }
  const toAdd = gingr.services.filter((row) => !gingrTaxiAlreadyImported(params.existingItems, row));
  if (!toAdd.length) {
    return { items: params.existingItems, metadata: params.metadata, added: 0 };
  }
  const normalized = toAdd.flatMap((row) => taxiRowToReportItems({ row }));
  const supabase = getServiceSupabase();
  const { data: inserted, error } = await supabase
    .from("route_report_items")
    .insert(reportItemsFromNormalized(params.reportRunId, normalized, params.operatingDate))
    .select("*");
  if (error) {
    return {
      items: params.existingItems,
      metadata: params.metadata,
      added: 0,
      warning: `Gingr Taxi could not be saved onto the report: ${error.message}`
    };
  }
  const addedIds = toAdd.map((row) => `gingr-taxi-${row.reservationId}`);
  const nextMetadata: ReportRunMetadata = {
    ...params.metadata,
    gingrTaxiImported: [...new Set([...(params.metadata.gingrTaxiImported || []), ...addedIds])],
    warnings: [
      ...params.metadata.warnings,
      `Imported ${toAdd.length} Gingr Taxi reservation(s) into AM pickup and PM drop-off.`
    ]
  };
  const pickupAdded = normalized.filter((item) => item.direction === "pickup").length;
  const dropoffAdded = normalized.filter((item) => item.direction === "dropoff").length;
  await supabase
    .from("route_report_runs")
    .update({
      metadata: nextMetadata,
      pickup_count:
        params.existingItems.filter((item) => item.direction === "pickup").length + pickupAdded,
      dropoff_count:
        params.existingItems.filter((item) => item.direction === "dropoff").length + dropoffAdded
    })
    .eq("id", params.reportRunId);
  return {
    items: [...params.existingItems, ...(inserted ?? [])],
    metadata: nextMetadata,
    added: toAdd.length
  };
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

type PlanStopLocation = {
  id: string;
  stop_kind?: string | null;
  household_key?: string | null;
  owner_name?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

/**
 * Fill missing address/lat/lng on a plan stop before Samsara export.
 * Used for plans already generated with the split-key coord bug (null drop-off coords).
 */
export function resolveExportStopLocation(params: {
  stop: PlanStopLocation;
  allStops: PlanStopLocation[];
  stopItemsByStop: Map<string, Array<Record<string, unknown>>>;
  reportByReservation: Map<string, Record<string, unknown>>;
  index: number;
}): {
  address: string;
  latitude: number | null;
  longitude: number | null;
  repaired: boolean;
  source: string;
} {
  let address = String(params.stop.address || "").trim();
  let latitude =
    params.stop.latitude == null || params.stop.latitude === ""
      ? null
      : Number(params.stop.latitude);
  let longitude =
    params.stop.longitude == null || params.stop.longitude === ""
      ? null
      : Number(params.stop.longitude);
  if (!Number.isFinite(latitude)) latitude = null;
  if (!Number.isFinite(longitude)) longitude = null;

  if (address && hasFiniteCoords(latitude, longitude)) {
    return { address, latitude, longitude, repaired: false, source: "stop" };
  }

  let source = "stop";

  // 1) Same household stem (or same owner name) elsewhere on the plan — usually the AM pickup.
  const donors = params.allStops.filter(
    (candidate) =>
      String(candidate.id) !== String(params.stop.id) &&
      hasFiniteCoords(candidate.latitude, candidate.longitude) &&
      (householdKeysShareStem(candidate.household_key, params.stop.household_key) ||
        (Boolean(params.stop.owner_name) &&
          Boolean(candidate.owner_name) &&
          String(candidate.owner_name).trim().toLowerCase() ===
            String(params.stop.owner_name).trim().toLowerCase()))
  );
  const donor = donors[0];
  if (donor) {
    if (!address) {
      address = String(donor.address || "").trim();
      if (address) source = "plan_donor_address";
    }
    if (!hasFiniteCoords(latitude, longitude)) {
      latitude = Number(donor.latitude);
      longitude = Number(donor.longitude);
      source = "plan_donor_coords";
    }
  }

  // 2) Report-item address for linked reservations (pickup or drop-off row).
  if (!address) {
    const linked = params.stopItemsByStop.get(String(params.stop.id)) ?? [];
    for (const item of linked) {
      const reservationId = item.reservation_id;
      if (reservationId == null) continue;
      const dropoff = params.reportByReservation.get(`dropoff|${reservationId}`);
      const pickup = params.reportByReservation.get(`pickup|${reservationId}`);
      const raw = String(dropoff?.address_raw || pickup?.address_raw || "").trim();
      if (raw) {
        address = raw;
        source = "report_address";
        break;
      }
    }
  }

  // 3) Last resort: deterministic synthetic coords so Digi never hands staff a
  // blank lat/lng cell (Samsara Internal Server Error). Prefer a real donor above.
  if (!hasFiniteCoords(latitude, longitude)) {
    const seed = String(params.stop.household_key || address || params.stop.owner_name || params.stop.id);
    const synth = syntheticCoords(seed, params.index);
    latitude = synth.lat;
    longitude = synth.lng;
    source = source.startsWith("plan_donor") || source === "report_address" ? `${source}+synthetic` : "synthetic";
  }

  const repaired =
    address !== String(params.stop.address || "").trim() ||
    !hasFiniteCoords(params.stop.latitude, params.stop.longitude) ||
    Number(params.stop.latitude) !== latitude ||
    Number(params.stop.longitude) !== longitude;

  return { address, latitude, longitude, repaired, source };
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
  const [locations, sizeLoads, checklist, vehicles, connection, latestPlanRows] = await Promise.all([
    getLocations(depot),
    getSetting<SizeLoadConfig>("dog_size_loads", { configured: false }),
    getSetting<Record<string, unknown>>("feature_checklist", { shadow_mode: true, production_enabled: false }),
    listVehicles(),
    supabase.from("route_report_connections").select("*").eq("provider", "fitdog").maybeSingle(),
    supabase
      .from("route_plans")
      .select("*")
      .eq("operating_date", todayInLosAngeles())
      .order("created_at", { ascending: false })
      .limit(25)
  ]);
  const todayPlans = latestPlanRows.data ?? [];
  const latestPlan =
    pickPreferredRoutePlan(todayPlans) ??
    (
      await supabase.from("route_plans").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()
    ).data;

  return {
    depot,
    locations,
    sizeLoads,
    checklist,
    vehicles,
    connection: connection.data,
    latestPlan,
    vanKeys: FITDOG_VAN_KEYS,
    mapColors: VAN_COLORS,
    mapsProvider: process.env.MAPS_PROVIDER?.trim() || "google",
    mapsConfigured: Boolean(
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim()
    ),
    ownerSmsEnabled: isRouteOwnerSmsEnabled()
  };
}

function reportItemsFromNormalized(
  runId: string,
  items: NormalizedReportItem[],
  operatingDate?: string | null
) {
  const date = String(operatingDate || "").slice(0, 10) || null;
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
    // Columns are timestamptz — store civil class windows on the operating date (LA).
    time_window_start: date ? hhMmOnOperatingDateToIso(date, item.timeWindowStart) : null,
    time_window_end: date ? hhMmOnOperatingDateToIso(date, item.timeWindowEnd) : null,
    dog_size: item.dogSize,
    special_notes: item.specialNotes,
    driver_notes: item.driverNotes,
    reservation_notes: item.reservationNotes,
    validation_status: item.validationStatus,
    validation_reasons: item.validationReasons,
    raw: {
      ...item.raw,
      time_window_start: item.timeWindowStart,
      time_window_end: item.timeWindowEnd
    }
  }));
}

function timeWindowFromRow(row: Record<string, unknown>, which: "start" | "end"): string | null {
  const column = which === "start" ? row.time_window_start : row.time_window_end;
  const fromColumn = extractHhMmFromStored(column);
  if (fromColumn) return fromColumn;
  const raw = (row.raw ?? {}) as Record<string, unknown>;
  const fromRaw = which === "start" ? raw.time_window_start : raw.time_window_end;
  return extractHhMmFromStored(fromRaw);
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

  const itemRows = reportItemsFromNormalized(
    run.id,
    [...pull.pickupItems, ...pull.dropoffItems],
    params.date
  );

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
    .insert(
      reportItemsFromNormalized(params.reportRunId, promoted.items, String(run.operating_date))
    );
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
    .insert(reportItemsFromNormalized(params.reportRunId, items, String(run.operating_date)));
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

function summarizeOneBigRoute(params: {
  pickupOpt: OptimizationResult;
  dropoffOpt: OptimizationResult;
  needsReview: Array<{ dogName?: string | null; ownerFullName?: string | null; validationReasons?: string[] }>;
  gingrTaxiImported?: number;
}) {
  const routes = [...params.pickupOpt.routes, ...params.dropoffOpt.routes];
  const customerStops = routes.flatMap((route) => route.stops.filter((stop) => stop.stopKind === "customer"));
  const pickupStops = params.pickupOpt.routes.flatMap((route) =>
    route.stops.filter((stop) => stop.stopKind === "customer")
  );
  const dropoffStops = params.dropoffOpt.routes.flatMap((route) =>
    route.stops.filter((stop) => stop.stopKind === "customer")
  );
  const dogKeys = new Set<string>();
  for (const stop of customerStops) {
    const ids = stop.dogIds?.filter(Boolean) ?? [];
    if (ids.length) {
      for (const id of ids) dogKeys.add(id);
    } else {
      for (const name of stop.dogNames) dogKeys.add(`${stop.householdKey || stop.ownerName}:${name}`);
    }
  }
  const services = [...new Set(routes.flatMap((route) => route.serviceTypes))];
  const missingAddresses = customerStops
    .filter((stop) => !String(stop.address || "").trim() || stop.latitude == null || stop.longitude == null)
    .map((stop) => ({
      dog: stop.dogNames.join(", ") || "Unknown dog",
      customer: stop.ownerName || "Unknown customer",
      stop: stop.address || stop.ownerName || "Stop",
      field: !String(stop.address || "").trim() ? "address" : "coordinates",
      correction: "Add a complete postal address and geocode before exporting to Samsara."
    }));
  const reviewWarnings = params.needsReview.flatMap((item) =>
    (item.validationReasons || []).map(
      (reason) =>
        `${item.dogName || "Dog"} / ${item.ownerFullName || "customer"}: ${reason}`
    )
  );
  return {
    totalDogs: dogKeys.size || customerStops.reduce((n, stop) => n + stop.dogCount, 0),
    totalStops: customerStops.length,
    pickupStops: pickupStops.length,
    dropoffStops: dropoffStops.length,
    pickupDogs: params.pickupOpt.routes.reduce((n, route) => n + route.totalDogs, 0),
    dropoffDogs: params.dropoffOpt.routes.reduce((n, route) => n + route.totalDogs, 0),
    services,
    gingrTaxiImported: params.gingrTaxiImported ?? 0,
    warnings: [...params.pickupOpt.warnings, ...params.dropoffOpt.warnings, ...reviewWarnings].slice(0, 40),
    missingAddresses
  };
}

export async function generatePlanForRun(params: {
  reportRunId: string;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  correlationId?: string | null;
  routeGenerationMode?: RouteGenerationMode;
}) {
  const auditStartedAt = Date.now();
  const supabase = getServiceSupabase();
  const { data: run, error } = await supabase.from("route_report_runs").select("*").eq("id", params.reportRunId).single();
  if (error || !run) throw new Error(error?.message || "Report run not found.");

  const { createRouteCorrelationId } = await import("@/lib/system-health/correlation");
  const correlationId =
    params.correlationId?.trim() ||
    createRouteCorrelationId(String(run.operating_date).slice(0, 10));

  const { data: loadedItems, error: itemsError } = await supabase
    .from("route_report_items")
    .select("*")
    .eq("report_run_id", params.reportRunId);
  if (itemsError) throw new Error(itemsError.message);
  let items = loadedItems ?? [];
  const routeGenerationMode = parseRouteGenerationMode(params.routeGenerationMode);
  let gingrTaxiImported = 0;
  let gingrTaxiWarning: string | null = null;
  if (routeGenerationMode === "single_combined_route") {
    const taxiMerge = await mergeGingrTaxisIntoReportRun({
      reportRunId: params.reportRunId,
      operatingDate: String(run.operating_date).slice(0, 10),
      existingItems: items,
      metadata: asReportRunMetadata(run.metadata)
    });
    items = taxiMerge.items;
    gingrTaxiImported = taxiMerge.added;
    gingrTaxiWarning = taxiMerge.warning ?? null;
    if (taxiMerge.added > 0 && !gingrTaxiWarning) {
      gingrTaxiWarning = `Imported ${taxiMerge.added} Gingr Taxi reservation(s) into AM pickup and PM drop-off.`;
    }
  }

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

  const normalized = (items ?? []).map((row) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const locationTypeRaw = String(raw.location_type || raw.locationType || "").toUpperCase();
    const locationType =
      locationTypeRaw === "HOME" ||
      locationTypeRaw === "FITDOG" ||
      locationTypeRaw === "HUB" ||
      locationTypeRaw === "OUTING" ||
      locationTypeRaw === "CUSTOM"
        ? locationTypeRaw
        : null;
    return {
      direction: row.direction as "pickup" | "dropoff",
      reservationId: row.reservation_id as string | null,
      customerId: row.customer_id as string | null,
      ownerFirstName: row.owner_first_name as string | null,
      ownerLastName: row.owner_last_name as string | null,
      ownerFullName: row.owner_full_name as string | null,
      dogId: row.dog_id as string | null,
      dogName: row.dog_name as string | null,
      serviceRaw: row.service_raw as string | null,
      serviceCanonical: row.service_canonical as NormalizedReportItem["serviceCanonical"],
      locationType: locationType as NormalizedReportItem["locationType"],
      addressRaw: row.address_raw as string | null,
      addressStreet: row.address_street as string | null,
      addressUnit: row.address_unit as string | null,
      addressCity: row.address_city as string | null,
      addressState: row.address_state as string | null,
      addressZip: row.address_zip as string | null,
      ownerPhoneMasked: row.owner_phone_masked as string | null,
      timeWindowStart: timeWindowFromRow(row as Record<string, unknown>, "start"),
      timeWindowEnd: timeWindowFromRow(row as Record<string, unknown>, "end"),
      dogSize: row.dog_size as string | null,
      specialNotes: row.special_notes as string | null,
      driverNotes: row.driver_notes as string | null,
      reservationNotes: row.reservation_notes as string | null,
      householdKey: [row.address_street, row.address_unit, row.address_city, row.address_state, row.address_zip]
        .filter(Boolean)
        .join("|")
        .toLowerCase(),
      validationStatus: row.validation_status as NormalizedReportItem["validationStatus"],
      validationReasons: (row.validation_reasons ?? []) as string[],
      raw: raw as NormalizedReportItem["raw"]
    } satisfies NormalizedReportItem;
  });

  // Facility annotation MUST run before the error filter. Fitdog often omits street
  // fields on Club/Hub destinations and only sends a location name — those used to be
  // validationStatus=error and silently vanished (Captain/Luna/Mattie-class failures).
  const annotatedAll = annotateFacilityItems(normalized, locations);
  const recoverable = annotatedAll.filter((item) => {
    if (item.validationStatus !== "error") return true;
    // Still blocked only when we truly have no destination after facility recovery.
    return Boolean(item.addressRaw || item.atFacility);
  });
  const stillBlocked = annotatedAll.filter(
    (item) => item.validationStatus === "error" && !item.addressRaw && !item.atFacility
  );
  const sharedDogConflicts = detectSharedDogTimingConflicts(recoverable);

  const pickupGroups = groupHouseholdsWithFacilities(
    recoverable.filter((i) => i.direction === "pickup"),
    locations
  );
  const dropoffGroups = groupHouseholdsWithFacilities(
    recoverable.filter((i) => i.direction === "dropoff"),
    locations
  );
  const needsReview = annotatedAll.filter(
    (i) => i.validationStatus !== "ok" || stillBlocked.includes(i)
  );

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

  // Geocode real customer addresses. NEVER invent Santa Monica synthetic pins for homes —
  // those caused Samsara map pins to land in the wrong place (BUG 1).
  const coords: Record<string, { lat: number; lng: number }> = {};
  const customerAddresses = [...pickupGroups, ...dropoffGroups]
    .filter((g) => !isFacilityHouseholdKey(g.householdKey))
    .map((g) => String(g.address || "").trim())
    .filter(Boolean);
  const geocoded = await geocodeMany(customerAddresses);

  [...pickupGroups, ...dropoffGroups].forEach((g, index) => {
    if (g.householdKey.startsWith("facility:club") && locations.club.latitude != null) {
      coords[g.householdKey] = { lat: locations.club.latitude, lng: locations.club.longitude! };
      return;
    }
    if (g.householdKey.startsWith("facility:hub") && locations.hub.latitude != null) {
      coords[g.householdKey] = { lat: locations.hub.latitude, lng: locations.hub.longitude! };
      return;
    }
    if (g.householdKey.startsWith("facility:kenneth_hahn") && locations.kenneth_hahn.latitude != null) {
      coords[g.householdKey] = {
        lat: locations.kenneth_hahn.latitude,
        lng: locations.kenneth_hahn.longitude!
      };
      return;
    }
    if (g.householdKey.startsWith("facility:huntington") && locations.huntington.latitude != null) {
      coords[g.householdKey] = {
        lat: locations.huntington.latitude,
        lng: locations.huntington.longitude!
      };
      return;
    }
    const hit = geocoded.get(String(g.address || "").trim());
    if (hit) {
      coords[g.householdKey] = { lat: hit.latitude, lng: hit.longitude };
      return;
    }
    // Last resort for shadow/tests without Maps key — deterministic but flagged in summary.
    coords[g.householdKey] = syntheticCoords(g.householdKey, index);
  });
  const usedSyntheticCustomerCoords = [...pickupGroups, ...dropoffGroups].some(
    (g) => !isFacilityHouseholdKey(g.householdKey) && !geocoded.has(String(g.address || "").trim())
  );

  const effectiveDepot: DepotConfig = {
    ...depot,
    latitude: locations.hub.latitude ?? depot.latitude ?? 34.0447,
    longitude: locations.hub.longitude ?? depot.longitude ?? -118.4323,
    address: locations.hub.address || depot.address || DEFAULT_FITDOG_LOCATIONS.hub.address,
    name: locations.hub.name || DEFAULT_FITDOG_LOCATIONS.hub.name
  };

  const operatingDate = String(run.operating_date).slice(0, 10);
  const geoLocks =
    routeGenerationMode === "single_combined_route"
      ? { lockedVanByHousehold: {} as Record<string, FitdogVanKey>, clusters: [], diagnostics: [], warnings: [] as string[] }
      : assignGeographicVanLocks({
          households: pickupGroups,
          vehicles: effectiveVehicles,
          coordsByHousehold: coords,
          existingLocks: lockedVanByHousehold
        });
  const pickupLocks = { ...geoLocks.lockedVanByHousehold, ...lockedVanByHousehold };
  const pickupOpt = optimizeRoutes({
    direction: "pickup",
    households: pickupGroups,
    vehicles: effectiveVehicles,
    depot: effectiveDepot,
    locations,
    sizeLoads,
    seed: `pickup:${run.operating_date}:${params.reportRunId}`,
    coordsByHousehold: coords,
    lockedVanByHousehold: pickupLocks,
    operatingDate,
    routeGenerationMode
  });

  // Drop-off must use the same van that picked each dog up (Van 3 never drops dogs it did not collect).
  // Combined mode does not split by van, so skip the van-lock split.
  const dropoffLock =
    routeGenerationMode === "single_combined_route"
      ? {
          dropoffGroups,
          lockedVanByHousehold,
          warnings: [] as string[]
        }
      : lockDropoffGroupsToPickupVans({
          pickupRoutes: pickupOpt.routes,
          dropoffGroups,
          existingLocks: lockedVanByHousehold
        });
  // Timing already suffixes keys with `::service|band`; van-split adds another
  // `::van_N`. Walking every prefix (not just split("::")[0]) is required — the
  // old first-segment lookup left Daisy/Zuma-style split drop-offs with null coords.
  copyCoordsForSplitHouseholdKeys(
    coords,
    dropoffLock.dropoffGroups.map((group) => group.householdKey)
  );

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
    operatingDate,
    routeGenerationMode
  });
  if (dropoffLock.warnings.length) {
    dropoffOpt.warnings.push(...dropoffLock.warnings);
  }
  if (geoLocks.warnings.length) {
    pickupOpt.warnings.push(...geoLocks.warnings);
  }
  if (sharedDogConflicts.length) {
    pickupOpt.warnings.push(
      ...sharedDogConflicts.slice(0, 20).map((conflict) => `Shared-dog timing: ${conflict.message}`)
    );
    if (sharedDogConflicts.length > 20) {
      pickupOpt.warnings.push(
        `Shared-dog timing: ${sharedDogConflicts.length - 20} additional conflict(s) omitted.`
      );
    }
  }
  if (activeUnconfigured.length) {
    pickupOpt.warnings.push(
      "Active van capacities are not fully configured — shadow placeholders were used. Confirm capacities before production."
    );
  }
  if (gingrTaxiWarning) {
    pickupOpt.warnings.push(gingrTaxiWarning);
  }

  const hasOverflowPlacement =
    pickupOpt.warnings.some((w) => /OVERFLOW/i.test(w)) ||
    dropoffOpt.warnings.some((w) => /OVERFLOW/i.test(w)) ||
    pickupOpt.label === "needs_management_review" ||
    dropoffOpt.label === "needs_management_review";

  const status =
    stillBlocked.length ||
    needsReview.some((i) => i.validationStatus === "error") ||
    pickupOpt.unassigned.length ||
    dropoffOpt.unassigned.length ||
    sharedDogConflicts.length > 0 ||
    usedSyntheticCustomerCoords ||
    hasOverflowPlacement
      ? "needs_review"
      : "ready_for_approval";

  // Build assignment refs for reconciliation — capacity overflow stays UNASSIGNED, never silent.
  const assignedStopRefs = [...pickupOpt.routes, ...dropoffOpt.routes].flatMap((route) =>
    route.stops
      .filter((stop) => stop.stopKind === "customer")
      .map((stop) => ({
        stopId: `${route.vanKey}:${route.direction}:${stop.sequence}:${stop.householdKey || stop.ownerName}`,
        routeVanKey: route.vanKey,
        routeName: `${route.waveName || route.direction} ${route.vanKey}`,
        direction: route.direction as "pickup" | "dropoff",
        reservationIds: stop.reservationIds || [],
        dogIds: stop.dogIds || [],
        dogNames: stop.dogNames || [],
        householdKey: stop.householdKey
      }))
  );
  // Also mark optimizer-unassigned households' dogs as UNASSIGNED via missing match.
  const reconciliation = reconcileTransportLegs({
    items: annotatedAll,
    assignedStops: assignedStopRefs
  });
  const itineraries = buildDailyDogItineraries({
    items: annotatedAll,
    assignedStops: assignedStopRefs.map((ref) => ({
      direction: ref.direction,
      vanKey: ref.routeVanKey,
      householdKey: ref.householdKey,
      reservationIds: ref.reservationIds,
      dogIds: ref.dogIds,
      dogNames: ref.dogNames,
      stopId: ref.stopId
    })),
    coordsByHousehold: coords
  });
  const validatableStops: ValidatableStop[] = [...pickupOpt.routes, ...dropoffOpt.routes].flatMap((route) =>
    route.stops.map((stop) => ({
      id: `${route.vanKey}:${route.direction}:${stop.sequence}:${stop.householdKey || stop.ownerName}`,
      stopKind: stop.stopKind,
      ownerName: stop.ownerName,
      address: stop.address,
      formattedAddress: stop.formattedAddress || stop.address,
      latitude: stop.latitude,
      longitude: stop.longitude,
      householdKey: stop.householdKey,
      locationType: stop.locationType,
      dogNames: stop.dogNames,
      dogIds: stop.dogIds,
      reservationIds: stop.reservationIds,
      direction: route.direction,
      vanKey: route.vanKey
    }))
  );
  const expectedDogKeys = annotatedAll
    .filter((item) => item.validationStatus !== "error" || item.addressRaw || item.atFacility)
    .map((item) => `${item.reservationId || item.dogId || item.dogName || ""}|${item.direction}`)
    .filter((key) => !key.startsWith("|"));
  const generatedValidation = validateRoutePlan({
    reconciliation,
    stops: validatableStops,
    itineraries,
    expectedDogKeys
  });
  const geographicWarnings = clusterOverlapWarnings({
    routes: pickupOpt.routes.map((route) => ({
      vanKey: route.vanKey,
      stops: route.stops.map((stop) => ({
        householdKey: stop.householdKey,
        latitude: stop.latitude,
        longitude: stop.longitude
      }))
    }))
  });
  const routeHealth = buildRouteHealthSummary({
    validation: generatedValidation,
    itineraries,
    expectedDogCount: reconciliation.expectedCount,
    assignedDogCount: reconciliation.assignedCount,
    geographicWarnings,
    vanContinuityBreaks: generatedValidation.issues
      .filter((issue) => issue.code === "van_continuity")
      .map((issue) => ({
        dogName: issue.dogName || "Dog",
        pickupVan: "pickup",
        dropoffVan: "dropoff"
      }))
  });
  if (!reconciliation.ok) {
    // Force needs_review whenever any leg is missing — never approve a silent drop.
  }

  const planStatus =
    reconciliation.ok && status === "ready_for_approval" && !usedSyntheticCustomerCoords && generatedValidation.ok
      ? "ready_for_approval"
      : "needs_review";

  const { data: plan, error: planError } = await supabase
    .from("route_plans")
    .insert({
      operating_date: run.operating_date,
      report_run_id: run.id,
      status: planStatus,
      current_version: 1,
      shadow_mode: true,
      summary: {
        pickupDogs: pickupGroups.reduce((n, g) => n + g.dogCount, 0),
        dropoffDogs: dropoffGroups.reduce((n, g) => n + g.dogCount, 0),
        households: pickupGroups.length + dropoffGroups.length,
        vansUsed:
          routeGenerationMode === "single_combined_route"
            ? 0
            : new Set([...pickupOpt.routes, ...dropoffOpt.routes].map((r) => r.vanKey)).size,
        unassigned: reconciliation.unassignedCount,
        needsReview: needsReview.length,
        sharedDogConflicts: sharedDogConflicts.length,
        pickupLabel: pickupOpt.label,
        dropoffLabel: dropoffOpt.label,
        services: annotatedAll.length,
        transportLegs: reconciliation.expectedCount,
        assignedLegs: reconciliation.assignedCount,
        blockedLegs: reconciliation.blockedCount,
        missingLegs: reconciliation.missingCount,
        addressIssues: usedSyntheticCustomerCoords ? customerAddresses.length - geocoded.size : 0,
        usedSyntheticCustomerCoords,
        ownerTextsEnabled: false,
        vehicleAlreadyAtFirstStop: true,
        routeGenerationMode,
        oneBigRoute:
          routeGenerationMode === "single_combined_route"
            ? summarizeOneBigRoute({ pickupOpt, dropoffOpt, needsReview, gingrTaxiImported })
            : null,
        reconciliation: {
          ok: reconciliation.ok,
          expectedCount: reconciliation.expectedCount,
          assignedCount: reconciliation.assignedCount,
          unassignedCount: reconciliation.unassignedCount,
          blockedCount: reconciliation.blockedCount,
          missing: reconciliation.missing.slice(0, 50).map(formatMissingLeg)
        },
        itineraries: itineraries.map((row) => ({
          dogId: row.dogId,
          dogName: row.dogName,
          reservationId: row.reservationId,
          serviceType: row.serviceType,
          pickup: row.pickup,
          dropoff: row.dropoff,
          assignedVanId: row.assignedVanId,
          assignmentLocked: row.assignmentLocked,
          transferAllowed: row.transferAllowed,
          diagnostics: row.diagnostics
        })),
        routeHealth,
        geographicClusters: geoLocks.clusters,
        assignmentDiagnostics: geoLocks.diagnostics.slice(0, 80)
      },
      created_by: params.actorAdminId ?? null,
      created_by_email: params.actorEmail ?? null
    })
    .select("*")
    .single();
  if (planError || !plan) throw new Error(planError?.message || "Unable to create plan.");

  const snapshot = {
    pickupOpt,
    dropoffOpt,
    needsReviewCount: needsReview.length,
    reconciliation,
    usedSyntheticCustomerCoords,
    routeGenerationMode,
    itineraries,
    routeHealth,
    geographicClusters: geoLocks.clusters
  };
  await supabase.from("route_plan_versions").insert({
    plan_id: plan.id,
    version_number: 1,
    snapshot,
    optimization_seed: `${pickupOpt.seed}|${dropoffOpt.seed}`,
    optimization_label: planStatus === "needs_review" ? "needs_management_review" : "optimized",
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
          requested_window_start: hhMmOnOperatingDateToIso(
            operatingDate,
            stop.requestedWindowStart ?? null
          ),
          requested_window_end: hhMmOnOperatingDateToIso(
            operatingDate,
            stop.requestedWindowEnd ?? null
          ),
          eta_arrival: stop.etaArrival ?? null,
          eta_departure: stop.etaDeparture ?? null,
          validation_status: "ok",
          locked: stop.locked,
          household_key: stop.householdKey,
          location_type: stop.locationType ?? null,
          formatted_address: stop.formattedAddress ?? null
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
    actorRole: params.actorRole,
    correlationId,
    newValue: {
      correlationId,
      routeGenerationMode,
      qualityHint: reconciliation.ok ? "ok" : "needs_review",
      expectedLegs: reconciliation.expectedCount,
      assignedLegs: reconciliation.assignedCount,
      missingLegs: reconciliation.missingCount
    }
  });

  // Permanent System Health route audit (fail-safe — never blocks generation).
  try {
    const { persistRouteGenerationAudit } = await import("@/lib/system-health/route-audit");
    const auditResult = await persistRouteGenerationAudit({
      correlationId,
      planId: plan.id,
      reportRunId: String(run.id),
      operatingDate: operatingDate,
      actorAdminId: params.actorAdminId,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      items: annotatedAll,
      reconciliation,
      geocodedCount: geocoded.size,
      addressCount: customerAddresses.length,
      usedSyntheticCustomerCoords,
      warnings: [...pickupOpt.warnings, ...dropoffOpt.warnings],
      startedAt: auditStartedAt,
      ownerTextsEnabled: false
    });
    if (auditResult?.correlationId) {
      await supabase
        .from("route_plans")
        .update({
          summary: {
            ...(typeof plan.summary === "object" && plan.summary ? plan.summary : {}),
            correlationId: auditResult.correlationId,
            systemHealthQualityGate: auditResult.qualityGate
          }
        })
        .eq("id", plan.id);
    }
  } catch (auditError) {
    console.error("[route-generator] system health audit failed", auditError);
  }

  const bundle = await getPlanBundle(plan.id);
  return {
    ...bundle,
    correlationId
  };
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
  /** Explicit staff opt-in. Default false — Approve alone never texts owners. */
  sendOwnerSms?: boolean;
}) {
  const supabase = getServiceSupabase();
  const sendOwnerSms = Boolean(params.sendOwnerSms);
  const bundle = await getPlanBundle(params.planId);
  const summary = (bundle.plan.summary ?? {}) as Record<string, unknown>;

  const stopIds = bundle.stops.map((stop) => String(stop.id));
  const { data: stopItems } = stopIds.length
    ? await supabase.from("route_plan_stop_items").select("*").in("stop_id", stopIds)
    : { data: [] as Array<Record<string, unknown>> };
  const itemsByStop = new Map<string, Array<Record<string, unknown>>>();
  for (const item of stopItems ?? []) {
    const key = String(item.stop_id);
    const list = itemsByStop.get(key) ?? [];
    list.push(item);
    itemsByStop.set(key, list);
  }

  const assignedStopRefs = bundle.routes.flatMap((route) =>
    bundle.stops
      .filter((stop) => String(stop.route_id) === String(route.id) && stop.stop_kind === "customer")
      .map((stop) => {
        const linked = itemsByStop.get(String(stop.id)) ?? [];
        return {
          stopId: String(stop.id),
          routeVanKey: String(route.van_key),
          routeName: String(route.wave_name || route.van_key),
          direction: route.direction as "pickup" | "dropoff",
          reservationIds: linked.map((row) => String(row.reservation_id || "")).filter(Boolean),
          dogIds: linked.map((row) => String(row.dog_id || "")).filter(Boolean),
          dogNames: linked.map((row) => String(row.dog_name || "")).filter(Boolean),
          householdKey: stop.household_key ? String(stop.household_key) : null
        };
      })
  );
  const reportItems = (bundle.items ?? []) as Array<Record<string, unknown>>;
  const normalizedItems: NormalizedReportItem[] = reportItems.map((row) => {
    const raw = (row.raw ?? {}) as Record<string, unknown>;
    const locationTypeRaw = String(raw.location_type || raw.locationType || row.location_type || "").toUpperCase();
    return {
      direction: row.direction as "pickup" | "dropoff",
      reservationId: (row.reservation_id as string | null) ?? null,
      customerId: (row.customer_id as string | null) ?? null,
      ownerFirstName: (row.owner_first_name as string | null) ?? null,
      ownerLastName: (row.owner_last_name as string | null) ?? null,
      ownerFullName: (row.owner_full_name as string | null) ?? null,
      dogId: (row.dog_id as string | null) ?? null,
      dogName: (row.dog_name as string | null) ?? null,
      serviceRaw: (row.service_raw as string | null) ?? null,
      serviceCanonical: row.service_canonical as NormalizedReportItem["serviceCanonical"],
      locationType:
        locationTypeRaw === "HOME" ||
        locationTypeRaw === "FITDOG" ||
        locationTypeRaw === "HUB" ||
        locationTypeRaw === "OUTING" ||
        locationTypeRaw === "CUSTOM"
          ? locationTypeRaw
          : null,
      addressRaw: (row.address_raw as string | null) ?? null,
      addressStreet: (row.address_street as string | null) ?? null,
      addressUnit: (row.address_unit as string | null) ?? null,
      addressCity: (row.address_city as string | null) ?? null,
      addressState: (row.address_state as string | null) ?? null,
      addressZip: (row.address_zip as string | null) ?? null,
      ownerPhoneMasked: (row.owner_phone_masked as string | null) ?? null,
      timeWindowStart: null,
      timeWindowEnd: null,
      dogSize: (row.dog_size as string | null) ?? null,
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: (row.household_key as string | null) ?? null,
      validationStatus: (row.validation_status as NormalizedReportItem["validationStatus"]) ?? "ok",
      validationReasons: (row.validation_reasons as string[]) ?? [],
      raw: raw as NormalizedReportItem["raw"]
    };
  });
  const reconciliation = reconcileTransportLegs({
    items: normalizedItems,
    assignedStops: assignedStopRefs
  });
  const itineraries = buildDailyDogItineraries({
    items: normalizedItems,
    assignedStops: assignedStopRefs.map((ref) => ({
      direction: ref.direction,
      vanKey: ref.routeVanKey,
      householdKey: ref.householdKey,
      reservationIds: ref.reservationIds,
      dogIds: ref.dogIds,
      dogNames: ref.dogNames,
      stopId: ref.stopId
    }))
  });
  const validatableStops: ValidatableStop[] = bundle.stops.map((stop) => {
    const route = bundle.routes.find((row) => String(row.id) === String(stop.route_id));
    const linked = itemsByStop.get(String(stop.id)) ?? [];
    return {
      id: String(stop.id),
      stopKind: String(stop.stop_kind || ""),
      ownerName: stop.owner_name ? String(stop.owner_name) : null,
      address: stop.address ? String(stop.address) : null,
      formattedAddress: stop.formatted_address ? String(stop.formatted_address) : stop.address ? String(stop.address) : null,
      latitude: stop.latitude == null ? null : Number(stop.latitude),
      longitude: stop.longitude == null ? null : Number(stop.longitude),
      householdKey: stop.household_key ? String(stop.household_key) : null,
      locationType: stop.location_type ? String(stop.location_type) : null,
      dogNames: linked.map((row) => String(row.dog_name || "")).filter(Boolean),
      dogIds: linked.map((row) => String(row.dog_id || "")).filter(Boolean),
      reservationIds: linked.map((row) => String(row.reservation_id || "")).filter(Boolean),
      direction: route ? String(route.direction) : null,
      vanKey: route ? String(route.van_key) : null
    };
  });
  const expectedDogKeys = normalizedItems
    .filter((item) => item.validationStatus !== "error" || item.addressRaw)
    .map((item) => `${item.reservationId || item.dogId || item.dogName || ""}|${item.direction}`)
    .filter((key) => !key.startsWith("|"));
  const validation = validateRoutePlan({
    reconciliation,
    stops: validatableStops,
    itineraries,
    expectedDogKeys
  });
  const health = buildRouteHealthSummary({
    validation,
    itineraries,
    expectedDogCount: reconciliation.expectedCount,
    assignedDogCount: reconciliation.assignedCount
  });
  if (!health.ok) {
    throw new RouteGeneratorClientError(formatApprovalBlockMessage(health), 409, "route_validation_failed");
  }

  const nextSummary = {
    ...summary,
    ownerTextsEnabled: sendOwnerSms,
    vehicleAlreadyAtFirstStop: true,
    routeHealth: health,
    approvedSnapshot: {
      approvedAt: new Date().toISOString(),
      assignedLegs: reconciliation.assignedCount,
      expectedLegs: reconciliation.expectedCount,
      itineraries
    }
  };

  const { data: plan, error } = await supabase
    .from("route_plans")
    .update({
      status: "approved",
      approved_by: params.actorAdminId ?? null,
      approved_at: new Date().toISOString(),
      summary: nextSummary
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
    actorRole: params.actorRole,
    newValue: { sendOwnerSms, vehicleAlreadyAtFirstStop: true, routeHealth: health }
  });

  // Create owner tracking links. SMS only when sendOwnerSms is checked AND kill switch is on.
  let tracking: {
    created: number;
    smsQueued: number;
    smsConfigured: boolean;
    smsEnabled: boolean;
    smsDeferredQuietHours: boolean;
    smsBlockedByKillSwitch: boolean;
    smsErrors: string[];
  } = {
    created: 0,
    smsQueued: 0,
    smsConfigured: false,
    smsEnabled: sendOwnerSms,
    smsDeferredQuietHours: false,
    smsBlockedByKillSwitch: false,
    smsErrors: []
  };
  try {
    tracking = await createOwnerTrackingForPlan(params.planId, { sendSms: sendOwnerSms });
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
    tracking.smsErrors = [
      trackingError instanceof Error ? trackingError.message : "Owner tracking failed"
    ];
  }

  return { plan, tracking };
}

/**
 * Toggle owner tracking texts independently of approval.
 * Does not regenerate routes, duplicate Samsara exports, or clear assignments.
 */
export async function setPlanOwnerTextsEnabled(params: {
  planId: string;
  enabled: boolean;
  actorAdminId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
}) {
  const supabase = getServiceSupabase();
  const bundle = await getPlanBundle(params.planId);
  const status = String(bundle.plan.status || "");
  if (!["approved", "exported", "ready_for_approval", "needs_review"].includes(status)) {
    throw new RouteGeneratorClientError(
      `Cannot change owner texts while plan status is "${status}".`,
      409,
      "invalid_plan_status"
    );
  }

  const summary = {
    ...((bundle.plan.summary ?? {}) as Record<string, unknown>),
    ownerTextsEnabled: Boolean(params.enabled)
  };
  const { data: plan, error } = await supabase
    .from("route_plans")
    .update({ summary, updated_at: new Date().toISOString() })
    .eq("id", params.planId)
    .select("*")
    .single();
  if (error || !plan) throw new Error(error?.message || "Unable to update owner texts setting.");

  // Checkbox never sends SMS. Approve (with explicit confirm) is the send step.
  if (!params.enabled) {
    // Disable future ETA alerts on all tracking rows for this plan — do not revoke links already sent.
    await supabase
      .from("route_owner_tracking")
      .update({ sms_alerts_enabled: false })
      .eq("plan_id", params.planId)
      .eq("sms_alerts_enabled", true);
  }

  await writeRouteAuditEvent({
    action: params.enabled
      ? "route_generator.owner_texts_enabled"
      : "route_generator.owner_texts_disabled",
    entityType: "route_plan",
    entityId: params.planId,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    newValue: { ownerTextsEnabled: params.enabled }
  });

  return { plan, tracking: null, ownerTextsEnabled: Boolean(params.enabled) };
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
  const planStatus = String(bundle.plan.status || "");
  const operatingDate = String(bundle.plan.operating_date || "").slice(0, 10);
  const today = todayInLosAngeles();

  // Allow re-download after the first export — blocking "exported" forced coordinators
  // to reuse stale Downloads copies (e.g. Friday's CSV) when today's re-export failed.
  if (!["approved", "exported"].includes(planStatus) && !params.emergencyOverride) {
    throw new RouteGeneratorClientError(
      "CSV generation was blocked because the route plan has not been approved.",
      400,
      "plan_not_approved"
    );
  }
  if (params.emergencyOverride && !params.overrideReason?.trim()) {
    throw new RouteGeneratorClientError("Emergency export requires a written reason.", 400, "override_reason_required");
  }
  if (operatingDate && operatingDate !== today && !params.emergencyOverride) {
    throw new RouteGeneratorClientError(
      `This plan is for ${operatingDate}, but today is ${today}. Exporting another day's CSV is blocked — Samsara must only receive today's routes. Pull/generate today's plan, or use emergency override with a written reason.`,
      409,
      "wrong_operating_day"
    );
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

  const combinedExport =
    parseRouteGenerationMode((bundle.plan.summary as { routeGenerationMode?: unknown } | undefined)?.routeGenerationMode) ===
    "single_combined_route";
  const rows: ExportStopRow[] = [];
  let realignedScheduleCount = 0;
  let locationRepairedCount = 0;
  const locationRepairSources: string[] = [];
  const locationPatches: Array<{ id: string; address: string; latitude: number; longitude: number }> = [];
  let exportStopIndex = 0;
  for (const route of bundle.routes) {
    const routeStops = bundle.stops.filter((s) => s.route_id === route.id).sort((a, b) => a.sequence - b.sequence);
    const vanDisplay = normalizeSamsaraVehicleName(
      vehicleNameByKey.get(String(route.van_key)) || String(route.van_key)
    );
    const direction = route.direction as "pickup" | "dropoff";
    const routeName = buildRouteName({
      date: operatingDate,
      direction,
      // Always use Samsara vehicle label in the route name (never a freeform display_name).
      vanDisplay,
      combined: combinedExport
    });
    routeStops.forEach((stop, stopIndex) => {
      const location = resolveExportStopLocation({
        stop,
        allStops: bundle.stops,
        stopItemsByStop,
        reportByReservation,
        index: exportStopIndex
      });
      exportStopIndex += 1;
      if (location.repaired && location.latitude != null && location.longitude != null) {
        locationRepairedCount += 1;
        locationRepairSources.push(
          `${stop.owner_name || stop.id}:${location.source}`
        );
        locationPatches.push({
          id: String(stop.id),
          address: location.address || String(stop.address || ""),
          latitude: location.latitude,
          longitude: location.longitude
        });
        // Keep in-memory stops consistent for later donor lookups on this export.
        (stop as { address?: string | null }).address = location.address || stop.address;
        (stop as { latitude?: number | null }).latitude = location.latitude;
        (stop as { longitude?: number | null }).longitude = location.longitude;
      }

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
        operatingDate,
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
      // Samsara requires both times; departure must be strictly after arrival.
      const arrivalMs = etaArrival && !Number.isNaN(etaArrival.getTime()) ? etaArrival.getTime() : null;
      const departureMs = etaDeparture && !Number.isNaN(etaDeparture.getTime()) ? etaDeparture.getTime() : null;
      if (arrivalMs != null && (departureMs == null || departureMs <= arrivalMs)) {
        scheduledDeparture = formatSamsaraCsvDateTime(new Date(arrivalMs + 5 * 60_000));
      }
      if (!scheduledArrival.trim()) scheduledArrival = synthesized.arrival;
      if (!scheduledDeparture.trim()) scheduledDeparture = synthesized.departure;

      const aligned = ensureScheduleOnOperatingDate({
        operatingDate,
        arrival: scheduledArrival,
        departure: scheduledDeparture,
        direction,
        stopIndex,
        stopCount: routeStops.length,
        vanKey: String(route.van_key ?? "")
      });
      scheduledArrival = aligned.arrival;
      scheduledDeparture = aligned.departure;
      if (aligned.realigned) realignedScheduleCount += 1;

      const notesWithRoute =
        stop.stop_kind === "depot_start"
          ? [
              "START: Vehicle is expected to already be at this stop when the route begins (Samsara: check 'Vehicle is expected to already be at this stop').",
              stopNotes.trim(),
              `${route.wave_name || ""}`.trim()
            ]
              .filter(Boolean)
              .join(" | ")
          : stopNotes.trim() || `${route.wave_name || ""}`.trim();
      const safeRouteName = sanitizeSamsaraText(routeName);
      const baseStopName = sanitizeSamsaraText(String(stop.owner_name || stop.stop_kind || "Stop")) || "Stop";
      const directionLabel = direction === "dropoff" ? "Drop Off" : "Pickup";
      const labeledStopName =
        stop.stop_kind === "customer" && !/pickup|drop\s*off/i.test(baseStopName)
          ? `${baseStopName} — ${directionLabel}`
          : baseStopName;
      const sameNameCount = rows.filter(
        (r) =>
          r.routeName === safeRouteName &&
          (r.stopName === labeledStopName || r.stopName.startsWith(`${labeledStopName} (`))
      ).length;
      const stopName =
        sameNameCount === 0
          ? sanitizeSamsaraText(labeledStopName) || "Stop"
          : sanitizeSamsaraText(`${labeledStopName} (${sameNameCount + 1})`) || `${labeledStopName} ${sameNameCount + 1}`;

      const parsedAddress = parseAddress(location.address || String(stop.address || ""));
      const storedFormatted = String(stop.formatted_address || "").trim();
      const postal =
        (looksLikePostalAddress(storedFormatted) ? storedFormatted : null) ||
        formatPostalAddress({
          street1: parsedAddress.street || location.address,
          city: parsedAddress.city,
          state: parsedAddress.state,
          postalCode: parsedAddress.zip,
          country: "USA"
        }) ||
        (looksLikePostalAddress(location.address) ? location.address : "");

      rows.push({
        routeName: safeRouteName,
        routeNotes: sanitizeSamsaraNotes(
          combinedExport
            ? `${route.wave_name} | not divided by van | vehicleAlreadyAtFirstStop=true`
            : `${route.wave_name} | ${route.vehicle_pool} | vehicleAlreadyAtFirstStop=true`
        ),
        vehicleName: vanDisplay,
        driverName: "",
        stopName,
        stopNotes: sanitizeSamsaraNotes(notesWithRoute),
        stopAddress: sanitizeSamsaraText(postal),
        scheduledArrival,
        scheduledDeparture,
        routeDate: operatingDate,
        stopOrder: Number(stop.sequence),
        latitude: formatSamsaraCoordinate(location.latitude == null ? "" : String(location.latitude)),
        longitude: formatSamsaraCoordinate(location.longitude == null ? "" : String(location.longitude))
      });
    });
  }

  // Persist repaired coords so Tracking / next export do not hit the same gap.
  for (const patch of locationPatches) {
    await supabase
      .from("route_plan_stops")
      .update({
        address: patch.address,
        latitude: patch.latitude,
        longitude: patch.longitude,
        updated_at: new Date().toISOString()
      })
      .eq("id", patch.id);
  }

  if (rows.some((row) => !looksLikePostalAddress(row.stopAddress))) {
    const bad = rows.filter((row) => !looksLikePostalAddress(row.stopAddress)).slice(0, 5);
    throw new RouteGeneratorClientError(
      `CSV export blocked — ${bad.length} stop(s) are missing a real postal address (not a dog/stop label): ${bad
        .map((row) => row.stopName)
        .join(", ")}`,
      422,
      "address_validation_failed"
    );
  }
  for (const row of rows) {
    try {
      row.vehicleName = normalizeSamsaraVehicleName(row.vehicleName);
    } catch (error) {
      throw new RouteGeneratorClientError(
        error instanceof Error ? error.message : "Invalid Samsara vehicle name.",
        422,
        "csv_validation_failed"
      );
    }
    if (!isAllowedSamsaraVehicleName(row.vehicleName)) {
      throw new RouteGeneratorClientError(
        `CSV validation failed — vehicle "${row.vehicleName}" on ${row.routeName} must be Van 01/02/03/05/06 exactly (as named in Samsara).`,
        422,
        "csv_validation_failed"
      );
    }
  }

  // Stamp the download time. A date-only name let the browser dedupe repeat exports to
  // "-2"/"-5", and coordinators uploaded whichever copy Finder showed first — including
  // pre-fix files that Samsara rejects.
  const exportStamp = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .format(new Date())
    .replace(":", "");

  type BuiltExportFile = {
    fileName: string;
    csv: string;
    direction: "pickup" | "dropoff" | "all";
    stopCount: number;
    scheduleAdjustedStops: number;
    validation: ReturnType<typeof validateExport>;
  };

  const buildValidatedFile = (
    waveRows: ExportStopRow[],
    fileName: string,
    direction: BuiltExportFile["direction"]
  ): BuiltExportFile => {
    // Repair stop ordering before building. Facility and depot stops are timed from
    // different baselines, so a route could end earlier than its previous stop —
    // Samsara answers those uploads with Internal Server Error.
    const schedule = enforceMonotonicRouteSchedule(waveRows);
    const built = buildCsv({ template, rows: waveRows });
    if (built.errors.length) {
      throw new RouteGeneratorClientError(
        `CSV build failed — ${built.errors.slice(0, 5).join("; ")}`,
        422,
        "csv_validation_failed"
      );
    }
    const validation = validateExport({
      template,
      rows: waveRows,
      csv: built.csv,
      operatingDate
    });
    if (!validation.ok) {
      const waveLabel =
        direction === "pickup" ? "AM pickups" : direction === "dropoff" ? "PM drop-offs" : "export";
      const details = (validation.report.errors as string[]).slice(0, 8).join("; ") || "unknown error";
      throw new RouteGeneratorClientError(
        `CSV validation failed on the ${waveLabel} file — Digi will not download a file Samsara may reject. Fix the dog/customer/stop listed, then export again: ${details}`,
        422,
        "csv_validation_failed"
      );
    }
    return {
      fileName,
      csv: built.csv,
      direction,
      stopCount: waveRows.length,
      scheduleAdjustedStops: schedule.adjustedStops,
      validation
    };
  };

  const files: BuiltExportFile[] = [];
  if (combinedExport) {
    const split = splitCombinedExportRows(rows);
    if (split.pickup.length) {
      files.push(
        buildValidatedFile(
          split.pickup,
          combinedExportFileName({ operatingDate, direction: "pickup", stamp: exportStamp }),
          "pickup"
        )
      );
    }
    if (split.dropoff.length) {
      files.push(
        buildValidatedFile(
          split.dropoff,
          combinedExportFileName({ operatingDate, direction: "dropoff", stamp: exportStamp }),
          "dropoff"
        )
      );
    }
    if (!files.length) {
      throw new RouteGeneratorClientError(
        "One Big Route export has no AM pickup or PM drop-off stops to write.",
        422,
        "csv_validation_failed"
      );
    }
  } else {
    files.push(
      buildValidatedFile(rows, `fitdog-samsara-routes-${operatingDate}-${exportStamp}.csv`, "all")
    );
  }

  const primary = files[0]!;
  let job: Record<string, unknown> | null = null;
  for (const file of files) {
    const { data: jobRow, error } = await supabase
      .from("route_export_jobs")
      .insert({
        plan_id: params.planId,
        version_number: bundle.plan.current_version,
        status: "completed",
        file_name: file.fileName,
        validation_report: {
          ...file.validation.report,
          wave: file.direction,
          realignedScheduleCount,
          locationRepairedCount,
          locationRepairSources: locationRepairSources.slice(0, 40),
          scheduleAdjustedStops: file.scheduleAdjustedStops,
          today,
          operatingDate
        },
        emergency_override: Boolean(params.emergencyOverride),
        override_reason: params.overrideReason ?? null,
        created_by: params.actorAdminId ?? null,
        created_by_email: params.actorEmail ?? null,
        completed_at: new Date().toISOString()
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (!job) job = jobRow;
  }

  await supabase.from("route_plans").update({ status: "exported" }).eq("id", params.planId);

  await writeRouteAuditEvent({
    action: "route_generator.csv_exported",
    entityType: "route_export_job",
    entityId: job?.id != null ? String(job.id) : undefined,
    actorAdminId: params.actorAdminId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    reason: params.overrideReason,
    newValue: {
      operatingDate,
      today,
      realignedScheduleCount,
      locationRepairedCount,
      stopCount: rows.length,
      files: files.map((file) => file.fileName)
    }
  });

  try {
    const { recordIntegrationCall } = await import("@/lib/system-health/integrations");
    const correlationId =
      typeof bundle.plan?.summary === "object" && bundle.plan.summary
        ? String((bundle.plan.summary as Record<string, unknown>).correlationId || "") || null
        : null;
    await recordIntegrationCall({
      integration: "samsara",
      action: "csv_export",
      success: true,
      feature: "route_generator",
      recordCount: rows.length,
      correlationId,
      metadata: {
        fileName: files.map((file) => file.fileName).join(", "),
        operatingDate,
        scheduleAdjustedStops: files.reduce((n, file) => n + file.scheduleAdjustedStops, 0),
        validationOk: files.every((file) => file.validation.ok)
      }
    });
    if (correlationId) {
      const { getServiceSupabase: getSb } = await import("@/lib/supabase/server");
      const sb = getSb();
      await sb
        .from("system_health_route_audits")
        .update({
          samsara_summary: {
            status: "exported",
            fileName: files.map((file) => file.fileName).join(", "),
            stopCount: rows.length,
            validationOk: files.every((file) => file.validation.ok),
            scheduleAdjustedStops: files.reduce((n, file) => n + file.scheduleAdjustedStops, 0)
          },
          updated_at: new Date().toISOString()
        })
        .eq("correlation_id", correlationId);
    }
  } catch (err) {
    console.error("[route-generator] samsara health log failed", err);
  }

  const fileNames = files.map((file) => file.fileName);
  const uploadReminder = combinedExport
    ? `Upload both One Big Route files to Samsara now: ${fileNames.join(" and ")}. AM pickups and PM drop-offs are separate routes. On each route's starting stop, leave checked: "Vehicle is expected to already be at this stop when the route begins."`
    : `Upload ${primary.fileName} to Samsara now. On each route's starting stop, leave checked: "Vehicle is expected to already be at this stop when the route begins." Delete older fitdog-samsara-routes-*.csv files from Downloads first — uploading an earlier copy causes Samsara Internal Server Error.`;

  return {
    fileName: primary.fileName,
    csv: primary.csv,
    files: files.map((file) => ({
      fileName: file.fileName,
      csv: file.csv,
      direction: file.direction,
      stopCount: file.stopCount
    })),
    validation: {
      ...primary.validation.report,
      realignedScheduleCount,
      locationRepairedCount,
      locationRepairSources: locationRepairSources.slice(0, 40),
      scheduleAdjustedStops: files.reduce((n, file) => n + file.scheduleAdjustedStops, 0),
      today,
      operatingDate,
      uploadReminder
    },
    job
  };
}
