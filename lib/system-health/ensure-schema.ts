/**
 * Detect / apply System Health migration 072.
 * Apply path uses Postgres (pg) when DATABASE_URL or SUPABASE_DB_PASSWORD is available.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export const SYSTEM_HEALTH_MIGRATION_FILE = "072_system_health_debugging.sql";

export const SYSTEM_HEALTH_REQUIRED_TABLES = [
  "system_health_events",
  "system_health_errors",
  "system_health_route_audits",
  "system_health_route_dog_traces",
  "system_health_integration_calls",
  "system_health_api_logs",
  "system_health_service_checks",
  "system_health_settings",
  "system_health_live_debug_sessions",
  "system_health_debug_access_logs"
] as const;

export type SchemaReadiness = {
  ready: boolean;
  migration: string;
  present: string[];
  missing: string[];
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

export function canApplySystemHealthMigrationViaPg(): boolean {
  return Boolean(buildDatabaseUrl());
}

export function loadSystemHealthMigrationSql(): string {
  return readFileSync(
    resolve(process.cwd(), "supabase/migrations", SYSTEM_HEALTH_MIGRATION_FILE),
    "utf8"
  );
}

export async function checkSystemHealthSchema(supabase: Supabase): Promise<SchemaReadiness> {
  const present: string[] = [];
  const missing: string[] = [];

  await Promise.all(
    SYSTEM_HEALTH_REQUIRED_TABLES.map(async (table) => {
      try {
        const { error } = await supabase.from(table).select("*", { count: "exact", head: true }).limit(1);
        if (error) {
          const msg = error.message || "";
          // relation missing / not in schema cache
          if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
            missing.push(table);
            return;
          }
          // Other errors (RLS, etc.) still mean the table exists for service role
          present.push(table);
          return;
        }
        present.push(table);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
          missing.push(table);
        } else {
          // Ambiguous — treat as present to avoid false alarms
          present.push(table);
        }
      }
    })
  );

  const ready = missing.length === 0;
  const canApplyViaPg = canApplySystemHealthMigrationViaPg();
  return {
    ready,
    migration: SYSTEM_HEALTH_MIGRATION_FILE,
    present,
    missing,
    canApplyViaPg,
    detail: ready
      ? `Migration ${SYSTEM_HEALTH_MIGRATION_FILE} present (${present.length} tables).`
      : `Missing ${missing.length} System Health table(s): ${missing.join(", ")}. Apply ${SYSTEM_HEALTH_MIGRATION_FILE}.${
          canApplyViaPg
            ? " One-click apply is available (Postgres credentials configured)."
            : " Paste SQL in Supabase SQL Editor, or set SUPABASE_DB_PASSWORD / DATABASE_URL for one-click apply."
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

export async function applySystemHealthMigration072(): Promise<{
  ok: boolean;
  applied: boolean;
  detail: string;
}> {
  if (!canApplySystemHealthMigrationViaPg()) {
    return {
      ok: false,
      applied: false,
      detail:
        "Postgres credentials not configured on this server. Set SUPABASE_DB_PASSWORD (or DATABASE_URL) on Vercel, or run the SQL in Supabase SQL Editor."
    };
  }

  const sql = loadSystemHealthMigrationSql();
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
      [SYSTEM_HEALTH_MIGRATION_FILE.replace(/\.sql$/, ""), SYSTEM_HEALTH_MIGRATION_FILE]
    );
    await client.query("COMMIT");
    return {
      ok: true,
      applied: true,
      detail: `Applied ${SYSTEM_HEALTH_MIGRATION_FILE} successfully.`
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
