/**
 * Gingr Route Generator → Samsara bulk-upload CSV.
 *
 * Schema source of truth (DO NOT invent columns):
 *   lib/route-generator/samsara-csv.ts → SAMSARA_BULK_UPLOAD_HEADERS
 * Same production headers Digi's Route Generator exports to cloud.samsara.com.
 */

import { formatPostalAddress } from "@/lib/route-generator/destination";
import {
  geocodeMany,
  isGeocodingConfigured,
  type GeocodeResult
} from "@/lib/route-generator/geocode";
import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import {
  SAMSARA_BULK_UPLOAD_HEADERS,
  buildCsv,
  buildRouteName,
  enforceMonotonicRouteSchedule,
  formatSamsaraCoordinate,
  getCanonicalSamsaraTemplate,
  normalizeSamsaraVehicleName,
  sanitizeSamsaraNotes,
  sanitizeSamsaraText,
  synthesizeStopSchedule,
  validateExport,
  type ExportStopRow
} from "@/lib/route-generator/samsara-csv";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import {
  buildTransportationStops,
  stopDisplayName,
  type TransportationStop,
  type TransportationStopBuildResult
} from "@/lib/gingr-route-generator/transportation-stops";

export const GINGR_SAMSARA_SCHEMA_SOURCE =
  "lib/route-generator/samsara-csv.ts (SAMSARA_BULK_UPLOAD_HEADERS) — FitDog Digi Route Generator production bulk-upload schema";

export type MissingAddressStopInfo = {
  dogName: string;
  ownerName: string;
  kind: "PICK_UP" | "DROP_OFF";
};

export type GingrSamsaraExportSummary = {
  date: string;
  fileName: string;
  /** Customer home stops only (excludes Club bookends). */
  stopCount: number;
  pickupCount: number;
  dropoffCount: number;
  excludedMissingAddress: number;
  missingAddressStops: MissingAddressStopInfo[];
  routeCount: number;
  vehicleName: string;
  schemaSource: string;
  headers: readonly string[];
};

export type GingrSamsaraExportResult =
  | {
      ok: true;
      csv: string;
      rows: ExportStopRow[];
      summary: GingrSamsaraExportSummary;
      transportation: TransportationStopBuildResult;
    }
  | {
      ok: false;
      error: string;
      code:
        | "no_transport_stops"
        | "all_addresses_missing"
        | "geocode_unavailable"
        | "geocode_failed"
        | "csv_validation_failed";
      summary?: GingrSamsaraExportSummary;
      transportation?: TransportationStopBuildResult;
      validationErrors?: string[];
    };

export type GeocodeLookup = (addresses: string[]) => Promise<Map<string, GeocodeResult>>;

const DEFAULT_VEHICLE_INPUT = "Van 1";

function exportFileName(date: string): string {
  return `fitdog-samsara-routes-${date}.csv`;
}

function clubDepot() {
  const club = DEFAULT_FITDOG_LOCATIONS.club;
  return {
    name: sanitizeSamsaraText(club.name) || "Fitdog Club",
    address: sanitizeSamsaraText(club.address) || "1712 21st St, Santa Monica, CA 90404",
    latitude: formatSamsaraCoordinate(club.latitude),
    longitude: formatSamsaraCoordinate(club.longitude)
  };
}

function resolveStopAddress(stop: TransportationStop): string | null {
  if (stop.homeAddress) return stop.homeAddress;
  return formatPostalAddress({
    street1: stop.homeStreet1,
    street2: stop.homeStreet2,
    city: stop.homeCity,
    state: stop.homeState,
    postalCode: stop.homePostalCode,
    country: "USA"
  });
}

function buildStopNotes(stop: TransportationStop): string {
  const parts = [
    stop.kind === "PICK_UP" ? "PICK UP FROM HOME" : "DROP OFF TO HOME",
    stop.activityLabels.length ? `Activities: ${stop.activityLabels.join(", ")}` : null,
    stop.ownerPhone ? `Phone: ${stop.ownerPhone}` : null,
    stop.notes ? `Notes: ${stop.notes}` : null
  ].filter(Boolean);
  return sanitizeSamsaraNotes(parts.join(" | "));
}

function toMissingInfo(stop: TransportationStop): MissingAddressStopInfo {
  return {
    dogName: stop.dogName,
    ownerName: stop.ownerName,
    kind: stop.kind
  };
}

function emptySummary(
  date: string,
  vehicleName: string,
  transportation?: TransportationStopBuildResult,
  extraMissing: TransportationStop[] = []
): GingrSamsaraExportSummary {
  const missing = [...(transportation?.missingAddress ?? []), ...extraMissing];
  return {
    date,
    fileName: exportFileName(date),
    stopCount: 0,
    pickupCount: transportation?.pickupCount ?? 0,
    dropoffCount: transportation?.dropoffCount ?? 0,
    excludedMissingAddress: missing.length,
    missingAddressStops: missing.map(toMissingInfo),
    routeCount: 0,
    vehicleName,
    schemaSource: GINGR_SAMSARA_SCHEMA_SOURCE,
    headers: SAMSARA_BULK_UPLOAD_HEADERS
  };
}

/**
 * Map transportation stops → Digi ExportStopRow[] using the exact Samsara schema.
 * Pickups and dropoffs become separate routes, each bookended with Fitdog Club
 * so Samsara receives ≥2 stops per route.
 */
export function mapTransportationStopsToExportRows(params: {
  date: string;
  stops: TransportationStop[];
  geocoded: Map<string, GeocodeResult>;
  vehicleName?: string;
}): { rows: ExportStopRow[]; skippedGeocode: TransportationStop[] } {
  const vehicleName = normalizeSamsaraVehicleName(params.vehicleName || DEFAULT_VEHICLE_INPUT);
  const depot = clubDepot();
  const skippedGeocode: TransportationStop[] = [];
  const rows: ExportStopRow[] = [];

  const pickups = params.stops.filter((s) => s.kind === "PICK_UP");
  const dropoffs = params.stops.filter((s) => s.kind === "DROP_OFF");

  const appendWave = (
    direction: "pickup" | "dropoff",
    waveStops: TransportationStop[]
  ) => {
    if (!waveStops.length) return;

    const routeName = sanitizeSamsaraText(
      buildRouteName({
        date: params.date,
        direction,
        vanDisplay: vehicleName
      })
    );
    const routeNotes = sanitizeSamsaraNotes(
      direction === "pickup"
        ? "Gingr Route Generator | AM home pickups | vehicleAlreadyAtFirstStop=true"
        : "Gingr Route Generator | PM home drop-offs | vehicleAlreadyAtFirstStop=true"
    );

    const customerRows: Array<{
      stop: TransportationStop;
      address: string;
      geo: GeocodeResult;
    }> = [];

    for (const stop of waveStops) {
      const address = resolveStopAddress(stop);
      if (!address) {
        skippedGeocode.push(stop);
        continue;
      }
      const geo = params.geocoded.get(address) || params.geocoded.get(address.trim());
      if (!geo) {
        skippedGeocode.push(stop);
        continue;
      }
      customerRows.push({ stop, address, geo });
    }
    if (!customerRows.length) return;

    type SeqItem = {
      stopName: string;
      notes: string;
      address: string;
      latitude: string;
      longitude: string;
    };
    const sequenced: SeqItem[] = [];

    if (direction === "dropoff") {
      sequenced.push({
        stopName: depot.name,
        notes: sanitizeSamsaraNotes(
          "START: Vehicle is expected to already be at Fitdog Club when the drop-off route begins."
        ),
        address: depot.address,
        latitude: depot.latitude,
        longitude: depot.longitude
      });
    }

    for (const item of customerRows) {
      sequenced.push({
        stopName: sanitizeSamsaraText(stopDisplayName(item.stop)) || item.stop.dogName,
        notes: buildStopNotes(item.stop),
        address: sanitizeSamsaraText(item.geo.formattedAddress || item.address),
        latitude: formatSamsaraCoordinate(item.geo.latitude),
        longitude: formatSamsaraCoordinate(item.geo.longitude)
      });
    }

    if (direction === "pickup") {
      sequenced.push({
        stopName: depot.name,
        notes: sanitizeSamsaraNotes("END: Return dogs to Fitdog Club after home pickups."),
        address: depot.address,
        latitude: depot.latitude,
        longitude: depot.longitude
      });
    }

    sequenced.forEach((item, index) => {
      const schedule = synthesizeStopSchedule({
        operatingDate: params.date,
        direction,
        stopIndex: index,
        stopCount: sequenced.length
      });
      rows.push({
        routeName,
        routeNotes,
        vehicleName,
        driverName: "",
        stopName: item.stopName,
        stopNotes: item.notes,
        stopAddress: item.address,
        scheduledArrival: schedule.arrival,
        scheduledDeparture: schedule.departure,
        routeDate: params.date,
        stopOrder: index + 1,
        latitude: item.latitude,
        longitude: item.longitude
      });
    });
  };

  appendWave("pickup", pickups);
  appendWave("dropoff", dropoffs);
  return { rows, skippedGeocode };
}

export async function buildGingrSamsaraExport(params: {
  date: string;
  dogs: GingrRouteDog[];
  vehicleName?: string;
  geocode?: GeocodeLookup;
}): Promise<GingrSamsaraExportResult> {
  const vehicleName = normalizeSamsaraVehicleName(params.vehicleName || DEFAULT_VEHICLE_INPUT);
  const transportation = buildTransportationStops(params.dogs, params.date);

  if (!transportation.stops.length) {
    return {
      ok: false,
      error:
        "No FitDog transportation stops for this date. Only dogs marked Pick Up or Drop Off are exported.",
      code: "no_transport_stops",
      transportation,
      summary: emptySummary(params.date, vehicleName, transportation)
    };
  }

  if (!transportation.exportable.length) {
    return {
      ok: false,
      error: `${transportation.missingAddress.length} transportation stop(s) could not be exported because customer addresses are missing.`,
      code: "all_addresses_missing",
      transportation,
      summary: emptySummary(params.date, vehicleName, transportation)
    };
  }

  const addresses = Array.from(
    new Set(
      transportation.exportable
        .map((s) => resolveStopAddress(s))
        .filter((a): a is string => Boolean(a))
    )
  );

  if (!params.geocode && !isGeocodingConfigured()) {
    return {
      ok: false,
      error:
        "Geocoding is not configured. Set GOOGLE_MAPS_API_KEY so Samsara rows can include Latitude/Longitude.",
      code: "geocode_unavailable",
      transportation,
      summary: emptySummary(params.date, vehicleName, transportation)
    };
  }

  const geocodeFn = params.geocode || ((addrs: string[]) => geocodeMany(addrs));
  const geocoded = await geocodeFn(addresses);
  const { rows, skippedGeocode } = mapTransportationStopsToExportRows({
    date: params.date,
    stops: transportation.exportable,
    geocoded,
    vehicleName
  });

  if (!rows.length) {
    return {
      ok: false,
      error: "Unable to geocode customer home addresses for Samsara export.",
      code: "geocode_failed",
      transportation,
      summary: emptySummary(params.date, vehicleName, transportation, skippedGeocode)
    };
  }

  enforceMonotonicRouteSchedule(rows);

  const template = getCanonicalSamsaraTemplate();
  const built = buildCsv({ template, rows });
  if (built.errors.length) {
    return {
      ok: false,
      error: `CSV build failed — ${built.errors.slice(0, 5).join("; ")}`,
      code: "csv_validation_failed",
      transportation,
      validationErrors: built.errors,
      summary: emptySummary(params.date, vehicleName, transportation, skippedGeocode)
    };
  }

  const validation = validateExport({
    template,
    rows,
    csv: built.csv,
    operatingDate: params.date
  });
  if (!validation.ok) {
    const errors =
      (validation.report.errors as string[] | undefined) || ["unknown validation error"];
    return {
      ok: false,
      error: `CSV validation failed — Digi will not download a file Samsara may reject: ${errors
        .slice(0, 5)
        .join("; ")}`,
      code: "csv_validation_failed",
      transportation,
      validationErrors: errors,
      summary: emptySummary(params.date, vehicleName, transportation, skippedGeocode)
    };
  }

  const customerStopCount = rows.filter((r) => !/Fitdog Club/i.test(r.stopName)).length;
  const routeCount = new Set(rows.map((r) => r.routeName)).size;

  return {
    ok: true,
    csv: built.csv,
    rows,
    transportation,
    summary: {
      date: params.date,
      fileName: exportFileName(params.date),
      stopCount: customerStopCount,
      pickupCount: transportation.exportable.filter((s) => s.kind === "PICK_UP").length,
      dropoffCount: transportation.exportable.filter((s) => s.kind === "DROP_OFF").length,
      excludedMissingAddress: transportation.missingAddress.length + skippedGeocode.length,
      missingAddressStops: [
        ...transportation.missingAddress,
        ...skippedGeocode
      ].map(toMissingInfo),
      routeCount,
      vehicleName,
      schemaSource: GINGR_SAMSARA_SCHEMA_SOURCE,
      headers: SAMSARA_BULK_UPLOAD_HEADERS
    }
  };
}

/** Pure helper for tests — build CSV from already-geocoded stops. */
export function buildGingrSamsaraCsvFromStops(params: {
  date: string;
  stops: TransportationStop[];
  geocoded: Map<string, GeocodeResult>;
  vehicleName?: string;
}): {
  csv: string;
  rows: ExportStopRow[];
  validation: ReturnType<typeof validateExport>;
} {
  const { rows } = mapTransportationStopsToExportRows(params);
  enforceMonotonicRouteSchedule(rows);
  const template = getCanonicalSamsaraTemplate();
  const built = buildCsv({ template, rows });
  const validation = validateExport({
    template,
    rows,
    csv: built.csv,
    operatingDate: params.date
  });
  return { csv: built.csv, rows, validation };
}
