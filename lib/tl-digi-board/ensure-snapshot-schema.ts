/**
 * Detect / apply TL Digi Board snapshot table migration 081.
 * Same auto-apply pattern as the RuffOps checklist: use Postgres when
 * DATABASE_URL or SUPABASE_DB_PASSWORD is available.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export const TL_DIGI_BOARD_SNAPSHOT_TABLE = "tl_digi_board_snapshots";
export const TL_DIGI_BOARD_SNAPSHOT_MIGRATION_FILE = "081_tl_digi_board_snapshots.sql";

const PROJECT_REF = "tzkocaucqtmmnrttxira";

const EMBEDDED_MIGRATION_SQL = `create table if not exists public.tl_digi_board_snapshots (
  id text primary key,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tl_digi_board_snapshots enable row level security;

drop policy if exists "No public tl_digi_board_snapshots access" on public.tl_digi_board_snapshots;
create policy "No public tl_digi_board_snapshots access"
  on public.tl_digi_board_snapshots for all using (false) with check (false);

revoke all on table public.tl_digi_board_snapshots from public;
grant select, insert, update, delete on table public.tl_digi_board_snapshots to service_role;
`;

function normalizeDatabaseUrl(url: string) {
  return url.replace(/sslmode=require/gi, "sslmode=no-verify");
}

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
  return direct?.trim() ? normalizeDatabaseUrl(direct.trim()) : null;
}

function isMissingRelation(error: { code?: string; message?: string } | null) {
  const msg = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    /does not exist|Could not find the table|schema cache/i.test(msg)
  );
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

export async function checkTlDigiBoardSnapshotSchema(supabase: Supabase): Promise<{
  ready: boolean;
  canApplyViaPg: boolean;
}> {
  const canApplyViaPg = Boolean(buildDatabaseUrl());
  try {
    const { error } = await supabase.from(TL_DIGI_BOARD_SNAPSHOT_TABLE).select("id").eq("id", "default").maybeSingle();
    if (error && isMissingRelation(error)) {
      return { ready: false, canApplyViaPg };
    }
    return { ready: true, canApplyViaPg };
  } catch (error) {
    if (isMissingRelation(error as { message?: string })) {
      return { ready: false, canApplyViaPg };
    }
    return { ready: true, canApplyViaPg };
  }
}

export async function applyTlDigiBoardSnapshotMigration081(): Promise<{ ok: boolean; detail: string }> {
  if (!buildDatabaseUrl()) {
    return { ok: false, detail: "Postgres credentials not configured." };
  }
  let sql = EMBEDDED_MIGRATION_SQL;
  try {
    sql = readFileSync(resolve(process.cwd(), "supabase/migrations", TL_DIGI_BOARD_SNAPSHOT_MIGRATION_FILE), "utf8");
  } catch {
    sql = EMBEDDED_MIGRATION_SQL;
  }
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
      [TL_DIGI_BOARD_SNAPSHOT_MIGRATION_FILE.replace(/\.sql$/, ""), TL_DIGI_BOARD_SNAPSHOT_MIGRATION_FILE]
    );
    await client.query("COMMIT");
    return { ok: true, detail: `Applied ${TL_DIGI_BOARD_SNAPSHOT_MIGRATION_FILE}.` };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.end();
  }
}

let ensurePromise: Promise<boolean> | null = null;

/** Idempotent. Safe on cron and TV GET. */
export async function ensureTlDigiBoardSnapshotSchema(supabase: Supabase): Promise<boolean> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const before = await checkTlDigiBoardSnapshotSchema(supabase);
      if (before.ready) return true;
      if (!before.canApplyViaPg) return false;
      const applied = await applyTlDigiBoardSnapshotMigration081();
      if (!applied.ok) {
        ensurePromise = null;
        return false;
      }
      const after = await checkTlDigiBoardSnapshotSchema(supabase);
      if (!after.ready) ensurePromise = null;
      return after.ready;
    })();
  }
  return ensurePromise;
}
