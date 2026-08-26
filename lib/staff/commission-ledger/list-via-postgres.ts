/**
 * Direct Postgres read for the commission ledger GET.
 * Bypasses hung Supabase REST / Cloudflare 522 so the first page can still load.
 */
import { Client } from "pg";
import { normalizeCommissionDateFilter } from "./dates";
import { mapDbRecord } from "./map";
import { LEDGER_LIST_COLUMNS, LEDGER_SORTABLE_COLUMNS } from "./records";
import type { CommissionListFilters, CommissionListResult, CommissionViewer } from "./types";

const PROJECT_REF = "tzkocaucqtmmnrttxira";
const CONNECT_TIMEOUT_MS = 4_000;
const STATEMENT_TIMEOUT_MS = 6_000;

const DATE_COLUMNS = new Set(["sale_date", "service_date", "created_at", "confirmed_at", "paid_at"]);
const TEXT_CAST_COLUMNS = new Set(["sale_date", "service_date", "archived_at", "created_at", "updated_at"]);

function buildDatabaseUrl(options?: { usePooler?: boolean; port?: string }): string | null {
  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (password?.trim()) {
    const usePooler = options?.usePooler ?? true;
    const host =
      process.env.SUPABASE_DB_HOST ??
      (usePooler ? "aws-0-us-east-1.pooler.supabase.com" : `db.${PROJECT_REF}.supabase.co`);
    const port = options?.port ?? process.env.SUPABASE_DB_PORT ?? (usePooler ? "6543" : "5432");
    const user = process.env.SUPABASE_DB_USER ?? (usePooler ? `postgres.${PROJECT_REF}` : "postgres");
    const database = process.env.SUPABASE_DB_NAME ?? "postgres";
    // No sslmode here: pg treats `sslmode=require` as verify-full, and the
    // parsed connection string overrides the client's ssl options, which
    // rejects Supabase's pooler chain with "self-signed certificate".
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password.trim())}@${host}:${port}/${database}`;
  }
  const direct = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? process.env.POSTGRES_URL;
  return direct?.trim() || null;
}

export function canListCommissionsViaPostgres(): boolean {
  return Boolean(buildDatabaseUrl());
}

/** Exposed for diagnostics; returns a connection string, never logged. */
export function buildLedgerDatabaseUrl(): string | null {
  return buildDatabaseUrl({ usePooler: true, port: "6543" });
}

function ledgerSelectList(): string {
  return LEDGER_LIST_COLUMNS.split(", ")
    .map((column) => (TEXT_CAST_COLUMNS.has(column) ? `${column}::text as ${column}` : column))
    .join(", ");
}

function likeContains(value: string): string {
  return `%${value.replace(/,/g, "").trim()}%`;
}

export function buildCommissionLedgerSelect(
  viewer: CommissionViewer,
  filters: CommissionListFilters = {}
): { text: string; values: unknown[]; page: number; pageSize: number; from: number } {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(25, Math.max(10, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const sortBy = LEDGER_SORTABLE_COLUMNS[filters.sortBy ?? "sale_date"] ?? "sale_date";
  const ascending = (filters.sortDir ?? "desc") === "asc";
  const values: unknown[] = [];
  const where: string[] = [];

  const param = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (!filters.includeArchived) {
    where.push("archived_at is null");
  }

  if (viewer.isTrainerOnly) {
    if (viewer.adminUserId) {
      where.push(`trainer_user_id = ${param(viewer.adminUserId)}`);
    } else if (viewer.email) {
      where.push(`trainer_email ilike ${param(viewer.email)}`);
    } else {
      where.push("trainer_user_id = '00000000-0000-0000-0000-000000000000'");
    }
  }

  const trainerClauses: string[] = [];
  if (filters.trainerIds?.length) {
    trainerClauses.push(`trainer_user_id = any(${param(filters.trainerIds)}::uuid[])`);
  }
  for (const name of filters.trainerNames ?? []) {
    const trimmed = name.replace(/,/g, "").trim();
    if (trimmed) trainerClauses.push(`trainer_name ilike ${param(likeContains(trimmed))}`);
  }
  if (trainerClauses.length === 1) where.push(trainerClauses[0]);
  else if (trainerClauses.length > 1) where.push(`(${trainerClauses.join(" or ")})`);

  const requestedDateField = filters.dateField ?? "sale_date";
  const dateField = DATE_COLUMNS.has(requestedDateField) ? requestedDateField : "sale_date";
  const dateFrom = normalizeCommissionDateFilter(filters.dateFrom);
  const dateTo = normalizeCommissionDateFilter(filters.dateTo);
  if (dateFrom) where.push(`${dateField} >= ${param(dateFrom)}`);
  if (dateTo) where.push(`${dateField} <= ${param(dateTo)}`);

  if (filters.reviewStatus?.length) where.push(`review_status = any(${param(filters.reviewStatus)}::text[])`);
  if (filters.approvalStatus?.length) where.push(`approval_status = any(${param(filters.approvalStatus)}::text[])`);
  if (filters.paymentStatus?.length) where.push(`payment_status = any(${param(filters.paymentStatus)}::text[])`);
  if (filters.refundStatus?.length) where.push(`refund_status = any(${param(filters.refundStatus)}::text[])`);
  if (filters.commissionTypes?.length) {
    where.push(`commission_type = any(${param(filters.commissionTypes)}::text[])`);
  }
  if (filters.source?.length) where.push(`source = any(${param(filters.source)}::text[])`);
  if (filters.client) where.push(`client_name ilike ${param(likeContains(filters.client))}`);
  if (filters.dog) where.push(`dog_name ilike ${param(likeContains(filters.dog))}`);
  if (filters.packageOrClass) {
    where.push(`package_or_class ilike ${param(likeContains(filters.packageOrClass))}`);
  }
  if (filters.importBatchId) where.push(`import_batch_id = ${param(filters.importBatchId)}`);
  if (filters.payrollPeriodId) where.push(`payroll_period_id = ${param(filters.payrollPeriodId)}`);
  if (filters.hasOpenComments) where.push("has_open_comments = true");
  if (filters.missingRequired) where.push("missing_required_info = true");
  if (filters.possibleDuplicate) where.push("is_possible_duplicate = true");

  if (filters.q?.trim()) {
    const term = `%${filters.q.trim()}%`;
    const p1 = param(term);
    const p2 = param(term);
    const p3 = param(term);
    const p4 = param(term);
    const p5 = param(term);
    where.push(
      `(client_name ilike ${p1} or dog_name ilike ${p2} or package_or_class ilike ${p3} or trainer_name ilike ${p4} or external_transaction_id ilike ${p5})`
    );
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const text = `select ${ledgerSelectList()}
from package_commission_records
${whereSql}
order by ${sortBy} ${ascending ? "asc" : "desc"} nulls last
limit ${param(pageSize)} offset ${param(from)}`;

  return { text, values, page, pageSize, from };
}

export async function withCommissionPostgres<T>(
  work: (client: Client) => Promise<T>,
  options?: {
    queryTimeoutMs?: number;
    statementTimeoutMs?: number;
    connectionTimeoutMs?: number;
    preferSession?: boolean;
  }
): Promise<T> {
  const client = await connectPg(options);
  try {
    return await work(client);
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

async function connectPg(options?: {
  queryTimeoutMs?: number;
  statementTimeoutMs?: number;
  connectionTimeoutMs?: number;
  preferSession?: boolean;
}): Promise<Client> {
  const hasPassword = Boolean(
    (process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD)?.trim()
  );
  // Transaction pooling first (the serverless-safe port), then session pooling.
  // Import writes prefer session pooling so SET lock_timeout sticks.
  const attempts: Array<{ usePooler: boolean; port?: string }> = hasPassword
    ? options?.preferSession
      ? [
          { usePooler: true, port: "5432" },
          { usePooler: true, port: "6543" }
        ]
      : [
          { usePooler: true, port: "6543" },
          { usePooler: true, port: "5432" }
        ]
    : [{ usePooler: true }];
  const queryTimeoutMs = options?.queryTimeoutMs ?? STATEMENT_TIMEOUT_MS;
  const statementTimeoutMs = options?.statementTimeoutMs ?? STATEMENT_TIMEOUT_MS;
  const connectionTimeoutMs = options?.connectionTimeoutMs ?? CONNECT_TIMEOUT_MS;
  let lastError: unknown;
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const databaseUrl = buildDatabaseUrl(attempt);
    if (!databaseUrl || seen.has(databaseUrl)) continue;
    seen.add(databaseUrl);
    const client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: connectionTimeoutMs,
      query_timeout: queryTimeoutMs
    });
    try {
      await client.connect();
      if (attempt.port !== "6543") {
        await client.query(`set statement_timeout = ${statementTimeoutMs}`);
      }
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
    : new Error("Unable to connect to Postgres for the commission ledger.");
}

function emptySummary(): CommissionListResult["summary"] {
  return {
    grossSalesCents: 0,
    totalCommissionsCents: 0,
    pendingReviewCents: 0,
    approvedCents: 0,
    readyForPayrollCents: 0,
    paidCents: 0,
    refundedCents: 0,
    openQuestions: 0
  };
}

export async function listCommissionRecordsViaPostgres(
  viewer: CommissionViewer,
  filters: CommissionListFilters = {}
): Promise<CommissionListResult> {
  if (!canListCommissionsViaPostgres()) {
    throw new Error("Direct Postgres is not configured.");
  }

  const query = buildCommissionLedgerSelect(viewer, filters);
  const client = await connectPg();
  try {
    const result = await client.query(query.text, query.values);
    const rows = (result.rows as Record<string, unknown>[]).map((row) => mapDbRecord(row));
    const inferredTotal =
      rows.length < query.pageSize ? query.from + rows.length : query.from + query.pageSize + 1;
    return {
      rows,
      total: inferredTotal,
      page: query.page,
      pageSize: query.pageSize,
      summary: emptySummary()
    };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}
