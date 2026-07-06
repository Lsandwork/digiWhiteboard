import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const PROJECT_REF = "tzkocaucqtmmnrttxira";
const DEFAULT_MIGRATION = "023_cast_video_notices.sql";

function buildDatabaseUrl() {
  const direct = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (direct?.trim()) return direct.trim();

  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (!password?.trim()) return null;

  const host = process.env.SUPABASE_DB_HOST ?? `db.${PROJECT_REF}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT ?? "5432";
  const user = process.env.SUPABASE_DB_USER ?? "postgres";
  const database = process.env.SUPABASE_DB_NAME ?? "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

async function main() {
  const migrationFile = process.argv[2] ?? DEFAULT_MIGRATION;
  const migrationPath = resolve(process.cwd(), "supabase/migrations", migrationFile);
  const sql = readFileSync(migrationPath, "utf8");
  const databaseUrl = buildDatabaseUrl();

  if (!databaseUrl) {
    throw new Error(
      "Missing database credentials. Set DATABASE_URL or SUPABASE_DB_PASSWORD before running db:push."
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
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
