import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

/**
 * When REST calls hang but the Supabase host answers instantly, the database is
 * usually out of connections. This reports connection counts, longest-running
 * statements, and blocking locks. Prints aggregates only — no row data.
 */
/**
 * Use the direct host: when connections are exhausted the pooler itself cannot
 * authenticate, so the pooler URL is useless for diagnosis.
 */
function databaseUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("need SUPABASE_DB_PASSWORD");
  return `postgresql://postgres:${encodeURIComponent(password)}@db.tzkocaucqtmmnrttxira.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvFiles();
  const client = new Client({
    connectionString: databaseUrl(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    statement_timeout: 15_000
  });

  const startedAt = Date.now();
  await client.connect();
  console.log(`connected in ${Date.now() - startedAt}ms`);

  const settings = await client.query<{ name: string; setting: string }>(
    "select name, setting from pg_settings where name in ('max_connections','superuser_reserved_connections')"
  );
  for (const row of settings.rows) console.log(`${row.name} = ${row.setting}`);

  const byState = await client.query<{ state: string | null; usename: string | null; count: string }>(
    "select state, usename, count(*)::text as count from pg_stat_activity group by state, usename order by count(*) desc"
  );
  console.log("--- connections by state/user ---");
  for (const row of byState.rows) console.log(`  ${row.usename ?? "?"} / ${row.state ?? "null"}: ${row.count}`);

  const longest = await client.query<{ state: string | null; wait: string | null; secs: string; query: string }>(
    `select state,
            coalesce(wait_event_type || ':' || wait_event, 'none') as wait,
            round(extract(epoch from (now() - coalesce(query_start, xact_start, backend_start))))::text as secs,
            left(regexp_replace(query, '\\s+', ' ', 'g'), 120) as query
       from pg_stat_activity
      where pid <> pg_backend_pid() and state is not null
      order by coalesce(query_start, xact_start, backend_start) asc
      limit 15`
  );
  console.log("--- oldest active backends ---");
  for (const row of longest.rows) {
    console.log(`  ${row.secs}s ${row.state} wait=${row.wait} :: ${row.query}`);
  }

  const idleInTx = await client.query<{ count: string }>(
    "select count(*)::text as count from pg_stat_activity where state = 'idle in transaction'"
  );
  console.log(`idle in transaction: ${idleInTx.rows[0]?.count ?? "0"}`);

  const blocked = await client.query<{ count: string }>(
    "select count(*)::text as count from pg_stat_activity where cardinality(pg_blocking_pids(pid)) > 0"
  );
  console.log(`blocked backends: ${blocked.rows[0]?.count ?? "0"}`);

  const tableSize = await client.query<{ size: string; blob: string }>(
    `select pg_size_pretty(pg_total_relation_size('admin_settings')) as size,
            pg_size_pretty(sum(pg_column_size(settings))::bigint) as blob
       from admin_settings`
  );
  console.log(`admin_settings table: ${tableSize.rows[0]?.size}, settings column total: ${tableSize.rows[0]?.blob}`);

  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
