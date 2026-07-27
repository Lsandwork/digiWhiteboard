/**
 * Verify Samsara API token + van matching for Fitdog live GPS.
 *
 * Usage:
 *   export SAMSARA_API_TOKEN='samsara_api_...'
 *   npx tsx scripts/verify-samsara-setup.ts
 */
import { loadEnvFiles } from "./load-env-local";
import {
  fetchSamsaraFleetVehicles,
  fetchSamsaraVehicleLocations,
  isSamsaraLiveConfigured,
  matchVehicleByName,
  normalizeSamsaraVanLabel
} from "../lib/route-generator/samsara-live";
import { FITDOG_SAMSARA_VANS } from "../lib/route-generator/samsara-vans";

loadEnvFiles();

function fail(message: string, extra?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, error: message, ...extra }, null, 2));
  process.exit(1);
}

async function fetchOrg(token: string): Promise<{ id: string; name: string } | null> {
  const response = await fetch("https://api.samsara.com/me", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { id?: string | number; name?: string } };
  if (!body.data?.id) return null;
  return { id: String(body.data.id), name: String(body.data.name || "") };
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

  const org = await fetchOrg(token);

  let fleet: Awaited<ReturnType<typeof fetchSamsaraFleetVehicles>> = [];
  try {
    fleet = await fetchSamsaraFleetVehicles();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), { org });
  }

  let locations: Awaited<ReturnType<typeof fetchSamsaraVehicleLocations>> = [];
  let locationsError: string | null = null;
  try {
    locations = await fetchSamsaraVehicleLocations();
  } catch (error) {
    locationsError = error instanceof Error ? error.message : String(error);
  }

  const matches = FITDOG_SAMSARA_VANS.map((van) => {
    const fleetByVin = van.vin
      ? fleet.find((f) => String(f.vin || "").toUpperCase() === van.vin!.toUpperCase())
      : undefined;
    const fleetBySerial = van.samsaraSerial
      ? fleet.find((f) => String(f.serial || "").toUpperCase() === van.samsaraSerial!.toUpperCase())
      : undefined;
    const fleetByName = fleet.find(
      (f) => normalizeSamsaraVanLabel(f.name) === normalizeSamsaraVanLabel(van.samsaraVehicleName)
    );
    const fleetMatch = fleetByVin || fleetBySerial || fleetByName;
    const gps = matchVehicleByName(locations, van.samsaraVehicleName, van.samsaraSerial, {
      vin: van.vin,
      licensePlate: van.licensePlate
    });
    return {
      vanKey: van.vanKey,
      expectedName: van.samsaraVehicleName,
      expectedSerial: van.samsaraSerial,
      expectedVin: van.vin,
      expectedPlate: van.licensePlate,
      makeModel: van.makeModel,
      fleetMatch: fleetMatch
        ? {
            id: fleetMatch.id,
            name: fleetMatch.name,
            serial: fleetMatch.serial,
            vin: fleetMatch.vin,
            licensePlate: fleetMatch.licensePlate,
            via: fleetByVin ? "vin" : fleetBySerial ? "serial" : "name"
          }
        : null,
      gpsMatch: gps
        ? {
            id: gps.id,
            name: gps.name,
            serial: gps.serial ?? null,
            vin: gps.vin ?? null,
            latitude: gps.latitude,
            longitude: gps.longitude,
            time: gps.time
          }
        : null,
      nameLooksCorrectInUi: true
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
    org,
    tokenConfigured: true,
    fleetVehicleCount: fleet.length,
    gpsVehicleCount: locations.length,
    locationsError,
    screenshotNamesConfirmed: [
      "Van 01 (2018 Ford Transit Connect)",
      "Van 02 (2018 Ford Transit Connect · VIN NM0LS7E74J1371466 · plate 38516L2)",
      "Van 03 (2018 Ford Transit Connect)",
      "Van 05 (2018 Nissan NV200 · VIN 3N6CM0KN6JK701997 · plate 69357N2)",
      "Van 06 (2021 Nissan NV200 · VIN 3N6CM0KN3MK705283)"
    ],
    vans: matches,
    missingInFleet: missingFleet.map((m) => m.vanKey),
    missingGps: missingGps.map((m) => m.vanKey),
    fleetSample: fleet.slice(0, 20).map((v) => ({
      id: v.id,
      name: v.name,
      serial: v.serial,
      vin: v.vin,
      licensePlate: v.licensePlate,
      normalized: normalizeSamsaraVanLabel(v.name)
    })),
    nextSteps: [] as string[]
  };

  if (fleet.length === 0) {
    result.nextSteps.push(
      "BLOCKER: Token authenticates to Fitdog but returns ZERO vehicles/drivers. In cloud.samsara.com → Settings → API Tokens → Edit this token → set Tag Access to Entire Organization (not a tag). Keep Read Vehicles + Read Vehicle Statistics. Save, then re-run npm run verify:samsara."
    );
    result.nextSteps.push(
      "Vehicle names in the Samsara UI are already correct (Van 01/02/03/05/06 from screenshots). Do not rename them — fix token tag access."
    );
  }
  if (missingFleet.length > 0 && fleet.length > 0) {
    result.nextSteps.push(
      `Fleet visible but missing expected vans: ${missingFleet.map((m) => m.expectedName).join(", ")}. Rename in Samsara or update lib/route-generator/samsara-vans.ts.`
    );
  }
  if (locationsError) {
    result.nextSteps.push(`GPS stats call failed: ${locationsError}. Token needs Read Vehicle Statistics.`);
  } else if (fleet.length > 0 && locations.length === 0) {
    result.nextSteps.push(
      "Fleet vehicles visible but no GPS stats. Confirm gateways are online and token has Read Vehicle Statistics."
    );
  }
  if (ok) {
    result.nextSteps.push(
      "API looks good. Push token to Vercel: export VERCEL_TOKEN=... SAMSARA_API_TOKEN=... && ./scripts/push-samsara-vercel-env.sh"
    );
    result.nextSteps.push("Apply migration 049_samsara_van_identity.sql if not already applied.");
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(ok ? 0 : 1);
}

void main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
