import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

/**
 * PGRST002 means PostgREST could not build its schema cache. The two causes are
 * an exposed schema that no longer exists, or no free connection to load it.
 * This checks both, then nudges a reload.
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
    connectionTimeoutMillis: 25_000,
    statement_timeout: 40_000
  });
  await client.connect();

  const schemas = await client.query<{ nspname: string }>(
    `select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by nspname`
  );
  console.log(`schemas present: ${schemas.rows.map((row) => row.nspname).join(", ")}`);

  const counts = await client.query<{ label: string; value: string }>(
    `select 'public tables' as label, count(*)::text as value from pg_tables where schemaname = 'public'
     union all select 'public views', count(*)::text from pg_views where schemaname = 'public'
     union all select 'public functions', count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     union all select 'public columns', count(*)::text from information_schema.columns where table_schema = 'public'
     union all select 'database size', pg_size_pretty(pg_database_size(current_database()))
     union all select 'connections', count(*)::text from pg_stat_activity`
  );
  for (const row of counts.rows) console.log(`${row.label}: ${row.value}`);

  const roles = await client.query<{ rolname: string; config: string[] | null }>(
    `select rolname, rolconfig as config from pg_roles
      where rolname in ('authenticator', 'anon', 'authenticated', 'service_role') order by rolname`
  );
  console.log("--- role settings ---");
  for (const row of roles.rows) console.log(`  ${row.rolname}: ${row.config?.join(", ") ?? "(none)"}`);

  const stuck = await client.query<{ usename: string | null; state: string | null; secs: string; query: string }>(
    `select usename, state,
            round(extract(epoch from (now() - coalesce(query_start, xact_start))))::text as secs,
            left(regexp_replace(query, '\\s+', ' ', 'g'), 90) as query
       from pg_stat_activity
      where pid <> pg_backend_pid()
        and state is not null
        and now() - coalesce(query_start, xact_start) > interval '5 seconds'
      order by 3 desc limit 10`
  );
  console.log(`--- backends busy >5s: ${stuck.rowCount ?? 0} ---`);
  for (const row of stuck.rows) console.log(`  ${row.secs}s ${row.usename}/${row.state} :: ${row.query}`);

  await client.query("select pg_notify('pgrst', 'reload schema')");
  await client.query("select pg_notify('pgrst', 'reload config')");
  console.log("sent PostgREST reload schema + config");

  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
