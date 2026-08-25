import { NextResponse } from "next/server";
import { resolveSessionDisplayName } from "@/lib/admin/actor-display";
import {
  canManagePackageCommissions,
  canViewPackageCommissions,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { accessFromLegacyRole, hasPermission, hasRole, legacyRoleToRoleKey } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { humanizeUnknownError, isTimeoutLikeError } from "@/lib/safe-url";
import { getTtlCache, setTtlCache, withTimeoutFallback } from "@/lib/server-ttl-cache";
import { SERVICE_SUPABASE_TIMEOUT_MS } from "@/lib/supabase/server";
import {
  COMMISSIONS_IMPORT_SLOW_MESSAGE,
  COMMISSIONS_MUTATION_TIMEOUT_MS,
  COMMISSIONS_SUBTAB_QUERY_TIMEOUT_MS
} from "@/lib/staff/commission-ledger/import-timeouts";
import { listCommissionTrainersFromDb } from "@/lib/staff/commission-ledger/trainers";
import {
  canListCommissionsViaPostgres,
  listCommissionRecordsViaPostgres
} from "@/lib/staff/commission-ledger/list-via-postgres";
import { listCommissionRecordsViaRest } from "@/lib/staff/commission-ledger/list-via-rest";
import { runLedgerDiagnostics } from "@/lib/staff/commission-ledger/diagnostics";
import {
  acknowledgeTrainerStatement,
  bulkUpdateCommissionRecords,
  createCellComment,
  createCommissionRecord,
  createCommissionRule,
  createPayrollPeriod,
  createRefundAdjustment,
  deleteCommissionRecord,
  deleteCommissionRule,
  getCommissionRecord,
  getPayrollPeriodSummary,
  importCommissionCsvToLedger,
  listCommissionRecords,
  listCommissionRules,
  listCommentThreads,
  listImportBatches,
  listImportBatchesViaPostgres,
  listPayrollPeriods,
  listPayrollPeriodsViaPostgres,
  listCommissionRulesViaPostgres,
  listRecordAudit,
  previewCommissionRule,
  purgeRejectedDuplicateCommissions,
  replyToCommentThread,
  reopenCommentThread,
  resolveCommentThread,
  setApprovalStatus,
  setPaymentStatus,
  setPayrollPeriodStatus,
  undoImportBatch,
  updateCommissionRecord,
  updateCommissionRule,
  buildCommissionReport,
  commissionReportToCsv,
  type CommissionListFilters,
  type CommissionReportType,
  type CommentableField,
  type ResolutionCode
} from "@/lib/staff/commission-ledger";
import { centsToDisplay, sanitizeCsvCell } from "@/lib/staff/commission-ledger/money";
import { normalizeCommissionDateFilter } from "@/lib/staff/commission-ledger/dates";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
/** Headroom so the diagnostics report can never be cut off by a 504. */
export const maxDuration = 30;

/** Fast ledger page: 25 rows, under the browser abort. */
const COMMISSIONS_QUERY_TIMEOUT_MS = 5_000;
const COMMISSIONS_OPTIONAL_TIMEOUT_MS = 1_200;
const LEDGER_CACHE_TTL_MS = 60_000;

function buildViewer(
  session: ReturnType<typeof getAdminSessionFromRequest>,
  access: Awaited<ReturnType<typeof getUserAccess>> | null,
  canManage: boolean,
  canComment: boolean
) {
  const roleKey = legacyRoleToRoleKey(session?.role ?? null);
  const isSuperAdmin =
    hasRole(access, "super_admin") || session?.role === "owner_admin" || roleKey === "super_admin";
  const isTrainerOnly =
    !canManage &&
    (session?.role === "trainer" || hasRole(access, "trainer") || roleKey === "trainer");

  return {
    role: session?.role ?? null,
    roleKey,
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    canManage,
    canComment,
    isSuperAdmin,
    isTrainerOnly
  };
}

function actorFrom(session: ReturnType<typeof getAdminSessionFromRequest>, displayName?: string | null) {
  return {
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    name: (displayName?.trim() || session?.email) ?? null,
    role: session?.role ?? null,
    roleKey: legacyRoleToRoleKey(session?.role ?? null)
  };
}

async function resolveAccess(request: Request, options: { liveMatrix?: boolean } = {}) {
  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  const fallbackAccess = accessFromLegacyRole(session?.adminUserId ?? null, session?.email ?? null, session?.role);
  const supabase = getServiceSupabase({
    timeoutMs: options.liveMatrix ? SERVICE_SUPABASE_TIMEOUT_MS : COMMISSIONS_QUERY_TIMEOUT_MS
  });

  // Cookie role already authorizes Super Admin / trainers. The live permission
  // matrix was an extra 8s REST wait before the first ledger row query.
  const access =
    options.liveMatrix && session?.adminUserId
      ? await withTimeoutFallback(
          getUserAccess(supabase, session.adminUserId, session.role, session.email),
          2_500,
          fallbackAccess
        )
      : fallbackAccess;
  const displayName = options.liveMatrix
    ? await withTimeoutFallback(resolveSessionDisplayName(supabase, session), 1_200, session?.email ?? null)
    : session?.email ?? null;

  const canView =
    canViewPackageCommissions(role) ||
    hasPermission(access, "view_package_commissions") ||
    hasPermission(access, "manage_package_commissions");
  const canManage =
    canManagePackageCommissions(role) ||
    hasPermission(access, "manage_package_commissions") ||
    hasRole(access, "super_admin") ||
    hasRole(access, "admin");
  const canComment =
    role === "trainer" || hasPermission(access, "comment_package_commissions") || canManage;

  return {
    session,
    role,
    supabase,
    access,
    canView,
    canManage,
    canComment,
    actor: actorFrom(session, displayName)
  };
}

function parseListFilters(url: URL): CommissionListFilters {
  const getList = (key: string) => {
    const all = url.searchParams.getAll(key);
    if (all.length) return all;
    const single = url.searchParams.get(key);
    return single ? single.split(",").map((v) => v.trim()).filter(Boolean) : undefined;
  };

  const allowedDateFields = new Set([
    "sale_date",
    "service_date",
    "created_at",
    "confirmed_at",
    "paid_at"
  ]);
  const rawDateField = url.searchParams.get("dateField");
  const dateField = allowedDateFields.has(rawDateField ?? "")
    ? (rawDateField as CommissionListFilters["dateField"])
    : "sale_date";

  return {
    q: url.searchParams.get("q") ?? undefined,
    trainerIds: getList("trainerIds") ?? getList("trainer"),
    dateField,
    dateFrom: normalizeCommissionDateFilter(url.searchParams.get("dateFrom") ?? undefined),
    dateTo: normalizeCommissionDateFilter(url.searchParams.get("dateTo") ?? undefined),
    reviewStatus: getList("reviewStatus") as CommissionListFilters["reviewStatus"],
    approvalStatus: getList("approvalStatus") as CommissionListFilters["approvalStatus"],
    paymentStatus: getList("paymentStatus") as CommissionListFilters["paymentStatus"],
    refundStatus: getList("refundStatus") as CommissionListFilters["refundStatus"],
    commissionTypes: getList("commissionTypes") as CommissionListFilters["commissionTypes"],
    client: url.searchParams.get("client") ?? undefined,
    dog: url.searchParams.get("dog") ?? undefined,
    packageOrClass: url.searchParams.get("packageOrClass") ?? undefined,
    importBatchId: url.searchParams.get("importBatchId") ?? undefined,
    payrollPeriodId: url.searchParams.get("payrollPeriodId") ?? undefined,
    source: getList("source") as CommissionListFilters["source"],
    hasOpenComments:
      url.searchParams.get("hasOpenComments") === "1"
        ? true
        : url.searchParams.get("hasOpenComments") === "0"
          ? false
          : undefined,
    missingRequired: url.searchParams.get("missingRequired") === "1" ? true : undefined,
    possibleDuplicate: url.searchParams.get("possibleDuplicate") === "1" ? true : undefined,
    page: Number(url.searchParams.get("page") ?? 1),
    pageSize:
      url.searchParams.get("pageSize") === "all"
        ? 25
        : Math.min(25, Math.max(10, Number(url.searchParams.get("pageSize") ?? 25))),
    sortBy: url.searchParams.get("sortBy") ?? "sale_date",
    sortDir: (url.searchParams.get("sortDir") as "asc" | "desc") ?? "desc"
  };
}

function emptyLedgerResult(filters: CommissionListFilters) {
  return {
    rows: [],
    total: 0,
    page: Math.max(1, filters.page ?? 1),
    pageSize: Math.min(5000, Math.max(10, filters.pageSize ?? 25)),
    summary: {
      grossSalesCents: 0,
      totalCommissionsCents: 0,
      pendingReviewCents: 0,
      approvedCents: 0,
      readyForPayrollCents: 0,
      paidCents: 0,
      refundedCents: 0,
      openQuestions: 0
    }
  };
}

function ledgerPayload(
  result: {
    rows: unknown[];
    total: number;
    page: number;
    pageSize: number;
    summary: {
      grossSalesCents: number;
      totalCommissionsCents: number;
      pendingReviewCents: number;
      approvedCents: number;
      readyForPayrollCents: number;
      paidCents: number;
      refundedCents: number;
      openQuestions: number;
    };
  },
  extras: {
    trainers: Awaited<ReturnType<typeof listCommissionTrainersFromDb>>;
    session: ReturnType<typeof getAdminSessionFromRequest>;
    role: string | null | undefined;
    viewer: ReturnType<typeof buildViewer>;
    canManage: boolean;
    canComment: boolean;
    delayed?: boolean;
    delayedReason?: string;
  }
) {
  return {
    ...result,
    delayed: Boolean(extras.delayed),
    delayedReason: extras.delayedReason ?? null,
    trainers: extras.trainers,
    currentUser: {
      email: extras.session?.email ?? null,
      adminUserId: extras.session?.adminUserId ?? null,
      role: extras.role ?? null,
      roleKey: extras.viewer.roleKey,
      isTrainerOnly: extras.viewer.isTrainerOnly,
      isSuperAdmin: extras.viewer.isSuperAdmin
    },
    canManage: extras.canManage,
    canComment: extras.canComment
  };
}

function capLedgerFilters(filters: CommissionListFilters, fast: boolean): CommissionListFilters {
  const next: CommissionListFilters = {
    ...filters,
    pageSize: Math.min(25, Math.max(10, filters.pageSize ?? 25))
  };
  if (fast) {
    next.dateFrom = undefined;
    next.dateTo = undefined;
    next.q = undefined;
  }
  return next;
}

async function loadCommissionSubtabList<T>(
  viaPostgres: (() => Promise<T[]>) | null,
  viaRest: () => Promise<T[]>
): Promise<{ rows: T[]; delayed: boolean }> {
  if (viaPostgres) {
    try {
      return { rows: await viaPostgres(), delayed: false };
    } catch (error) {
      console.warn(
        JSON.stringify({
          scope: "commissions",
          event: "subtab_postgres_delayed",
          reason: humanizeUnknownError(error, "postgres")
        })
      );
    }
  }
  try {
    return { rows: await viaRest(), delayed: false };
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "commissions",
        event: "subtab_rest_delayed",
        reason: humanizeUnknownError(error, "rest")
      })
    );
    return { rows: [], delayed: true };
  }
}

async function loadLedgerList(viewer: ReturnType<typeof buildViewer>, filters: CommissionListFilters) {
  const cacheKey = [
    "commissions:ledger",
    viewer.isTrainerOnly ? viewer.adminUserId ?? viewer.email ?? "trainer" : "all",
    filters.page ?? 1,
    filters.pageSize ?? 25,
    filters.dateFrom ?? "",
    filters.dateTo ?? "",
    (filters.reviewStatus ?? []).join(","),
    (filters.approvalStatus ?? []).join(","),
    (filters.trainerIds ?? []).join(",")
  ].join(":");
  const cached = getTtlCache<Awaited<ReturnType<typeof listCommissionRecordsViaRest>>>(cacheKey);
  const errors: string[] = [];

  if (canListCommissionsViaPostgres()) {
    try {
      const result = await listCommissionRecordsViaPostgres(viewer, filters);
      setTtlCache(cacheKey, result, LEDGER_CACHE_TTL_MS);
      return { delayed: false as const, delayedReason: undefined as string | undefined, result };
    } catch (error) {
      errors.push(humanizeUnknownError(error, "postgres"));
    }
  }

  try {
    const result = await listCommissionRecordsViaRest(viewer, filters, COMMISSIONS_QUERY_TIMEOUT_MS);
    setTtlCache(cacheKey, result, LEDGER_CACHE_TTL_MS);
    return { delayed: false as const, delayedReason: undefined as string | undefined, result };
  } catch (error) {
    errors.push(humanizeUnknownError(error, "Commission ledger is delayed."));
  }

  if (cached) {
    return { delayed: false as const, delayedReason: undefined as string | undefined, result: cached };
  }

  return {
    delayed: true as const,
    delayedReason: errors.filter(Boolean).join(" · ") || "Commission ledger is delayed.",
    result: emptyLedgerResult(filters)
  };
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, role, supabase, access, canView, canManage, canComment } = await resolveAccess(request);
  if (!canView) {
    return NextResponse.json({ error: "You do not have permission to view package commissions." }, { status: 403 });
  }

  const viewer = buildViewer(session, access, canManage, canComment);
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "ledger";
  const fast = url.searchParams.get("fast") === "1";
  const trainersPromise =
    canManage && (view === "rules" || view === "report")
      ? withTimeoutFallback(
          listCommissionTrainersFromDb(getServiceSupabase({ timeoutMs: COMMISSIONS_OPTIONAL_TIMEOUT_MS })),
          COMMISSIONS_OPTIONAL_TIMEOUT_MS,
          []
        )
      : Promise.resolve([]);
  const subtabSupabase = getServiceSupabase({ timeoutMs: COMMISSIONS_SUBTAB_QUERY_TIMEOUT_MS });

  try {
    if (view === "diagnostics") {
      if (!viewer.isSuperAdmin) {
        return NextResponse.json({ error: "Super Admin only." }, { status: 403 });
      }
      return NextResponse.json(await runLedgerDiagnostics(viewer));
    }

    if (view === "record") {
      const id = url.searchParams.get("id") ?? "";
      const record = await getCommissionRecord(supabase, viewer, id);
      const [threads, audit] = await Promise.all([
        listCommentThreads(supabase, id),
        listRecordAudit(supabase, id)
      ]);
      return NextResponse.json({ record, threads, audit, canManage, canComment, viewer });
    }

    if (view === "rules") {
      const [rulesResult, trainers] = await Promise.all([
        loadCommissionSubtabList(
          canListCommissionsViaPostgres() ? listCommissionRulesViaPostgres : null,
          () => listCommissionRules(subtabSupabase)
        ),
        trainersPromise
      ]);
      return NextResponse.json({
        rules: rulesResult.rows,
        canManage,
        trainers,
        delayed: rulesResult.delayed
      });
    }

    if (view === "payroll") {
      const { rows: periods, delayed } = await loadCommissionSubtabList(
        canListCommissionsViaPostgres() ? listPayrollPeriodsViaPostgres : null,
        () => listPayrollPeriods(subtabSupabase)
      );
      const periodId = url.searchParams.get("periodId");
      let summary = null;
      if (periodId && !delayed) {
        try {
          summary = await getPayrollPeriodSummary(subtabSupabase, periodId);
        } catch {
          /* keep the period list even if the optional summary times out */
        }
      }
      return NextResponse.json({
        periods,
        summary,
        canManage,
        isSuperAdmin: viewer.isSuperAdmin,
        delayed
      });
    }

    if (view === "imports") {
      const { rows: batches, delayed } = await loadCommissionSubtabList(
        canListCommissionsViaPostgres() ? listImportBatchesViaPostgres : null,
        () => listImportBatches(subtabSupabase)
      );
      return NextResponse.json({ batches, canManage, delayed });
    }

    if (view === "report") {
      const filters = parseListFilters(url);
      const [trainers, report] = await Promise.all([
        trainersPromise,
        buildCommissionReport(
          supabase,
          viewer,
          filters,
          (url.searchParams.get("reportType") ?? "trainer_statement") as CommissionReportType
        )
      ]);
      return NextResponse.json({ report, canManage, trainers });
    }

    const filters = capLedgerFilters(parseListFilters(url), fast);
    const [trainers, { delayed, delayedReason, result }] = await Promise.all([
      trainersPromise,
      loadLedgerList(viewer, filters)
    ]);
    if (delayed) {
      console.warn(
        JSON.stringify({
          scope: "commissions",
          event: "ledger_delayed",
          reason: delayedReason ?? null
        })
      );
    }

    return NextResponse.json(
      ledgerPayload(result, {
        trainers,
        session,
        role,
        viewer,
        canManage,
        canComment,
        delayed,
        delayedReason
      })
    );
  } catch (error) {
    const message = humanizeUnknownError(error, "Unable to load package commissions.");
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, supabase, access, canManage, canComment, canView, actor } = await resolveAccess(request, {
    liveMatrix: true
  });
  if (!canView) {
    return NextResponse.json({ error: "You do not have permission to view package commissions." }, { status: 403 });
  }

  const viewer = buildViewer(session, access, canManage, canComment);
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "create");

  try {
    if (action === "create") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const record = await createCommissionRecord(supabase, viewer, actor, body);
      return NextResponse.json({ ok: true, record });
    }

    if (action === "update") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const record = await updateCommissionRecord(supabase, viewer, actor, String(body.id ?? ""), body);
      return NextResponse.json({ ok: true, record });
    }

    if (action === "approve" || action === "reject" || action === "hold") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "on_hold";
      const record = await setApprovalStatus(
        supabase,
        viewer,
        actor,
        String(body.id ?? ""),
        status,
        body.reason != null ? String(body.reason) : undefined
      );
      return NextResponse.json({ ok: true, record });
    }

    if (action === "ready_for_payroll" || action === "mark_paid" || action === "void") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const status = action === "ready_for_payroll" ? "ready_for_payroll" : action === "mark_paid" ? "paid" : "voided";
      const record = await setPaymentStatus(
        supabase,
        viewer,
        actor,
        String(body.id ?? ""),
        status,
        body.reason != null ? String(body.reason) : undefined
      );
      return NextResponse.json({ ok: true, record });
    }

    if (action === "bulk") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const result = await bulkUpdateCommissionRecords(
        supabase,
        viewer,
        actor,
        ids,
        String(body.bulk_action ?? ""),
        body
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "delete") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      await deleteCommissionRecord(supabase, viewer, actor, String(body.id ?? ""), String(body.reason ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "purge_duplicates") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const result = await purgeRejectedDuplicateCommissions(supabase, actor, { allTrainers: true });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "refund") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const result = await createRefundAdjustment(supabase, viewer, actor, {
        original_record_id: String(body.original_record_id ?? ""),
        amount: body.amount,
        reason: String(body.reason ?? ""),
        refund_date: body.refund_date != null ? String(body.refund_date) : null,
        external_reference: body.external_reference != null ? String(body.external_reference) : null,
        payroll_period_id: body.payroll_period_id != null ? String(body.payroll_period_id) : null
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "comment_cell") {
      if (!canComment) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const thread = await createCellComment(supabase, viewer, actor, {
        recordId: String(body.record_id ?? ""),
        fieldName: String(body.field_name ?? "") as CommentableField,
        body: String(body.body ?? "")
      });
      return NextResponse.json({ ok: true, thread });
    }

    if (action === "comment_reply") {
      if (!canComment) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      await replyToCommentThread(supabase, viewer, actor, String(body.thread_id ?? ""), String(body.body ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "comment_resolve") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      await resolveCommentThread(supabase, viewer, actor, String(body.thread_id ?? ""), {
        resolutionCode: String(body.resolution_code ?? "other") as ResolutionCode,
        resolutionNote: String(body.resolution_note ?? "")
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "comment_reopen") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      await reopenCommentThread(supabase, viewer, actor, String(body.thread_id ?? ""), String(body.note ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "import_csv") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const mutationSupabase = getServiceSupabase({ timeoutMs: COMMISSIONS_MUTATION_TIMEOUT_MS });
      try {
        let trainers: Awaited<ReturnType<typeof listCommissionTrainersFromDb>> = [];
        try {
          trainers = await listCommissionTrainersFromDb(
            getServiceSupabase({ timeoutMs: COMMISSIONS_OPTIONAL_TIMEOUT_MS })
          );
        } catch {
          trainers = [];
        }
        const result = await importCommissionCsvToLedger(mutationSupabase, viewer, actor, {
          csvText: String(body.csv ?? ""),
          filename: body.filename != null ? String(body.filename) : "upload.csv",
          trainers,
          dryRun: body.dry_run === true
        });
        try {
          await writeAdminAuditLog({
            actorAdminId: session?.adminUserId ?? null,
            actorEmail: session?.email ?? null,
            action: "staff.package_commissions.import",
            targetType: "package_commissions",
            details: {
              imported: result.imported,
              failed: result.failed,
              batchId: result.batchId,
              timedOut: Boolean(result.timedOut)
            }
          });
        } catch {
          // Import already persisted; do not fail the browser response for audit.
        }
        return NextResponse.json({
          ok: !result.timedOut,
          ...result,
          rows: result.records,
          created: result.imported,
          imported: result.imported,
          failed: result.failed,
          errors: result.errors,
          timedOut: Boolean(result.timedOut),
          ...(result.timedOut ? { error: COMMISSIONS_IMPORT_SLOW_MESSAGE } : {})
        });
      } catch (error) {
        if (isTimeoutLikeError(error)) {
          return NextResponse.json(
            {
              ok: false,
              error: COMMISSIONS_IMPORT_SLOW_MESSAGE,
              imported: 0,
              failed: 0,
              duplicates: 0,
              timedOut: true
            },
            { status: 503 }
          );
        }
        throw error;
      }
    }

    if (action === "undo_import") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const result = await undoImportBatch(supabase, viewer, actor, String(body.batch_id ?? ""));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "export_csv") {
      const filters = (body.filters ?? {}) as CommissionListFilters;
      if (body.report_type) {
        const report = await buildCommissionReport(
          supabase,
          viewer,
          filters,
          String(body.report_type) as CommissionReportType
        );
        return NextResponse.json({ ok: true, csv: commissionReportToCsv(report), report });
      }
      const result = await listCommissionRecords(supabase, viewer, {
        ...filters,
        page: 1,
        pageSize: 5000
      });
      const csv = [
        [
          "status_approval",
          "status_payment",
          "status_review",
          "trainer",
          "sale_date",
          "service_date",
          "client",
          "dog",
          "type",
          "package_or_class",
          "quantity",
          "gross",
          "discount",
          "refund",
          "rate",
          "calculated",
          "final",
          "source",
          "payroll_period_id"
        ].join(","),
        ...result.rows.map((row) =>
          [
            row.approval_status,
            row.payment_status,
            row.review_status,
            row.trainer_name,
            row.sale_date ?? "",
            row.service_date ?? "",
            row.client_name,
            row.dog_name,
            row.commission_type,
            row.package_or_class,
            row.quantity,
            centsToDisplay(row.gross_amount_cents),
            centsToDisplay(row.discount_amount_cents),
            centsToDisplay(row.refund_amount_cents),
            row.commission_rate_bps != null ? (row.commission_rate_bps / 100).toFixed(2) + "%" : "",
            centsToDisplay(row.calculated_commission_cents),
            centsToDisplay(row.final_commission_cents),
            row.source,
            row.payroll_period_id ?? ""
          ]
            .map((value) => `"${sanitizeCsvCell(value).replace(/"/g, '""')}"`)
            .join(",")
        )
      ].join("\n");
      return NextResponse.json({ ok: true, csv });
    }

    if (action === "payroll_create") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const period = await createPayrollPeriod(supabase, viewer, actor, {
        name: String(body.name ?? ""),
        start_date: String(body.start_date ?? ""),
        end_date: String(body.end_date ?? ""),
        payment_date: body.payment_date != null ? String(body.payment_date) : null,
        notes: body.notes != null ? String(body.notes) : null
      });
      return NextResponse.json({ ok: true, period });
    }

    if (action === "payroll_status") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const period = await setPayrollPeriodStatus(
        supabase,
        viewer,
        actor,
        String(body.id ?? ""),
        String(body.status ?? "") as never,
        body.reason != null ? String(body.reason) : undefined
      );
      return NextResponse.json({ ok: true, period });
    }

    if (action === "statement_ack") {
      await acknowledgeTrainerStatement(supabase, viewer, String(body.payroll_period_id ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "rule_create") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const rule = await createCommissionRule(supabase, viewer, actor, body as never);
      return NextResponse.json({ ok: true, rule });
    }

    if (action === "rule_update") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const rule = await updateCommissionRule(supabase, viewer, actor, String(body.id ?? ""), body as never);
      return NextResponse.json({ ok: true, rule });
    }

    if (action === "rule_delete") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      await deleteCommissionRule(supabase, viewer, actor, String(body.id ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (action === "rule_preview") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const cents = previewCommissionRule(body as never);
      return NextResponse.json({ ok: true, cents, display: centsToDisplay(cents) });
    }

    // Legacy compat: confirm / set_status / mark_paid / comment
    if (action === "confirm") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const record = await setApprovalStatus(supabase, viewer, actor, String(body.id ?? ""), "approved");
      return NextResponse.json({ ok: true, row: record, record });
    }

    if (action === "set_status") {
      if (!canManage) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      const status = String(body.status ?? "");
      if (status === "Paid") {
        const record = await setPaymentStatus(supabase, viewer, actor, String(body.id ?? ""), "paid");
        return NextResponse.json({ ok: true, row: record, record });
      }
      if (status === "Approved") {
        const record = await setApprovalStatus(supabase, viewer, actor, String(body.id ?? ""), "approved");
        return NextResponse.json({ ok: true, row: record, record });
      }
      return NextResponse.json({ error: "Use approve/reject/hold/mark_paid actions." }, { status: 400 });
    }

    if (action === "comment") {
      // Legacy row comment → cell comment on final_commission
      const thread = await createCellComment(supabase, viewer, actor, {
        recordId: String(body.row_id ?? body.record_id ?? ""),
        fieldName: "final_commission",
        body: String(body.body ?? "")
      });
      return NextResponse.json({ ok: true, thread });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = humanizeUnknownError(error, "Unable to update package commissions.");
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
