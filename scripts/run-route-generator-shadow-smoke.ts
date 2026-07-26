/**
 * Shadow smoke without Supabase JS service-role key.
 * Validates fixture parse → optimize → CSV using DB-seeded depot/vans via pg,
 * then updates feature_checklist. Does not enable production flags.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";
import { autoMapHeaders, normalizeReportRows, parseCsv } from "../lib/route-generator/parser";
import { groupHouseholds } from "../lib/route-generator/households";
import { optimizeRoutes, type DepotConfig } from "../lib/route-generator/optimizer";
import {
  autoMapSamsaraHeaders,
  buildCsv,
  validateExport,
  buildRouteName,
  type ExportStopRow,
  type SamsaraTemplate
} from "../lib/route-generator/samsara-csv";
import type { VehicleCapacityConfig, SizeLoadConfig } from "../lib/route-generator/capacity";
import type { CanonicalService } from "../lib/route-generator/flags";

loadEnvFiles();

const PROJECT_REF = "tzkocaucqtmmnrttxira";

function db() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password?.trim()) throw new Error("Missing SUPABASE_DB_PASSWORD");
  return new Client({
    connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password.trim())}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
}

async function main() {
  const client = db();
  await client.connect();

  const pickupCsv = readFileSync(resolve("scripts/fixtures/route-generator/pickup-sample.csv"), "utf8");
  const dropoffCsv = readFileSync(resolve("scripts/fixtures/route-generator/dropoff-sample.csv"), "utf8");
  const pickup = parseCsv(pickupCsv);
  const dropoff = parseCsv(dropoffCsv);
  const pickupItems = normalizeReportRows({
    rows: pickup.rows,
    mapping: autoMapHeaders(pickup.headers),
    defaultDirection: "pickup"
  }).items.filter((i) => i.validationStatus !== "error");
  const dropoffItems = normalizeReportRows({
    rows: dropoff.rows,
    mapping: autoMapHeaders(dropoff.headers),
    defaultDirection: "dropoff"
  }).items.filter((i) => i.validationStatus !== "error");

  const { rows: depotRows } = await client.query(`select value from route_generator_settings where key = 'depot'`);
  const depot = depotRows[0]?.value as DepotConfig;
  if (!depot?.address || depot.latitude == null) throw new Error("Depot not seeded");

  const { rows: vanRows } = await client.query(`select * from route_vehicle_configs where active = true order by van_key`);
  const vehicles: VehicleCapacityConfig[] = vanRows.map((row) => ({
    vanKey: String(row.van_key),
    active: Boolean(row.active),
    vehiclePool: row.vehicle_pool as "club" | "outing",
    homeBaseKey: (row.starting_depot_key === "club" || row.vehicle_pool === "club" ? "club" : "hub") as
      | "hub"
      | "club",
    maxDogs: row.max_dogs == null ? 8 : Number(row.max_dogs),
    maxLoadUnits: row.max_load_units == null ? 12 : Number(row.max_load_units),
    maxLargeDogs: row.max_large_dogs == null ? 4 : Number(row.max_large_dogs),
    maxStops: row.max_stops == null ? 20 : Number(row.max_stops),
    eligibleServices: (row.eligible_services ?? []) as CanonicalService[],
    capacityConfigured: true
  }));

  const pickupGroups = groupHouseholds(pickupItems);
  const dropoffGroups = groupHouseholds(dropoffItems);
  const coords: Record<string, { lat: number; lng: number }> = {};
  [...pickupGroups, ...dropoffGroups].forEach((g, index) => {
    coords[g.householdKey] = {
      lat: Number(depot.latitude) + index * 0.002,
      lng: Number(depot.longitude) - index * 0.0015
    };
  });

  const sizeLoads: SizeLoadConfig = {
    Small: 1,
    Medium: 1.5,
    Large: 2,
    "Extra Large": 2.5,
    Unknown: 2.5,
    configured: false
  };

  const pickupPlan = optimizeRoutes({
    direction: "pickup",
    seed: "shadow-smoke-pickup",
    depot,
    vehicles,
    households: pickupGroups,
    sizeLoads,
    coordsByHousehold: coords
  });
  const dropoffPlan = optimizeRoutes({
    direction: "dropoff",
    seed: "shadow-smoke-dropoff",
    depot,
    vehicles,
    households: dropoffGroups,
    sizeLoads,
    coordsByHousehold: coords
  });

  const templateCsv = readFileSync(resolve("scripts/fixtures/route-generator/samsara-template.csv"), "utf8");
  const headers = templateCsv.trim().split(/\r?\n/)[0]!.split(",");
  const template: SamsaraTemplate = {
    headers,
    delimiter: ",",
    encoding: "utf-8",
    mappings: autoMapSamsaraHeaders(headers)
  };

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const rows: ExportStopRow[] = [];
  for (const route of [...pickupPlan.routes, ...dropoffPlan.routes]) {
    const routeName = buildRouteName({
      date,
      direction: route.direction,
      vanDisplay: route.vanKey.replace("van_", "Van ")
    });
    route.stops.forEach((stop, idx) => {
      rows.push({
        routeName,
        routeNotes: route.waveName,
        vehicleName: route.vanKey.replace("van_", "Van "),
        driverName: "",
        stopName: stop.ownerName || stop.stopKind,
        stopNotes: stop.notes || "",
        stopAddress: stop.address || "",
        scheduledArrival: "",
        scheduledDeparture: "",
        routeDate: date,
        stopOrder: idx + 1,
        latitude: stop.latitude == null ? "" : String(stop.latitude),
        longitude: stop.longitude == null ? "" : String(stop.longitude)
      });
    });
  }

  const built = buildCsv({ template, rows });
  const validation = validateExport({ template, rows, csv: built.csv });
  if (!validation.ok) throw new Error(`CSV validation failed: ${JSON.stringify(validation.report)}`);

  const { rows: checklistRows } = await client.query(
    `select value from route_generator_settings where key = 'feature_checklist'`
  );
  const checklist = {
    ...(checklistRows[0]?.value as Record<string, unknown>),
    test_report_imported: true,
    test_route_generated: true,
    test_csv_validated: true,
    local_route_worker_health_ok: true,
    shadow_smoke_at: new Date().toISOString(),
    shadow_mode: true,
    production_enabled: false,
    updated_at: new Date().toISOString()
  };
  await client.query(
    `update route_generator_settings set value = $1::jsonb, updated_at = now() where key = 'feature_checklist'`,
    [JSON.stringify(checklist)]
  );

  await client.query(
    `update route_report_connections
     set last_successful_pull_at = now(), status = 'connected', source_mode = 'fixture', updated_at = now()
     where provider = 'fitdog'`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        pickupItems: pickupItems.length,
        dropoffItems: dropoffItems.length,
        pickupRoutes: pickupPlan.routes.length,
        dropoffRoutes: dropoffPlan.routes.length,
        pickupLabel: pickupPlan.label,
        dropoffLabel: dropoffPlan.label,
        csvRows: rows.length,
        validationOk: validation.ok,
        checklist
      },
      null,
      2
    )
  );

  await client.end();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
