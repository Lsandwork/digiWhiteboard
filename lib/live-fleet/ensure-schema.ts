/**
 * Detect / apply Live Fleet migration 076.
 * Apply path uses Postgres (pg) when DATABASE_URL or SUPABASE_DB_PASSWORD is available.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export const LIVE_FLEET_MIGRATION_FILE = "076_live_fleet_telemetry.sql";

export const LIVE_FLEET_REQUIRED_TABLES = [
  "route_fleet_sync_state",
  "route_fleet_vehicle_telemetry"
] as const;

export type LiveFleetSchemaReadiness = {
  ready: boolean;
  migration: string;
  present: string[];
  missing: string[];
  hasSamsaraVehicleId: boolean;
  canApplyViaPg: boolean;
  detail: string;
};

const PROJECT_REF = "tzkocaucqtmmnrttxira";

function buildDatabaseUrl(options?: { usePooler?: boolean }): string | null {
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
  return direct?.trim() || null;
}

export function canApplyLiveFleetMigrationViaPg(): boolean {
  return Boolean(buildDatabaseUrl());
}

export function loadLiveFleetMigrationSql(): string {
  return readFileSync(resolve(process.cwd(), "supabase/migrations", LIVE_FLEET_MIGRATION_FILE), "utf8");
}

async function tableExists(supabase: Supabase, table: string): Promise<boolean> {
  try {
    const { error } = await supabase.from(table).select("*", { count: "exact", head: true }).limit(1);
    if (error) {
      const msg = error.message || "";
      if (/does not exist|Could not find the table|schema cache/i.test(msg)) return false;
      return true;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|Could not find the table|schema cache/i.test(msg)) return false;
    return true;
  }
}

async function hasSamsaraVehicleIdColumn(supabase: Supabase): Promise<boolean> {
  try {
    const { error } = await supabase.from("route_vehicle_configs").select("samsara_vehicle_id").limit(1);
    if (error) {
      const msg = error.message || "";
      if (/samsara_vehicle_id|schema cache|column/i.test(msg)) return false;
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

export async function checkLiveFleetSchema(supabase: Supabase): Promise<LiveFleetSchemaReadiness> {
  const present: string[] = [];
  const missing: string[] = [];

  await Promise.all(
    LIVE_FLEET_REQUIRED_TABLES.map(async (table) => {
      if (await tableExists(supabase, table)) present.push(table);
      else missing.push(table);
    })
  );

  const hasColumn = await hasSamsaraVehicleIdColumn(supabase);
  const ready = missing.length === 0 && hasColumn;
  const canApplyViaPg = canApplyLiveFleetMigrationViaPg();

  return {
    ready,
    migration: LIVE_FLEET_MIGRATION_FILE,
    present,
    missing,
    hasSamsaraVehicleId: hasColumn,
    canApplyViaPg,
    detail: ready
      ? `Migration ${LIVE_FLEET_MIGRATION_FILE} present.`
      : `Live Fleet schema incomplete (missing: ${[
          ...missing,
          hasColumn ? null : "route_vehicle_configs.samsara_vehicle_id"
        ]
          .filter(Boolean)
          .join(", ")}). Apply ${LIVE_FLEET_MIGRATION_FILE}.${
          canApplyViaPg
            ? " Auto-apply is available (Postgres credentials configured)."
            : " Run: npm run db:push -- 076_live_fleet_telemetry.sql — or set SUPABASE_DB_PASSWORD / DATABASE_URL."
        }`
  };
}

async function connectPg(): Promise<Client> {
  const attempts: Array<{ usePooler: boolean }> = [{ usePooler: true }, { usePooler: false }];
  let lastError: unknown;
  for (const attempt of attempts) {
    const databaseUrl = buildDatabaseUrl(attempt);
    if (!databaseUrl) break;
    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false }
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to connect to Supabase Postgres (need SUPABASE_DB_PASSWORD or DATABASE_URL).");
}

export async function applyLiveFleetMigration076(): Promise<{
  ok: boolean;
  applied: boolean;
  detail: string;
}> {
  if (!canApplyLiveFleetMigrationViaPg()) {
    return {
      ok: false,
      applied: false,
      detail:
        "Postgres credentials not configured on this server. Set SUPABASE_DB_PASSWORD (or DATABASE_URL) on Vercel, or run npm run db:push -- 076_live_fleet_telemetry.sql."
    };
  }

  const sql = loadLiveFleetMigrationSql();
  const client = await connectPg();
  try {
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
      [LIVE_FLEET_MIGRATION_FILE.replace(/\.sql$/, ""), LIVE_FLEET_MIGRATION_FILE]
    );
    await client.query("COMMIT");
    console.info(
      JSON.stringify({
        scope: "live_fleet",
        event: "migration_076_applied",
        at: new Date().toISOString()
      })
    );
    return {
      ok: true,
      applied: true,
      detail: `Applied ${LIVE_FLEET_MIGRATION_FILE} successfully.`
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      applied: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await client.end();
  }
}

let ensurePromise: Promise<LiveFleetSchemaReadiness> | null = null;

/**
 * Ensure Live Fleet tables exist. Idempotent; safe to call on every Live Fleet request.
 * Applies migration 076 automatically when Postgres credentials are available.
 */
export async function ensureLiveFleetSchema(supabase: Supabase): Promise<LiveFleetSchemaReadiness> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const before = await checkLiveFleetSchema(supabase);
      if (before.ready) return before;
      if (!before.canApplyViaPg) return before;
      const result = await applyLiveFleetMigration076();
      const after = await checkLiveFleetSchema(supabase);
      if (!result.ok || !after.ready) {
        console.warn(
          JSON.stringify({
            scope: "live_fleet",
            event: "migration_076_apply_failed",
            detail: result.detail,
            missing: after.missing
          })
        );
        ensurePromise = null;
      }
      return after;
    })();
  }
  return ensurePromise;
}
