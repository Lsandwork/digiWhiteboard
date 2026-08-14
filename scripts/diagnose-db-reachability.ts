import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

/** Try every documented Supabase Postgres entry point and report which answer. */
const PROJECT_REF = "tzkocaucqtmmnrttxira";

type Target = { label: string; host: string; port: string; user: string };

async function attempt(target: Target, password: string) {
  const url = `postgresql://${encodeURIComponent(target.user)}:${encodeURIComponent(password)}@${target.host}:${target.port}/postgres`;
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000
  });
  const startedAt = Date.now();
  try {
    await client.connect();
    const result = await client.query<{ now: string }>("select now()::text as now");
    console.log(`${target.label}: OK in ${Date.now() - startedAt}ms (server time ${result.rows[0]?.now})`);
    await client.end();
    return true;
  } catch (error) {
    console.log(`${target.label}: FAIL after ${Date.now() - startedAt}ms — ${error instanceof Error ? error.message : error}`);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function main() {
  loadEnvFiles();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("missing SUPABASE_DB_PASSWORD");

  const targets: Target[] = [
    { label: "env pooler (.env.local)", host: process.env.SUPABASE_DB_HOST ?? "", port: process.env.SUPABASE_DB_PORT ?? "5432", user: process.env.SUPABASE_DB_USER ?? "" },
    { label: "direct db host:5432", host: `db.${PROJECT_REF}.supabase.co`, port: "5432", user: "postgres" },
    { label: "pooler us-west-1 session:5432", host: "aws-0-us-west-1.pooler.supabase.com", port: "5432", user: `postgres.${PROJECT_REF}` },
    { label: "pooler us-west-1 txn:6543", host: "aws-0-us-west-1.pooler.supabase.com", port: "6543", user: `postgres.${PROJECT_REF}` }
  ];

  for (const target of targets) {
    if (!target.host || !target.user) {
      console.log(`${target.label}: skipped (not configured)`);
      continue;
    }
    console.log(`  -> ${target.host}:${target.port}`);
    if (await attempt(target, password)) break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
