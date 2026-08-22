import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

/**
 * Recovery for the connection-exhaustion failure mode: giant admin_settings
 * reads run for tens of seconds, callers abort, and the Postgres backends keep
 * holding connections until PostgREST can no longer even build its schema cache
 * (PGRST002) and the pooler stops authenticating.
 *
 * Caps statement/idle timeouts for the API roles so abandoned work cannot hold a
 * connection forever, then clears backends that are already stuck.
 * Pass --apply to make changes; default is a dry run.
 */
const PROJECT_REF = "tzkocaucqtmmnrttxira";

/**
 * The direct host (db.<ref>.supabase.co) is IPv6-only on current Supabase
 * projects, so it is unreachable from most home/office IPv4 networks. Try it,
 * then fall back to the Supavisor session pooler, which accepts the same
 * `alter role` / `pg_terminate_backend` statements.
 */
function candidateUrls() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("missing SUPABASE_DB_PASSWORD");
  const secret = encodeURIComponent(password);
  return [
    {
      label: "direct (db.<ref>.supabase.co:5432)",
      url: `postgresql://postgres:${secret}@db.${PROJECT_REF}.supabase.co:5432/postgres`
    },
    {
      label: "session pooler (aws-0-us-east-1.pooler.supabase.com:5432)",
      url: `postgresql://postgres.${PROJECT_REF}:${secret}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
    }
  ];
}

async function connect() {
  let lastError: unknown;
  for (const candidate of candidateUrls()) {
    const client = new Client({
      connectionString: candidate.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000
    });
    try {
      await client.connect();
      console.log(`connected via ${candidate.label}`);
      return client;
    } catch (error) {
      console.log(`could not connect via ${candidate.label}: ${error instanceof Error ? error.message : error}`);
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("could not connect to Postgres");
}

/**
 * `service_role` ships with no statement_timeout, and that is the role the app's
 * service key runs as — so a slow read holds its connection indefinitely. The
 * other API roles already have Supabase defaults (anon 3s, authenticated 8s).
 * 30s stays well clear of legitimate cron work while still bounding the damage.
 */
const STATEMENT_TIMEOUT = "30s";
const IDLE_IN_TX_TIMEOUT = "30s";
const API_ROLES = ["service_role"] as const;

async function main() {
  loadEnvFiles();
  const apply = process.argv.includes("--apply");
  const client = await connect();
  console.log(apply ? "mode: APPLY" : "mode: dry run (pass --apply to change anything)");

  const before = await client.query<{ total: string; stuck: string }>(
    `select count(*)::text as total,
            count(*) filter (
              where usename = 'authenticator'
                and (state like 'idle in transaction%' or state = 'active')
                and now() - coalesce(query_start, xact_start) > interval '10 seconds'
            )::text as stuck
       from pg_stat_activity`
  );
  console.log(`connections: ${before.rows[0]?.total} total, ${before.rows[0]?.stuck} stuck >10s`);

  const current = await client.query<{ rolname: string; config: string[] | null }>(
    `select rolname, rolconfig as config
       from pg_roles
      where rolname in ('authenticator', 'anon', 'authenticated', 'service_role')`
  );
  console.log("--- current role settings ---");
  for (const row of current.rows) {
    console.log(`  ${row.rolname}: ${row.config?.join(", ") ?? "(none)"}`);
  }

  if (apply) {
    for (const role of API_ROLES) {
      await client.query(`alter role ${role} set statement_timeout = '${STATEMENT_TIMEOUT}'`);
      await client.query(`alter role ${role} set idle_in_transaction_session_timeout = '${IDLE_IN_TX_TIMEOUT}'`);
      console.log(`  set ${role}: statement_timeout=${STATEMENT_TIMEOUT}, idle_in_transaction=${IDLE_IN_TX_TIMEOUT}`);
    }

    const killed = await client.query<{ pid: number }>(
      `select pg_terminate_backend(pid) , pid
         from pg_stat_activity
        where usename = 'authenticator'
          and pid <> pg_backend_pid()
          and (
                state like 'idle in transaction%'
             or (state = 'active' and now() - query_start > interval '10 seconds')
              )`
    );
    console.log(`terminated ${killed.rowCount ?? 0} stuck backend(s)`);

    await client.query("select pg_notify('pgrst', 'reload schema')");
    console.log("asked PostgREST to reload its schema cache");
  }

  const after = await client.query<{ total: string }>("select count(*)::text as total from pg_stat_activity");
  console.log(`connections now: ${after.rows[0]?.total}`);

  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
