/**
 * Commission ledger transport probes.
 * Answers "why is the ledger empty" with real timings instead of a guess.
 * Never returns secret values — only whether they are configured.
 */
import { Client } from "pg";
import { getServiceSupabase } from "@/lib/supabase/server";
import { canListCommissionsViaPostgres, buildLedgerDatabaseUrl } from "./list-via-postgres";
import { listCommissionRecordsViaRest } from "./list-via-rest";
import type { CommissionViewer } from "./types";

export type LedgerProbe = {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
};

async function timed(name: string, run: () => Promise<string>): Promise<LedgerProbe> {
  const started = Date.now();
  try {
    const detail = await run();
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function configuredFlags() {
  return {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    dbPassword: Boolean(process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD),
    databaseUrl: Boolean(process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.POSTGRES_URL),
    directPostgresUsable: canListCommissionsViaPostgres()
  };
}

export async function runLedgerDiagnostics(viewer: CommissionViewer) {
  const probes: LedgerProbe[] = [];

  probes.push(
    await timed("rest_ledger_page", async () => {
      const result = await listCommissionRecordsViaRest(viewer, { page: 1, pageSize: 10 }, 6_000);
      return `${result.rows.length} rows`;
    })
  );

  probes.push(
    await timed("rest_exact_count", async () => {
      const supabase = getServiceSupabase({ timeoutMs: 6_000 });
      const { count, error } = await supabase
        .from("package_commission_records")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return `${count ?? 0} total rows in package_commission_records`;
    })
  );

  probes.push(
    await timed("legacy_settings_rows", async () => {
      const supabase = getServiceSupabase({ timeoutMs: 6_000 });
      const { data, error } = await supabase
        .from("admin_settings")
        .select("settings->package_commissions")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const record = (data ?? {}) as Record<string, unknown>;
      const value = record.package_commissions as { rows?: unknown[] } | undefined;
      return `${Array.isArray(value?.rows) ? value.rows.length : 0} legacy JSON rows`;
    })
  );

  if (canListCommissionsViaPostgres()) {
    probes.push(
      await timed("direct_postgres", async () => {
        const url = buildLedgerDatabaseUrl();
        if (!url) throw new Error("no connection string");
        const client = new Client({
          connectionString: url,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 2_000,
          query_timeout: 4_000
        });
        await client.connect();
        try {
          const result = await client.query(
            "select count(*)::text as total from package_commission_records where archived_at is null"
          );
          return `${result.rows[0]?.total ?? "0"} live rows via pooler`;
        } finally {
          await client.end().catch(() => undefined);
        }
      })
    );
  } else {
    probes.push({
      name: "direct_postgres",
      ok: false,
      ms: 0,
      detail: "Not configured. Add SUPABASE_DB_PASSWORD or DATABASE_URL in Vercel to enable the Postgres fallback."
    });
  }

  return { configured: configuredFlags(), probes };
}
