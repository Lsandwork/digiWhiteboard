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

/** Per-probe cap. Probes run in parallel so the report always beats maxDuration. */
const PROBE_TIMEOUT_MS = 4_000;

async function timed(name: string, run: () => Promise<string>): Promise<LedgerProbe> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const detail = await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no response within ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS
        );
      })
    ]);
    return { name, ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : String(error)
    };
  } finally {
    if (timer) clearTimeout(timer);
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
  const configured = configuredFlags();

  // All probes run in parallel and each self-caps, so a hung Supabase cannot
  // stack timeouts past the function limit and 504 this report.
  const probes = await Promise.all([
    timed("rest_ledger_page", async () => {
      const result = await listCommissionRecordsViaRest(viewer, { page: 1, pageSize: 10 }, PROBE_TIMEOUT_MS);
      return `${result.rows.length} rows returned`;
    }),

    timed("rest_head_only", async () => {
      const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (!baseUrl || !serviceKey) throw new Error("Supabase env not configured");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}/rest/v1/package_commission_records?select=id&limit=1`, {
          cache: "no-store",
          signal: controller.signal,
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
        });
        const contentType = response.headers.get("content-type") ?? "unknown";
        return `HTTP ${response.status} (${contentType})`;
      } finally {
        clearTimeout(timer);
      }
    }),

    timed("rest_exact_count", async () => {
      const supabase = getServiceSupabase({ timeoutMs: PROBE_TIMEOUT_MS });
      const { count, error } = await supabase
        .from("package_commission_records")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return `${count ?? 0} total rows in package_commission_records`;
    }),

    timed("legacy_settings_rows", async () => {
      const supabase = getServiceSupabase({ timeoutMs: PROBE_TIMEOUT_MS });
      const { data, error } = await supabase
        .from("admin_settings")
        .select("settings->package_commissions")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const record = (data ?? {}) as Record<string, unknown>;
      const value = record.package_commissions as { rows?: unknown[] } | undefined;
      return `${Array.isArray(value?.rows) ? value.rows.length : 0} legacy JSON rows`;
    }),

    configured.directPostgresUsable
      ? timed("direct_postgres", async () => {
          const url = buildLedgerDatabaseUrl();
          if (!url) throw new Error("no connection string");
          const client = new Client({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 2_000,
            query_timeout: 3_000
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
      : Promise.resolve<LedgerProbe>({
          name: "direct_postgres",
          ok: false,
          ms: 0,
          detail:
            "Not configured. Add SUPABASE_DB_PASSWORD or DATABASE_URL in Vercel to enable the Postgres fallback."
        })
  ]);

  const restReachable = probes.some(
    (probe) => probe.name.startsWith("rest_") && probe.ok
  );
  const summary = restReachable
    ? "Supabase REST responded. See probe details for row counts."
    : "Supabase REST did not respond to any probe. The ledger cannot load until REST recovers or the Postgres fallback is configured.";

  return { configured, summary, probes };
}
