import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

/**
 * Server-side breakdown of the shared admin_settings.settings blob. Runs the
 * sizing in Postgres so we never transfer the whole document just to measure it.
 */
function directUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("missing SUPABASE_DB_PASSWORD");
  return `postgresql://postgres:${encodeURIComponent(password)}@db.tzkocaucqtmmnrttxira.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvFiles();
  const client = new Client({
    connectionString: directUrl(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    statement_timeout: 30_000
  });
  await client.connect();

  const keys = await client.query<{ key: string; kib: string; rows: string }>(
    `select key,
            round(length(value::text) / 1024.0, 1)::text as kib,
            case when jsonb_typeof(value) = 'array' then jsonb_array_length(value)::text else '-' end as rows
       from admin_settings, jsonb_each(settings)
      where id = 'default'
      order by length(value::text) desc
      limit 20`
  );
  console.log("--- top-level keys in admin_settings.settings ---");
  for (const row of keys.rows) console.log(`  ${row.key}: ${row.kib} KiB (array len ${row.rows})`);

  const staffOps = await client.query<{ key: string; kib: string; rows: string }>(
    `select key,
            round(length(value::text) / 1024.0, 1)::text as kib,
            case when jsonb_typeof(value) = 'array' then jsonb_array_length(value)::text else '-' end as rows
       from admin_settings, jsonb_each(settings -> 'staff_admin_ops')
      where id = 'default'
      order by length(value::text) desc`
  );
  console.log("--- inside staff_admin_ops (Team Log) ---");
  for (const row of staffOps.rows) console.log(`  ${row.key}: ${row.kib} KiB (array len ${row.rows})`);

  const total = await client.query<{ kib: string }>(
    `select round(length(settings::text) / 1024.0, 1)::text as kib from admin_settings where id = 'default'`
  );
  console.log(`total: ${total.rows[0]?.kib} KiB`);

  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
