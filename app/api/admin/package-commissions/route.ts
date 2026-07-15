import { NextResponse } from "next/server";
import {
  canManagePackageCommissions,
  canViewPackageCommissions,
  isAdminRequest,
  unauthorizedAdminResponse
} from "@/lib/admin/api-auth";
import { getAdminSessionFromRequest } from "@/lib/admin/session";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { hasPermission, hasRole, legacyRoleToRoleKey } from "@/lib/admin/permissions";
import { getUserAccess } from "@/lib/admin/user-access";
import { listAdminUsers } from "@/lib/admin/users";
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
  listPayrollPeriods,
  listRecordAudit,
  previewCommissionRule,
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
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

function actorFrom(session: ReturnType<typeof getAdminSessionFromRequest>) {
  return {
    email: session?.email ?? null,
    adminUserId: session?.adminUserId ?? null,
    name: session?.email ?? null,
    role: session?.role ?? null,
    roleKey: legacyRoleToRoleKey(session?.role ?? null)
  };
}

async function resolveAccess(request: Request) {
  const session = getAdminSessionFromRequest(request);
  const role = session?.role;
  const supabase = getServiceSupabase();
  const access = session?.adminUserId
    ? await getUserAccess(supabase, session.adminUserId, session.role, session.email)
    : null;

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

  return { session, role, supabase, access, canView, canManage, canComment };
}

function parseListFilters(url: URL): CommissionListFilters {
  const getList = (key: string) => {
    const all = url.searchParams.getAll(key);
    if (all.length) return all;
    const single = url.searchParams.get(key);
    return single ? single.split(",").map((v) => v.trim()).filter(Boolean) : undefined;
  };

  return {
    q: url.searchParams.get("q") ?? undefined,
    trainerIds: getList("trainerIds") ?? getList("trainer"),
    dateField: (url.searchParams.get("dateField") as CommissionListFilters["dateField"]) ?? "sale_date",
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
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
    pageSize: Number(url.searchParams.get("pageSize") ?? 25),
    sortBy: url.searchParams.get("sortBy") ?? "sale_date",
    sortDir: (url.searchParams.get("sortDir") as "asc" | "desc") ?? "desc"
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

  try {
    const trainers = canManage
      ? (await listAdminUsers(supabase))
          .filter((user) => user.role === "trainer" && user.status !== "disabled")
          .map((user) => ({ id: user.id, full_name: user.full_name, email: user.email }))
      : [];

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
      const rules = await listCommissionRules(supabase);
      return NextResponse.json({ rules, canManage, trainers });
    }

    if (view === "payroll") {
      const periods = await listPayrollPeriods(supabase);
      const periodId = url.searchParams.get("periodId");
      const summary = periodId ? await getPayrollPeriodSummary(supabase, periodId) : null;
      return NextResponse.json({ periods, summary, canManage, isSuperAdmin: viewer.isSuperAdmin });
    }

    if (view === "imports") {
      const batches = await listImportBatches(supabase);
      return NextResponse.json({ batches, canManage });
    }

    if (view === "report") {
      const filters = parseListFilters(url);
      if (filters.trainerIds?.length && trainers.length) {
        filters.trainerNames = trainers
          .filter((trainer) => filters.trainerIds!.includes(trainer.id))
          .map((trainer) => trainer.full_name);
      }
      const reportType = (url.searchParams.get("reportType") ?? "trainer_statement") as CommissionReportType;
      const report = await buildCommissionReport(supabase, viewer, filters, reportType);
      return NextResponse.json({ report, canManage, trainers });
    }

    const filters = parseListFilters(url);
    if (filters.trainerIds?.length && trainers.length) {
      filters.trainerNames = trainers
        .filter((trainer) => filters.trainerIds!.includes(trainer.id))
        .map((trainer) => trainer.full_name);
    }
    const result = await listCommissionRecords(supabase, viewer, filters);

    return NextResponse.json({
      ...result,
      summaryDisplay: {
        grossSales: centsToDisplay(result.summary.grossSalesCents),
        totalCommissions: centsToDisplay(result.summary.totalCommissionsCents),
        pendingReview: centsToDisplay(result.summary.pendingReviewCents),
        approved: centsToDisplay(result.summary.approvedCents),
        readyForPayroll: centsToDisplay(result.summary.readyForPayrollCents),
        paid: centsToDisplay(result.summary.paidCents),
        refunded: centsToDisplay(result.summary.refundedCents),
        openQuestions: result.summary.openQuestions
      },
      trainers,
      currentUser: {
        email: session?.email ?? null,
        adminUserId: session?.adminUserId ?? null,
        role: role ?? null,
        roleKey: viewer.roleKey,
        isTrainerOnly: viewer.isTrainerOnly,
        isSuperAdmin: viewer.isSuperAdmin
      },
      canManage,
      canComment
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load package commissions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return unauthorizedAdminResponse();
  const { session, supabase, access, canManage, canComment, canView } = await resolveAccess(request);
  if (!canView) {
    return NextResponse.json({ error: "You do not have permission to view package commissions." }, { status: 403 });
  }

  const viewer = buildViewer(session, access, canManage, canComment);
  const actor = actorFrom(session);
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
      const trainers = (await listAdminUsers(supabase))
        .filter((user) => user.role === "trainer" && user.status !== "disabled")
        .map((user) => ({ id: user.id, full_name: user.full_name, email: user.email }));
      const result = await importCommissionCsvToLedger(supabase, viewer, actor, {
        csvText: String(body.csv ?? ""),
        filename: body.filename != null ? String(body.filename) : "upload.csv",
        trainers,
        dryRun: body.dry_run === true
      });
      await writeAdminAuditLog({
        actorAdminId: session?.adminUserId ?? null,
        actorEmail: session?.email ?? null,
        action: "staff.package_commissions.import",
        targetType: "package_commissions",
        details: { imported: result.imported, failed: result.failed, batchId: result.batchId }
      });
      return NextResponse.json({
        ok: true,
        ...result,
        rows: result.records,
        imported: result.imported,
        failed: result.failed
      });
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
    const message = error instanceof Error ? error.message : "Unable to update package commissions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
