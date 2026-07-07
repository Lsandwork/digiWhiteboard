import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

const PROJECT_REF = "tzkocaucqtmmnrttxira";
const DEFAULT_MIGRATION = "025_demo_role_accounts.sql";

loadEnvFiles();

function buildDatabaseUrl(options?: { usePooler?: boolean }) {
  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (password?.trim()) {
    const usePooler =
      options?.usePooler ??
      (process.env.SUPABASE_USE_DIRECT !== "true" && process.env.SUPABASE_USE_POOLER !== "false");
    const host =
      process.env.SUPABASE_DB_HOST ??
      (usePooler ? "aws-0-us-east-1.pooler.supabase.com" : `db.${PROJECT_REF}.supabase.co`);
    const port = process.env.SUPABASE_DB_PORT ?? "5432";
    const user =
      process.env.SUPABASE_DB_USER ?? (usePooler ? `postgres.${PROJECT_REF}` : "postgres");
    const database = process.env.SUPABASE_DB_NAME ?? "postgres";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password.trim())}@${host}:${port}/${database}`;
  }

  const direct = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (direct?.trim()) return direct.trim();

  return null;
}

async function connectClient() {
  const attempts: Array<{ label: string; usePooler: boolean }> = [
    { label: "pooler", usePooler: true },
    { label: "direct", usePooler: false }
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    const databaseUrl = buildDatabaseUrl({ usePooler: attempt.usePooler });
    if (!databaseUrl) break;

    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      if (attempt.usePooler) {
        console.log("Connected via Supabase connection pooler.");
      }
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to connect to Supabase Postgres.");
}

async function main() {
  const migrationFile = process.argv[2] ?? DEFAULT_MIGRATION;
  const migrationPath = resolve(process.cwd(), "supabase/migrations", migrationFile);
  const sql = readFileSync(migrationPath, "utf8");

  if (!buildDatabaseUrl()) {
    throw new Error(
      "Missing database credentials. Set DATABASE_URL or SUPABASE_DB_PASSWORD before running db:push."
    );
  }

  const client = await connectClient();
  try {
    console.log(`Applying migration ${migrationFile} to Supabase...`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("create schema if not exists supabase_migrations");
    await client.query(
      `create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      )`
    );
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name)
       values ($1, $2)
       on conflict (version) do nothing`,
      [migrationFile.replace(/\.sql$/, ""), migrationFile]
    );
    await client.query("COMMIT");
    console.log(`Migration ${migrationFile} applied successfully.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
