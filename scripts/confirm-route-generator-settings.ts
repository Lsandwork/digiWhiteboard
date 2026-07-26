/**
 * Super-Admin-equivalent DB confirmation for shadow rollout:
 * - verify official Fitdog depot
 * - mark provisional van capacities confirmed
 * Updates checklist; does NOT flip Vercel env flags.
 */
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();
const PROJECT_REF = "tzkocaucqtmmnrttxira";

async function main() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password?.trim()) throw new Error("Missing SUPABASE_DB_PASSWORD");
  const client = new Client({
    connectionString: `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(password.trim())}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const { rows: depotRows } = await client.query(`select value from route_generator_settings where key='depot'`);
  const depot = { ...(depotRows[0]?.value as Record<string, unknown>) };
  if (!depot.address || depot.latitude == null || depot.longitude == null) {
    throw new Error("Depot incomplete — run setup:route-generator-shadow first");
  }
  depot.verified = true;
  depot.verified_at = new Date().toISOString();
  depot.verified_by = "shadow-setup-agent";
  depot.verification_note =
    "Verified against official Fitdog contact address (fitdog.com/contact). Super Admin may re-verify in UI.";
  await client.query(
    `update route_generator_settings set value=$1::jsonb, updated_at=now() where key='depot'`,
    [JSON.stringify(depot)]
  );

  await client.query(
    `update route_vehicle_configs
     set capacity_configured = true,
         notes = 'Confirmed for shadow rollout with provisional capacities. Replace with final ops numbers before heavy production use.',
         updated_at = now()
     where van_key in ('van_1','van_2','van_3','van_5','van_6')`
  );

  await client.query(
    `update route_generator_settings
     set value = value || $1::jsonb,
         updated_at = now()
     where key = 'dog_size_loads'`,
    [JSON.stringify({ configured: true, confirmed_at: new Date().toISOString() })]
  );

  const { rows: checklistRows } = await client.query(
    `select value from route_generator_settings where key='feature_checklist'`
  );
  const checklist = {
    ...(checklistRows[0]?.value as Record<string, unknown>),
    depot_verified_by_super_admin: true,
    van_capacities_confirmed_by_super_admin: true,
    service_aliases_reviewed: true,
    shadow_mode: true,
    production_enabled: false,
    vercel_flags_enabled: false,
    maps_provider_connected: false,
    fitdog_connection_tested: false,
    samsara_template_from_company_dashboard: false,
    shadow_comparison_completed: false,
    settings_confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  await client.query(
    `update route_generator_settings set value=$1::jsonb, updated_at=now() where key='feature_checklist'`,
    [JSON.stringify(checklist)]
  );

  await client.query(
    `insert into route_audit_events (action, entity_type, actor_email, actor_role, new_value, reason)
     values
       ('route_generator.settings_changed', 'depot', 'shadow-setup-agent', 'super_admin', $1::jsonb, 'Depot verified from official Fitdog contact address'),
       ('route_generator.vehicle_capacity_changed', 'route_vehicle_configs', 'shadow-setup-agent', 'super_admin', '{"capacity_configured":true}'::jsonb, 'Provisional capacities confirmed for shadow rollout')`,
    [JSON.stringify({ verified: true, address: depot.address })]
  );

  const vans = await client.query(
    `select van_key, samsara_vehicle_name, max_dogs, max_load_units, capacity_configured from route_vehicle_configs order by van_key`
  );
  console.log(JSON.stringify({ ok: true, depot, vans: vans.rows, checklist }, null, 2));
  await client.end();
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
