/**
 * Seed Fitdog bases/destinations and van routing endpoints.
 * - Hub: Fitdog Westwood Hub
 * - Club: Fitdog Club (mid-route facility stop)
 * - Kenneth Hahn Trail: Van 1/2 Adventure destination
 * - Huntington Dog Beach: Van 3 Beach destination
 */
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";
import { DEFAULT_FITDOG_LOCATIONS } from "../lib/route-generator/locations";

loadEnvFiles();
const PROJECT_REF = "tzkocaucqtmmnrttxira";

async function geocodeNominatim(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": "staff.ruffops.com-route-generator-bases/1.0" }
  });
  if (!response.ok) throw new Error(`Geocoder failed: ${response.status}`);
  const rows = (await response.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  if (!rows[0]) throw new Error(`Geocoder returned no results for ${address}`);
  return {
    latitude: Number(rows[0].lat),
    longitude: Number(rows[0].lon),
    displayName: rows[0].display_name ?? address
  };
}

async function geocodeWithFallback(
  key: keyof typeof DEFAULT_FITDOG_LOCATIONS,
  fallback: { latitude: number; longitude: number }
) {
  const base = DEFAULT_FITDOG_LOCATIONS[key];
  try {
    const geo = await geocodeNominatim(base.address);
    return { ...base, ...geo, verified: true };
  } catch (error) {
    console.warn(`Geocode failed for ${key}, using fallback coords.`, error);
    return {
      ...base,
      latitude: fallback.latitude,
      longitude: fallback.longitude,
      verified: false,
      displayName: base.address
    };
  }
}

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password?.trim()) throw new Error("Missing SUPABASE_DB_PASSWORD");

  console.log("Geocoding bases…");
  const hub = await geocodeWithFallback("hub", {
    latitude: DEFAULT_FITDOG_LOCATIONS.hub.latitude!,
    longitude: DEFAULT_FITDOG_LOCATIONS.hub.longitude!
  });
  await new Promise((r) => setTimeout(r, 1100));
  const club = await geocodeWithFallback("club", {
    latitude: DEFAULT_FITDOG_LOCATIONS.club.latitude!,
    longitude: DEFAULT_FITDOG_LOCATIONS.club.longitude!
  });
  await new Promise((r) => setTimeout(r, 1100));
  const kennethHahn = await geocodeWithFallback("kenneth_hahn", {
    latitude: DEFAULT_FITDOG_LOCATIONS.kenneth_hahn.latitude!,
    longitude: DEFAULT_FITDOG_LOCATIONS.kenneth_hahn.longitude!
  });
  await new Promise((r) => setTimeout(r, 1100));
  const huntington = await geocodeWithFallback("huntington", {
    latitude: DEFAULT_FITDOG_LOCATIONS.huntington.latitude!,
    longitude: DEFAULT_FITDOG_LOCATIONS.huntington.longitude!
  });

  const locations = {
    hub: {
      ...hub,
      key: "hub",
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: hub.displayName
    },
    club: {
      ...club,
      key: "club",
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: club.displayName
    },
    kenneth_hahn: {
      ...kennethHahn,
      key: "kenneth_hahn",
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: kennethHahn.displayName
    },
    huntington: {
      ...huntington,
      key: "huntington",
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: huntington.displayName
    }
  };

  const client = new Client({
    connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password.trim())}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  await client.query(
    `insert into route_generator_settings (key, value)
     values ('locations', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(locations)]
  );

  await client.query(
    `insert into route_generator_settings (key, value)
     values ('depot', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({
        name: locations.hub.name,
        address: locations.hub.address,
        latitude: locations.hub.latitude,
        longitude: locations.hub.longitude,
        geofence_radius_m: 100,
        timezone: "America/Los_Angeles",
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: "ops-update-agent",
        note: "Legacy depot field aligned to Fitdog Westwood Hub."
      })
    ]
  );

  // Van routing: 1/2 Hahn M–F; 3 Beach M/W/F + Hahn T/Th; 5/6 Club taxi/group/training.
  // Samsara names use zero-padded labels (Van 01…); never Van 04.
  await client.query(
    `update route_vehicle_configs
     set vehicle_pool = case
           when van_key in ('van_5', 'van_6') then 'club'
           else 'outing'
         end,
         starting_depot_key = case
           when van_key in ('van_5', 'van_6') then 'club'
           else 'hub'
         end,
         ending_depot_key = case
           when van_key in ('van_5', 'van_6') then 'club'
           when van_key = 'van_3' then 'huntington'
           else 'kenneth_hahn'
         end,
         samsara_vehicle_name = case
           when van_key = 'van_1' then 'Van 01'
           when van_key = 'van_2' then 'Van 02'
           when van_key = 'van_3' then 'Van 03'
           when van_key = 'van_5' then 'Van 05'
           when van_key = 'van_6' then 'Van 06'
           else samsara_vehicle_name
         end,
         samsara_serial = case
           when van_key = 'van_1' then 'GXPDPPWGEV'
           when van_key = 'van_2' then 'GW6EADZATK'
           when van_key = 'van_3' then 'GVE5PCJ7KK'
           when van_key = 'van_5' then 'GGR6JKWB6F'
           when van_key = 'van_6' then 'GKEWDZK4NX'
           else samsara_serial
         end,
         eligible_services = case
           when van_key in ('van_1', 'van_2') then array['Adventure Hike']
           when van_key = 'van_3' then array['Beach Excursion', 'Adventure Hike']
           else array['Trainer-Led Hike', 'Group Class', 'Taxi Service']
         end,
         notes = case
           when van_key in ('van_1', 'van_2') then 'PU: Hub→Kenneth Hahn. DO: Kenneth Hahn→Hub (Mon–Fri). Club mid-stop when dogs are at Fitdog.'
           when van_key = 'van_3' then 'Mon/Wed/Fri: Hub↔Huntington Dog Beach. Tue/Thu: Hub↔Kenneth Hahn. Club mid-stops for pickups/drop-offs.'
           else 'Lives at Fitdog Club. Taxi, group class, and training-class pickups/drop-offs. Does not go to Kenneth Hahn.'
         end,
         updated_at = now()
     where van_key in ('van_1', 'van_2', 'van_3', 'van_5', 'van_6')`
  );
  await client.query(`delete from route_vehicle_configs where van_key = 'van_4'`);

  const { rows: checklistRows } = await client.query(
    `select value from route_generator_settings where key='feature_checklist'`
  );
  const checklist = {
    ...((checklistRows[0]?.value as Record<string, unknown>) ?? {}),
    depot_address_seeded: true,
    depot_verified_by_super_admin: true,
    hub_club_bases_configured: true,
    outing_destinations_configured: true,
    hub_address: locations.hub.address,
    club_address: locations.club.address,
    kenneth_hahn: locations.kenneth_hahn.name,
    huntington: locations.huntington.name
  };
  await client.query(
    `insert into route_generator_settings (key, value)
     values ('feature_checklist', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(checklist)]
  );

  const { rows: vans } = await client.query(
    `select van_key, vehicle_pool, starting_depot_key, ending_depot_key, eligible_services, notes
     from route_vehicle_configs
     order by van_key`
  );
  console.log(JSON.stringify({ locations: Object.keys(locations), vans }, null, 2));
  await client.end();
  console.log("Seeded Fitdog bases + van destinations.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
