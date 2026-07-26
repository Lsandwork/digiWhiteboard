/**
 * Shadow-mode setup for Route Generator after migration 045.
 * Applies official Fitdog public depot address, provisional van capacities
 * (capacity_configured stays false until Super Admin confirms), service aliases,
 * Fitdog connection scaffolding, and Samsara template fixture upload.
 *
 * Does NOT enable production flags. Does NOT invent final production capacities.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

const PROJECT_REF = "tzkocaucqtmmnrttxira";

function databaseUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (!password?.trim()) throw new Error("Missing SUPABASE_DB_PASSWORD");
  const user = `postgres.${PROJECT_REF}`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password.trim())}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}

async function geocodeNominatim(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url, {
    headers: {
      "User-Agent": "staff.ruffops.com-route-generator-setup/1.0",
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`);
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
  if (!rows[0]) throw new Error("Geocoder returned no results for depot address");
  return {
    latitude: Number(rows[0].lat),
    longitude: Number(rows[0].lon),
    displayName: rows[0].display_name || address
  };
}

async function main() {
  const client = new Client({ connectionString: databaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const depotAddress = "1712 21st Street, Santa Monica, CA 90404";
  console.log("Geocoding Fitdog public depot address…");
  const geo = await geocodeNominatim(depotAddress);
  console.log(`Depot coords: ${geo.latitude}, ${geo.longitude}`);

  // Depot: official public address. verified=false until Super Admin confirms in UI.
  await client.query(
    `insert into route_generator_settings (key, value)
     values ('depot', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({
        name: "Fitdog Santa Monica",
        address: depotAddress,
        latitude: geo.latitude,
        longitude: geo.longitude,
        geofence_radius_m: 100,
        timezone: "America/Los_Angeles",
        verified: false,
        source: "public_fitdog_com_contact",
        note: "Shadow setup from official Fitdog contact page. Super Admin must verify before production exports."
      })
    ]
  );

  // Provisional shadow capacities — NOT marked configured for production.
  // Values are conservative placeholders for shadow-mode dry runs only.
  const provisional = [
    { key: "van_1", pool: "club", dogs: 8, load: 10, large: 3, duration: 180, stops: 12, samsara: "Van 1" },
    { key: "van_2", pool: "club", dogs: 8, load: 10, large: 3, duration: 180, stops: 12, samsara: "Van 2" },
    { key: "van_3", pool: "outing", dogs: 10, load: 12, large: 4, duration: 240, stops: 14, samsara: "Van 3" },
    { key: "van_5", pool: "outing", dogs: 10, load: 12, large: 4, duration: 240, stops: 14, samsara: "Van 5" },
    { key: "van_6", pool: "outing", dogs: 10, load: 12, large: 4, duration: 240, stops: 14, samsara: "Van 6" }
  ];

  for (const van of provisional) {
    await client.query(
      `update route_vehicle_configs set
         samsara_vehicle_name = $2,
         max_dogs = $3,
         max_load_units = $4,
         max_large_dogs = $5,
         max_route_duration_minutes = $6,
         max_stops = $7,
         operational_start_time = '06:30',
         operational_end_time = '20:00',
         notes = 'Shadow provisional capacities — Super Admin must confirm before capacity_configured=true',
         capacity_configured = false,
         updated_at = now()
       where van_key = $1`,
      [van.key, van.samsara, van.dogs, van.load, van.large, van.duration, van.stops]
    );
  }

  // Dog size loads — provisional unknowns for shadow, not production-confirmed.
  await client.query(
    `insert into route_generator_settings (key, value)
     values ('dog_size_loads', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({
        Small: 1,
        Medium: 1.5,
        Large: 2,
        "Extra Large": 2.5,
        Unknown: 2.5,
        configured: false,
        note: "Provisional shadow values. Super Admin must confirm."
      })
    ]
  );

  // Extra service aliases
  await client.query(
    `insert into route_service_aliases (alias, canonical_service) values
      ('adventure', 'Adventure Hike'),
      ('beach', 'Beach Excursion'),
      ('hike', 'Trainer-Led Hike'),
      ('tlh', 'Trainer-Led Hike'),
      ('class', 'Group Class'),
      ('group', 'Group Class'),
      ('transport', 'Taxi Service'),
      ('taxi pickup', 'Taxi Service'),
      ('taxi drop off', 'Taxi Service'),
      ('taxi drop-off', 'Taxi Service')
     on conflict (alias) do nothing`
  );

  // Fitdog connection scaffolding — fixture mode for shadow until report selectors/API ready.
  const email = process.env.FITDOG_EMPLOYEE_EMAIL?.trim() || "";
  const masked = email
    ? `${email.slice(0, 2)}***@${email.split("@")[1] || "…"}`
    : null;
  await client.query(
    `update route_report_connections
     set status = 'disconnected',
         source_mode = 'fixture',
         username_masked = coalesce($1, username_masked),
         pickup_report_selector = coalesce(pickup_report_selector, 'Pickup and Drop-Off Routes Report — Pickup'),
         dropoff_report_selector = coalesce(dropoff_report_selector, 'Pickup and Drop-Off Routes Report — Drop-Off'),
         field_mapping = coalesce(nullif(field_mapping, '{}'::jsonb), $2::jsonb),
         last_error = 'Shadow setup: awaiting authorized Fitdog report connection test',
         updated_at = now()
     where provider = 'fitdog'`,
    [
      masked,
      JSON.stringify({
        reservation_id: ["Reservation ID", "reservation_id", "Reservation"],
        dog_name: ["Dog Name", "dog_name", "Dog"],
        owner_name: ["Owner", "Owner Name", "owner_name"],
        service_name: ["Service", "Service Name", "service"],
        address: ["Address", "Pickup Address", "Drop-off Address"],
        phone: ["Phone", "Owner Phone", "Mobile"]
      })
    ]
  );

  // Upload active Samsara template from fixture
  const templateCsv = readFileSync(
    resolve(process.cwd(), "scripts/fixtures/route-generator/samsara-template.csv"),
    "utf8"
  );
  const headerLine = templateCsv.trim().split(/\r?\n/)[0] || "";
  const headers = headerLine.split(",").map((h) => h.trim());
  await client.query(
    `update route_export_templates set active = false where active = true`
  );
  const { rows: templateRows } = await client.query(
    `insert into route_export_templates
       (name, version_number, active, delimiter, encoding, headers, validated, sample_storage_path)
     values
       ('Samsara Bulk Route Upload (fixture)', 1, true, ',', 'utf-8', $1, true, 'scripts/fixtures/route-generator/samsara-template.csv')
     returning id`,
    [headers]
  );
  const templateId = templateRows[0]?.id as string;
  const semanticGuess: Record<string, string> = {
    "route name": "route_name",
    "route notes": "route_notes",
    "assigned vehicle name": "vehicle_name",
    "assigned vehicle": "vehicle_name",
    vehicle: "vehicle_name",
    "assigned driver username": "driver_name",
    "assigned driver": "driver_name",
    driver: "driver_name",
    "stop name": "stop_name",
    notes: "stop_notes",
    "stop notes": "stop_notes",
    "full address": "stop_address",
    "stop address": "stop_address",
    address: "stop_address",
    "scheduled arrival time": "scheduled_arrival",
    "scheduled arrival": "scheduled_arrival",
    "scheduled departure time": "scheduled_departure",
    "scheduled departure": "scheduled_departure",
    "route date": "route_date",
    "stop order": "stop_order",
    latitude: "latitude",
    longitude: "longitude"
  };
  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i]!;
    const mapped = semanticGuess[header.toLowerCase()] || null;
    await client.query(
      `insert into route_export_template_mappings
         (template_id, samsara_column, column_index, mapped_field, required)
       values ($1, $2, $3, $4, $5)
       on conflict (template_id, samsara_column) do update
         set column_index = excluded.column_index,
             mapped_field = excluded.mapped_field`,
      [templateId, header, i, mapped, ["route name", "assigned vehicle", "stop address", "stop order"].includes(header.toLowerCase())]
    );
  }

  // Shadow checklist progress
  await client.query(
    `insert into route_generator_settings (key, value)
     values ('feature_checklist', $1::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [
      JSON.stringify({
        shadow_mode: true,
        production_enabled: false,
        migration_045_applied: true,
        depot_address_seeded: true,
        depot_verified_by_super_admin: false,
        van_provisional_capacities_seeded: true,
        van_capacities_confirmed_by_super_admin: false,
        service_aliases_seeded: true,
        service_aliases_reviewed: false,
        samsara_template_fixture_uploaded: true,
        samsara_template_from_company_dashboard: false,
        maps_provider_connected: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
        fitdog_connection_tested: false,
        test_report_imported: false,
        test_route_generated: false,
        test_csv_validated: false,
        shadow_comparison_completed: false,
        updated_at: new Date().toISOString()
      })
    ]
  );

  // Generate worker secrets to a local gitignored file for operators (never commit).
  const signing = randomBytes(32).toString("hex");
  const callback = randomBytes(32).toString("hex");
  const signingHint = createHash("sha256").update(signing).digest("hex").slice(0, 12);
  const secretsPath = resolve(process.cwd(), ".env.route-worker.local");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    secretsPath,
    [
      "# Generated by scripts/setup-route-generator-shadow.ts — DO NOT COMMIT",
      `ROUTE_WORKER_SIGNING_SECRET=${signing}`,
      `ROUTE_WORKER_CALLBACK_SECRET=${callback}`,
      "ROUTE_WORKER_URL=",
      ""
    ].join("\n"),
    { mode: 0o600 }
  );

  const vans = await client.query(
    `select van_key, samsara_vehicle_name, max_dogs, capacity_configured from route_vehicle_configs order by van_key`
  );
  const checklist = await client.query(
    `select value from route_generator_settings where key = 'feature_checklist'`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        depot: { address: depotAddress, ...geo, verified: false },
        vans: vans.rows,
        checklist: checklist.rows[0]?.value,
        samsaraTemplateId: templateId,
        samsaraHeaders: headers,
        workerSecretsGenerated: {
          note: "Written to .env.route-worker.local (gitignored). Paste into Vercel + worker host.",
          path: secretsPath,
          fingerprint: signingHint
        },
        remaining: [
          "Super Admin verifies depot in Route Generator Settings",
          "Super Admin confirms van capacities (set capacity_configured=true)",
          "Add GOOGLE_MAPS_API_KEY to Vercel",
          "Deploy services/route-worker and set ROUTE_WORKER_URL",
          "Connect real Fitdog report selectors / API",
          "Replace Samsara template with current company dashboard sample",
          "Complete shadow-mode comparison before enabling production flags"
        ]
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
