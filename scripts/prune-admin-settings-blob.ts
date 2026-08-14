import { Client } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFiles } from "./load-env-local";

/**
 * One-time maintenance: apply migration 075 (if needed), trim bloated Team Log
 * history inside admin_settings, and report before/after sizes.
 * Pass --apply to write changes.
 */
const PROJECT_REF = "tzkocaucqtmmnrttxira";
const MAX_CROSSOVER = 500;
const MAX_NOTIFICATIONS = 150;

function directUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("missing SUPABASE_DB_PASSWORD");
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
}

function sortNewest<T extends { created_at?: string | null }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}

async function main() {
  loadEnvFiles();
  const apply = process.argv.includes("--apply");
  const client = new Client({
    connectionString: directUrl(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
    statement_timeout: 120_000
  });
  await client.connect();

  const migrationSql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/075_admin_settings_json_patch.sql"),
    "utf8"
  );
  if (apply) {
    await client.query(migrationSql);
    console.log("applied migration 075_admin_settings_json_patch.sql");
  } else {
    console.log("dry run — pass --apply to execute migration + prune");
  }

  const before = await client.query<{ kib: string }>(
    `select round(length(settings::text) / 1024.0, 1)::text as kib from admin_settings where id = 'default'`
  );
  console.log(`settings blob before: ${before.rows[0]?.kib ?? "?"} KiB`);

  const raw = await client.query<{ ops: unknown }>(
    `select settings->'staff_admin_ops' as ops from admin_settings where id = 'default'`
  );
  const ops = (raw.rows[0]?.ops ?? {}) as Record<string, unknown>;
  const crossover = Array.isArray(ops.crossover_messages) ? (ops.crossover_messages as unknown[]) : [];
  const notifications = Array.isArray(ops.notifications) ? (ops.notifications as unknown[]) : [];
  console.log(`staff_admin_ops crossover_messages: ${crossover.length}, notifications: ${notifications.length}`);

  if (apply && (crossover.length > MAX_CROSSOVER || notifications.length > MAX_NOTIFICATIONS)) {
    const trimmed = {
      ...ops,
      crossover_messages: sortNewest(crossover as Array<{ created_at?: string | null }>).slice(0, MAX_CROSSOVER),
      notifications: sortNewest(notifications as Array<{ created_at?: string | null }>).slice(0, MAX_NOTIFICATIONS)
    };
    await client.query(`select public.patch_admin_settings_json($1, $2::jsonb)`, ["staff_admin_ops", JSON.stringify(trimmed)]);
    console.log(
      `pruned staff_admin_ops to ${Math.min(crossover.length, MAX_CROSSOVER)} messages / ${Math.min(notifications.length, MAX_NOTIFICATIONS)} notifications`
    );
  }

  if (apply) {
    await client.query("select pg_notify('pgrst', 'reload schema')");
    console.log("asked PostgREST to reload schema cache");
  }

  const after = await client.query<{ kib: string }>(
    `select round(length(settings::text) / 1024.0, 1)::text as kib from admin_settings where id = 'default'`
  );
  console.log(`settings blob after: ${after.rows[0]?.kib ?? "?"} KiB`);

  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
