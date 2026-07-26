/**
 * Seed Fitdog HUB + CLUB bases and assign van home bases.
 * HUB (outing, 3 vans): 2140 Westwood Blvd, West Los Angeles, CA 90025
 * CLUB (club pool, 2 vans): 1712 21st St, Santa Monica, CA 90404
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

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password?.trim()) throw new Error("Missing SUPABASE_DB_PASSWORD");

  const hubAddress = DEFAULT_FITDOG_LOCATIONS.hub.address;
  const clubAddress = DEFAULT_FITDOG_LOCATIONS.club.address;

  console.log("Geocoding HUB…", hubAddress);
  const hubGeo = await geocodeNominatim(hubAddress);
  await new Promise((r) => setTimeout(r, 1100));
  console.log("Geocoding CLUB…", clubAddress);
  const clubGeo = await geocodeNominatim(clubAddress);

  const locations = {
    hub: {
      ...DEFAULT_FITDOG_LOCATIONS.hub,
      latitude: hubGeo.latitude,
      longitude: hubGeo.longitude,
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: hubGeo.displayName
    },
    club: {
      ...DEFAULT_FITDOG_LOCATIONS.club,
      latitude: clubGeo.latitude,
      longitude: clubGeo.longitude,
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: "ops-update-agent",
      geocode_display_name: clubGeo.displayName
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

  // Keep legacy depot aligned to CLUB (primary facility contact).
  await client.query(
    `insert into route_generator_settings (key, value)
     values ('depot', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({
        name: "CLUB",
        address: clubAddress,
        latitude: clubGeo.latitude,
        longitude: clubGeo.longitude,
        geofence_radius_m: 100,
        timezone: "America/Los_Angeles",
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: "ops-update-agent",
        note: "CLUB — hotel, daycare, training, and grooming center."
      })
    ]
  );

  // Club pool → CLUB (2 vans). Outing pool → HUB (3 vans).
  await client.query(
    `update route_vehicle_configs
     set starting_depot_key = case when vehicle_pool = 'club' then 'club' else 'hub' end,
         ending_depot_key = case when vehicle_pool = 'club' then 'club' else 'hub' end,
         notes = case
           when vehicle_pool = 'club' then 'Starts/ends at CLUB (1712 21st St, Santa Monica).'
           else 'Starts/ends at HUB (2140 Westwood Blvd, West Los Angeles).'
         end,
         updated_at = now()`
  );

  const { rows: checklistRows } = await client.query(
    `select value from route_generator_settings where key='feature_checklist'`
  );
  const checklist = {
    ...((checklistRows[0]?.value as Record<string, unknown>) ?? {}),
    depot_address_seeded: true,
    depot_verified_by_super_admin: true,
    hub_club_bases_configured: true,
    hub_address: hubAddress,
    club_address: clubAddress
  };
  await client.query(
    `update route_generator_settings set value=$1::jsonb, updated_at=now() where key='feature_checklist'`,
    [JSON.stringify(checklist)]
  );

  await client.query(
    `insert into route_audit_events (action, entity_type, actor_email, actor_role, new_value, reason)
     values
       ('route_generator.settings_changed', 'locations', 'ops-update-agent', 'super_admin', $1::jsonb, 'HUB + CLUB bases configured'),
       ('route_generator.vehicle_capacity_changed', 'route_vehicle_configs', 'ops-update-agent', 'super_admin', '{"home_bases":"hub_for_outing_club_for_club"}'::jsonb, 'Assigned van start/end bases')`,
    [JSON.stringify({ hub: locations.hub, club: locations.club })]
  );

  const { rows: vans } = await client.query(
    `select van_key, vehicle_pool, starting_depot_key, ending_depot_key from route_vehicle_configs order by van_key`
  );

  await client.end();
  console.log(
    JSON.stringify(
      {
        ok: true,
        locations: {
          hub: { address: hubAddress, ...hubGeo },
          club: { address: clubAddress, ...clubGeo }
        },
        vans
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
