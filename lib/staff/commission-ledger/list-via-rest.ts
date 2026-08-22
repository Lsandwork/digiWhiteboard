/**
 * One PostgREST GET for the commission ledger. No supabase-js extras.
 */
import { readResponseJson } from "@/lib/http/read-response-json";
import { mapDbRecord } from "./map";
import { LEDGER_LIST_COLUMNS, LEDGER_SORTABLE_COLUMNS } from "./records";
import type { CommissionListFilters, CommissionListResult, CommissionViewer } from "./types";

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

function encodeInList(values: string[]): string {
  return `(${values.map((value) => value.replace(/[(),]/g, "")).join(",")})`;
}

export function buildCommissionLedgerRestPath(
  viewer: CommissionViewer,
  filters: CommissionListFilters = {}
): { path: string; page: number; pageSize: number; from: number } {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(25, Math.max(10, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const sortBy = LEDGER_SORTABLE_COLUMNS[filters.sortBy ?? "sale_date"] ?? "sale_date";
  const ascending = (filters.sortDir ?? "desc") === "asc";
  const params = new URLSearchParams();
  params.set("select", LEDGER_LIST_COLUMNS);
  if (!filters.includeArchived) params.set("archived_at", "is.null");

  if (viewer.isTrainerOnly) {
    if (viewer.adminUserId) params.set("trainer_user_id", `eq.${viewer.adminUserId}`);
    else if (viewer.email) params.set("trainer_email", `ilike.${viewer.email}`);
    else params.set("trainer_user_id", "eq.00000000-0000-0000-0000-000000000000");
  } else if (filters.trainerIds?.length) {
    params.set("trainer_user_id", `in.${encodeInList(filters.trainerIds)}`);
  }

  const dateField =
    filters.dateField === "service_date" ||
    filters.dateField === "created_at" ||
    filters.dateField === "confirmed_at" ||
    filters.dateField === "paid_at"
      ? filters.dateField
      : "sale_date";
  if (filters.dateFrom) params.append(dateField, `gte.${filters.dateFrom}`);
  if (filters.dateTo) params.append(dateField, `lte.${filters.dateTo}`);

  if (filters.reviewStatus?.length) params.set("review_status", `in.${encodeInList(filters.reviewStatus)}`);
  if (filters.approvalStatus?.length) params.set("approval_status", `in.${encodeInList(filters.approvalStatus)}`);
  if (filters.paymentStatus?.length) params.set("payment_status", `in.${encodeInList(filters.paymentStatus)}`);

  params.set("order", `${sortBy}.${ascending ? "asc" : "desc"}.nullslast`);
  params.set("limit", String(pageSize));
  params.set("offset", String(from));

  return { path: `/rest/v1/package_commission_records?${params.toString()}`, page, pageSize, from };
}

export async function listCommissionRecordsViaRest(
  viewer: CommissionViewer,
  filters: CommissionListFilters,
  timeoutMs: number
): Promise<CommissionListResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  const query = buildCommissionLedgerRestPath(viewer, filters);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${query.path}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
        Prefer: "count=none"
      }
    });
    const body = await readResponseJson<unknown>(response);
    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : `Commission ledger REST ${response.status}`;
      throw new Error(message);
    }
    const rows = (Array.isArray(body) ? body : []).map((row) => mapDbRecord(row as Record<string, unknown>));
    const inferredTotal = rows.length < query.pageSize ? query.from + rows.length : query.from + query.pageSize + 1;
    return {
      rows,
      total: inferredTotal,
      page: query.page,
      pageSize: query.pageSize,
      summary: emptySummary()
    };
  } finally {
    clearTimeout(timer);
  }
}
