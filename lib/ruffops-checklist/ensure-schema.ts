/**
 * Detect / apply RuffOps Checklist migration 079.
 * Apply path uses Postgres (pg) when DATABASE_URL or SUPABASE_DB_PASSWORD is available.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import type { getServiceSupabase } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof getServiceSupabase>;

export const RUFFOPS_CHECKLIST_MIGRATION_FILE = "079_ruffops_checklist_completions.sql";
export const RUFFOPS_CHECKLIST_TABLE = "ops_checklist_completions";

export type RuffopsChecklistSchemaReadiness = {
  ready: boolean;
  migration: string;
  canApplyViaPg: boolean;
  detail: string;
};

const PROJECT_REF = "tzkocaucqtmmnrttxira";

const EMBEDDED_MIGRATION_SQL = `-- Shared RuffOps Checklist completions for Team Leads, Managers, and Admins.
-- One list: if anyone checks an item, everyone sees the timestamp and name.

create table if not exists public.ops_checklist_completions (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  source text not null check (source in ('gingr', 'reminder', 'walks', 'alert')),
  source_id text not null,
  shift_date date not null,
  completed_at timestamptz not null default now(),
  completed_by uuid references public.admin_users(id) on delete set null,
  completed_by_name text,
  undone_at timestamptz,
  undone_by uuid references public.admin_users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ops_checklist_completions_shift_idx
  on public.ops_checklist_completions (shift_date desc, completed_at desc);

create index if not exists ops_checklist_completions_active_idx
  on public.ops_checklist_completions (shift_date, source)
  where undone_at is null;

drop trigger if exists set_ops_checklist_completions_updated_at on public.ops_checklist_completions;
create trigger set_ops_checklist_completions_updated_at
  before update on public.ops_checklist_completions
  for each row execute function public.set_updated_at();

alter table public.ops_checklist_completions enable row level security;

drop policy if exists "No public ops checklist completions access" on public.ops_checklist_completions;
create policy "No public ops checklist completions access"
  on public.ops_checklist_completions for all using (false) with check (false);
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

export function canApplyRuffopsChecklistMigrationViaPg(): boolean {
  return Boolean(buildDatabaseUrl());
}

export function loadRuffopsChecklistMigrationSql(): string {
  try {
    return readFileSync(
      resolve(process.cwd(), "supabase/migrations", RUFFOPS_CHECKLIST_MIGRATION_FILE),
      "utf8"
    );
  } catch {
    return EMBEDDED_MIGRATION_SQL;
  }
}

export async function checkRuffopsChecklistSchema(supabase: Supabase): Promise<RuffopsChecklistSchemaReadiness> {
  const canApplyViaPg = canApplyRuffopsChecklistMigrationViaPg();
  try {
    const { error } = await supabase
      .from(RUFFOPS_CHECKLIST_TABLE)
      .select("item_key", { count: "exact", head: true })
      .limit(1);
    if (error) {
      const msg = error.message || "";
      if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
        return {
          ready: false,
          migration: RUFFOPS_CHECKLIST_MIGRATION_FILE,
          canApplyViaPg,
          detail: `Missing ${RUFFOPS_CHECKLIST_TABLE}. Apply ${RUFFOPS_CHECKLIST_MIGRATION_FILE}.${
            canApplyViaPg
              ? " Auto-apply is available (Postgres credentials configured)."
              : " Run: npm run db:push -- 079_ruffops_checklist_completions.sql"
          }`
        };
      }
    }
    return {
      ready: true,
      migration: RUFFOPS_CHECKLIST_MIGRATION_FILE,
      canApplyViaPg,
      detail: `Migration ${RUFFOPS_CHECKLIST_MIGRATION_FILE} present.`
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/does not exist|Could not find the table|schema cache/i.test(msg)) {
      return {
        ready: false,
        migration: RUFFOPS_CHECKLIST_MIGRATION_FILE,
        canApplyViaPg,
        detail: `Missing ${RUFFOPS_CHECKLIST_TABLE}. Apply ${RUFFOPS_CHECKLIST_MIGRATION_FILE}.`
      };
    }
    return {
      ready: true,
      migration: RUFFOPS_CHECKLIST_MIGRATION_FILE,
      canApplyViaPg,
      detail: `Assumed ${RUFFOPS_CHECKLIST_TABLE} present (${msg}).`
    };
  }
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

export async function applyRuffopsChecklistMigration079(): Promise<{
  ok: boolean;
  applied: boolean;
  detail: string;
}> {
  if (!canApplyRuffopsChecklistMigrationViaPg()) {
    return {
      ok: false,
      applied: false,
      detail:
        "Postgres credentials not configured on this server. Set SUPABASE_DB_PASSWORD (or DATABASE_URL) on Vercel, or run npm run db:push -- 079_ruffops_checklist_completions.sql."
    };
  }

  const sql = loadRuffopsChecklistMigrationSql();
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
      [RUFFOPS_CHECKLIST_MIGRATION_FILE.replace(/\.sql$/, ""), RUFFOPS_CHECKLIST_MIGRATION_FILE]
    );
    await client.query("COMMIT");
    console.info(
      JSON.stringify({
        scope: "ruffops_checklist",
        event: "migration_079_applied",
        at: new Date().toISOString()
      })
    );
    return {
      ok: true,
      applied: true,
      detail: `Applied ${RUFFOPS_CHECKLIST_MIGRATION_FILE} successfully.`
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

let ensurePromise: Promise<RuffopsChecklistSchemaReadiness> | null = null;

/**
 * Ensure ops_checklist_completions exists. Idempotent; safe on every checklist request.
 * Applies migration 079 automatically when Postgres credentials are available.
 */
export async function ensureRuffopsChecklistSchema(supabase: Supabase): Promise<RuffopsChecklistSchemaReadiness> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const before = await checkRuffopsChecklistSchema(supabase);
      if (before.ready) return before;
      if (!before.canApplyViaPg) return before;
      const result = await applyRuffopsChecklistMigration079();
      const after = await checkRuffopsChecklistSchema(supabase);
      if (!result.ok || !after.ready) {
        console.warn(
          JSON.stringify({
            scope: "ruffops_checklist",
            event: "migration_079_apply_failed",
            detail: result.detail
          })
        );
        ensurePromise = null;
      }
      return after;
    })();
  }
  return ensurePromise;
}
