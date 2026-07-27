/**
 * Verify Samsara API token + van matching for Fitdog live GPS.
 *
 * Usage:
 *   export SAMSARA_API_TOKEN='samsara_api_...'
 *   npx tsx scripts/verify-samsara-setup.ts
 *
 * Optional: SUPABASE_DB_PASSWORD to compare against route_vehicle_configs.
 */
import { loadEnvFiles } from "./load-env-local";
import {
  fetchSamsaraVehicleLocations,
  isSamsaraLiveConfigured,
  matchVehicleByName,
  normalizeSamsaraVanLabel
} from "../lib/route-generator/samsara-live";

loadEnvFiles();

const EXPECTED_VANS = [
  { vanKey: "van_1", name: "Van 01", serial: "GXPD-PPW-GEV" },
  { vanKey: "van_2", name: "Van 02", serial: "GW6E-ADZ-ATK" },
  { vanKey: "van_3", name: "Van 03", serial: "GVE5-PCJ-7KK" },
  { vanKey: "van_5", name: "Van 05", serial: "GGR6-JKW-B6F" },
  { vanKey: "van_6", name: "Van 06", serial: "GKEW-DZK-4NX" }
] as const;

const PROJECT_REF = "tzkocaucqtmmnrttxira";

type FleetVehicle = {
  id: string;
  name: string;
  serial: string | null;
};

async function fetchFleetVehicles(token: string): Promise<FleetVehicle[]> {
  const response = await fetch("https://api.samsara.com/fleet/vehicles", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`fleet/vehicles failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const body = (await response.json()) as {
    data?: Array<{
      id?: string | number;
      name?: string;
      externalIds?: Record<string, string>;
      gateway?: { serial?: string };
    }>;
  };
  return (body.data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name || "").trim(),
    serial: row.externalIds?.["samsara.serial"] || row.gateway?.serial || null
  }));
}

async function loadDbConfigs(): Promise<
  Array<{ van_key: string; samsara_vehicle_name: string | null; samsara_serial: string | null }>
> {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return [];
  try {
    const { Client } = await import("pg");
    const client = new Client({
      connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    try {
      const { rows } = await client.query(
        `select van_key, samsara_vehicle_name, samsara_serial
         from route_vehicle_configs
         where van_key in ('van_1','van_2','van_3','van_5','van_6')
         order by van_key`
      );
      return rows;
    } finally {
      await client.end();
    }
  } catch {
    // Optional: script still works against hardcoded expected vans.
    return [];
  }
}

function fail(message: string): never {
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exit(1);
}

async function main() {
  if (!isSamsaraLiveConfigured()) {
    fail(
      "SAMSARA_API_TOKEN is not set. Create a token in cloud.samsara.com → Settings → API Tokens, then: export SAMSARA_API_TOKEN=..."
    );
  }

  const token =
    process.env.SAMSARA_API_TOKEN?.trim() ||
    process.env.SAMSARA_API_KEY?.trim() ||
    process.env.SAMSARA_BEARER_TOKEN?.trim() ||
    "";

  let fleet: FleetVehicle[] = [];
  try {
    fleet = await fetchFleetVehicles(token);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  let locations: Awaited<ReturnType<typeof fetchSamsaraVehicleLocations>> = [];
  let locationsError: string | null = null;
  try {
    locations = await fetchSamsaraVehicleLocations();
  } catch (error) {
    locationsError = error instanceof Error ? error.message : String(error);
  }

  const dbConfigs = await loadDbConfigs();
  const expected =
    dbConfigs.length > 0
      ? dbConfigs.map((row) => ({
          vanKey: String(row.van_key),
          name: String(row.samsara_vehicle_name || ""),
          serial: String(row.samsara_serial || "")
        }))
      : EXPECTED_VANS.map((v) => ({ vanKey: v.vanKey, name: v.name, serial: v.serial }));

  const matches = expected.map((van) => {
    const bySerial = van.serial
      ? fleet.find((f) => String(f.serial || "").toUpperCase() === van.serial.toUpperCase())
      : undefined;
    const byName = fleet.find(
      (f) => normalizeSamsaraVanLabel(f.name) === normalizeSamsaraVanLabel(van.name)
    );
    const gps = matchVehicleByName(locations, van.name, van.serial);
    return {
      vanKey: van.vanKey,
      expectedName: van.name,
      expectedSerial: van.serial || null,
      fleetMatch: bySerial
        ? { id: bySerial.id, name: bySerial.name, serial: bySerial.serial, via: "serial" }
        : byName
          ? { id: byName.id, name: byName.name, serial: byName.serial, via: "name" }
          : null,
      gpsMatch: gps
        ? {
            id: gps.id,
            name: gps.name,
            serial: gps.serial ?? null,
            latitude: gps.latitude,
            longitude: gps.longitude,
            time: gps.time
          }
        : null
    };
  });

  const missingFleet = matches.filter((m) => !m.fleetMatch);
  const missingGps = matches.filter((m) => !m.gpsMatch);
  const ok =
    fleet.length > 0 &&
    missingFleet.length === 0 &&
    !locationsError &&
    missingGps.length === 0;

  const result = {
    ok,
    tokenConfigured: true,
    fleetVehicleCount: fleet.length,
    gpsVehicleCount: locations.length,
    locationsError,
    vans: matches,
    missingInFleet: missingFleet.map((m) => m.vanKey),
    missingGps: missingGps.map((m) => m.vanKey),
    fleetSample: fleet.slice(0, 20).map((v) => ({
      id: v.id,
      name: v.name,
      serial: v.serial,
      normalized: normalizeSamsaraVanLabel(v.name)
    })),
    nextSteps: [] as string[]
  };

  if (fleet.length === 0) {
    result.nextSteps.push(
      "Token authenticates but returns zero vehicles. In Samsara: grant Read Vehicles, and set tag access to the entire organization (not a tag that excludes vans)."
    );
  }
  if (missingFleet.length > 0) {
    result.nextSteps.push(
      `Rename/match vans in Samsara to Van 01/02/03/05/06 (or update route_vehicle_configs). Missing: ${missingFleet.map((m) => m.expectedName).join(", ")}`
    );
  }
  if (locationsError) {
    result.nextSteps.push(
      `GPS stats call failed: ${locationsError}. Token needs Read Vehicle Statistics.`
    );
  } else if (fleet.length > 0 && locations.length === 0) {
    result.nextSteps.push(
      "Fleet vehicles visible but no GPS stats. Confirm gateways are online and token has Read Vehicle Statistics."
    );
  }
  if (ok) {
    result.nextSteps.push(
      "API looks good. Push token to Vercel: export VERCEL_TOKEN=... SAMSARA_API_TOKEN=... && ./scripts/push-samsara-vercel-env.sh"
    );
    result.nextSteps.push(
      "Keep ENABLE_ROUTE_GENERATOR_FLAGS unset/false until Fitdog MFA + shadow checklist are done (token-only push is the default)."
    );
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
