type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { withTimeoutFallback } from "@/lib/server-ttl-cache";
import { assertCanManage, assertNotManagementDestructive, trainerOwnsRecord } from "./auth";
import { writeCommissionAudit } from "./audit";
import { mapDbRecord, computeMissingRequired } from "./map";
import { normalizeCommissionDateFilter, parseCommissionDate } from "./dates";
import { trainerRateBpsForPackage } from "./location-rate";
import { calculatePercentCommissionCents, parseMoneyToCents, parsePercentToBps } from "./money";
import { namesMatchCaseInsensitive, commissionDedupeKey } from "./dedupe";
import type {
  ApprovalStatus,
  CommissionActor,
  CommissionListFilters,
  CommissionListResult,
  CommissionSummary,
  CommissionType,
  CommissionViewer,
  PackageCommissionRecord,
  PaymentStatus,
  ReviewStatus
} from "./types";

export const LEDGER_SORTABLE_COLUMNS: Record<string, string> = {
  sale_date: "sale_date",
  service_date: "service_date",
  trainer_name: "trainer_name",
  client_name: "client_name",
  dog_name: "dog_name",
  package_or_class: "package_or_class",
  gross_amount_cents: "gross_amount_cents",
  final_commission_cents: "final_commission_cents",
  // Source column shows Gingr/APP transaction links
  source: "gingr_transaction_url",
  gingr_transaction_url: "gingr_transaction_url",
  approval_status: "approval_status",
  payment_status: "payment_status",
  review_status: "review_status",
  updated_at: "updated_at",
  created_at: "created_at"
};

function emptySummary(): CommissionSummary {
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

async function loadSummary(
  supabase: SupabaseClient,
  filters: CommissionListFilters,
  viewer: CommissionViewer
): Promise<CommissionSummary> {
  let q = applyListFilters(
    supabase
      .from("package_commission_records")
      .select(
        "gross_amount_cents, final_commission_cents, review_status, approval_status, payment_status, refund_amount_cents, has_open_comments"
      ),
    filters,
    viewer
  ).limit(10_000);
  const { data, error } = await q;
  if (error) return emptySummary();
  const summary = emptySummary();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const r = row;
    const gross = Number(r.gross_amount_cents ?? 0);
    const final = Number(r.final_commission_cents ?? 0);
    summary.grossSalesCents += gross;
    summary.totalCommissionsCents += final;
    if (r.review_status === "needs_review" || r.review_status === "disputed") {
      summary.pendingReviewCents += final;
    }
    if (r.approval_status === "approved") summary.approvedCents += final;
    if (r.payment_status === "ready_for_payroll") summary.readyForPayrollCents += final;
    if (r.payment_status === "paid") summary.paidCents += final;
    summary.refundedCents += Number(r.refund_amount_cents ?? 0);
    if (r.has_open_comments) summary.openQuestions += 1;
  }
  return summary;
}

function applyListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: CommissionListFilters,
  viewer: CommissionViewer
) {
  let q = query;
  if (!filters.includeArchived) {
    q = q.is("archived_at", null);
  }
  if (viewer.isTrainerOnly) {
    if (viewer.adminUserId) {
      q = q.eq("trainer_user_id", viewer.adminUserId);
    } else if (viewer.email) {
      q = q.ilike("trainer_email", viewer.email);
    } else {
      q = q.eq("trainer_user_id", "00000000-0000-0000-0000-000000000000");
    }
  }
  if (filters.trainerIds?.length || filters.trainerNames?.length) {
    const parts: string[] = [];
    if (filters.trainerIds?.length) {
      parts.push(`trainer_user_id.in.(${filters.trainerIds.join(",")})`);
    }
    for (const name of filters.trainerNames ?? []) {
      parts.push(`trainer_name.ilike.%${name.replace(/,/g, "").trim()}%`);
    }
    if (parts.length === 1 && filters.trainerIds?.length && !(filters.trainerNames?.length)) {
      q = q.in("trainer_user_id", filters.trainerIds);
    } else if (parts.length > 0) {
      q = q.or(parts.join(","));
    }
  }
  const requestedDateField = filters.dateField ?? "sale_date";
  const dateField = (
    requestedDateField === "sale_date" ||
    requestedDateField === "service_date" ||
    requestedDateField === "created_at" ||
    requestedDateField === "confirmed_at" ||
    requestedDateField === "paid_at"
      ? requestedDateField
      : "sale_date"
  );
  const dateFrom = normalizeCommissionDateFilter(filters.dateFrom);
  const dateTo = normalizeCommissionDateFilter(filters.dateTo);
  // Filter the chosen date column only. OR(sale_date, service_date) cannot use
  // package_commission_records_sale_date_idx and was aborting the 3s ledger GET.
  if (dateFrom) q = q.gte(dateField, dateFrom);
  if (dateTo) q = q.lte(dateField, dateTo);
  if (filters.reviewStatus?.length) q = q.in("review_status", filters.reviewStatus);
  if (filters.approvalStatus?.length) q = q.in("approval_status", filters.approvalStatus);
  if (filters.paymentStatus?.length) q = q.in("payment_status", filters.paymentStatus);
  if (filters.refundStatus?.length) q = q.in("refund_status", filters.refundStatus);
  if (filters.commissionTypes?.length) q = q.in("commission_type", filters.commissionTypes);
  if (filters.source?.length) q = q.in("source", filters.source);
  if (filters.client) q = q.ilike("client_name", `%${filters.client}%`);
  if (filters.dog) q = q.ilike("dog_name", `%${filters.dog}%`);
  if (filters.packageOrClass) q = q.ilike("package_or_class", `%${filters.packageOrClass}%`);
  if (filters.importBatchId) q = q.eq("import_batch_id", filters.importBatchId);
  if (filters.payrollPeriodId) q = q.eq("payroll_period_id", filters.payrollPeriodId);
  if (filters.hasOpenComments) q = q.eq("has_open_comments", true);
  if (filters.missingRequired) q = q.eq("missing_required_info", true);
  if (filters.possibleDuplicate) q = q.eq("is_possible_duplicate", true);
  if (filters.q?.trim()) {
    const term = filters.q.trim();
    q = q.or(
      `client_name.ilike.%${term}%,dog_name.ilike.%${term}%,package_or_class.ilike.%${term}%,trainer_name.ilike.%${term}%,external_transaction_id.ilike.%${term}%`
    );
  }
  return q;
}

export const LEDGER_LIST_COLUMNS =
  "id, trainer_user_id, trainer_name, trainer_email, sale_date, service_date, client_name, dog_name, commission_type, package_or_class, quantity, gross_amount_cents, discount_amount_cents, refund_amount_cents, commission_rate_bps, calculated_commission_cents, final_commission_cents, review_status, approval_status, payment_status, refund_status, source, gingr_transaction_url, has_open_comments, is_possible_duplicate, missing_required_info, payroll_period_id, archived_at, created_at, updated_at";

export type ListCommissionRecordsOptions = {
  /** 10k-row totals scan. Off for the interactive ledger so first paint is one page query. */
  includeSummary?: boolean;
};

export async function listCommissionRecords(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  filters: CommissionListFilters = {},
  options: ListCommissionRecordsOptions = {}
): Promise<CommissionListResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(5000, Math.max(10, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = LEDGER_SORTABLE_COLUMNS[filters.sortBy ?? "sale_date"] ?? "sale_date";
  const ascending = (filters.sortDir ?? "desc") === "asc";

  const dataQuery = applyListFilters(
    supabase.from("package_commission_records").select(LEDGER_LIST_COLUMNS),
    filters,
    viewer
  )
    .order(sortBy, { ascending, nullsFirst: false })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => mapDbRecord(row));
  // Exact COUNT(*) is a second REST round-trip that was hanging the tab. Infer
  // enough for Next/Previous: a full page means there is at least one more row.
  const inferredTotal = rows.length < pageSize ? from + rows.length : from + pageSize + 1;

  let summary = emptySummary();
  if (options.includeSummary) {
    summary = await withTimeoutFallback(loadSummary(supabase, filters, viewer), 1_200, emptySummary());
  }

  return {
    rows,
    total: inferredTotal,
    page,
    pageSize,
    summary
  };
}

export async function getCommissionRecord(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  id: string
) {
  const { data, error } = await supabase.from("package_commission_records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Commission record not found.");
  const record = mapDbRecord(data as Record<string, unknown>);
  if (viewer.isTrainerOnly && !trainerOwnsRecord(record, viewer)) {
    throw new Error("Commission record not found.");
  }
  return record;
}

export type CreateCommissionInput = {
  trainer_user_id?: string | null;
  trainer_name?: string;
  trainer_email?: string | null;
  sale_date?: string | null;
  service_date?: string | null;
  client_name?: string;
  dog_name?: string;
  commission_type?: CommissionType;
  package_or_class?: string;
  quantity?: number;
  gross_amount?: unknown;
  discount_amount?: unknown;
  refund_amount?: unknown;
  commission_rate?: unknown;
  final_commission?: unknown;
  calculated_commission?: unknown;
  is_manual_override?: boolean;
  override_reason?: string | null;
  gingr_transaction_url?: string;
  external_transaction_id?: string | null;
  internal_notes?: string | null;
  source?: PackageCommissionRecord["source"];
  import_batch_id?: string | null;
  rule_id?: string | null;
  rule_snapshot?: Record<string, unknown> | null;
  /** When false (default for sales), reject same-day duplicates. */
  allow_duplicate?: boolean;
};

export async function createCommissionRecord(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: CreateCommissionInput
) {
  assertCanManage(viewer);

  const trainerName = String(input.trainer_name ?? "").trim() || "Unassigned";
  const packageOrClass = String(input.package_or_class ?? "").trim();
  const client = String(input.client_name ?? "").trim();
  const dog = String(input.dog_name ?? "").trim();
  if (!client) throw new Error("Client name is required.");
  if (!dog) throw new Error("Dog name is required.");
  if (!packageOrClass) throw new Error("Package or class is required.");

  const gross = parseMoneyToCents(input.gross_amount);
  const discount = parseMoneyToCents(input.discount_amount);
  const refund = parseMoneyToCents(input.refund_amount);
  const isOverride = Boolean(input.is_manual_override);
  const locationBps = trainerRateBpsForPackage(packageOrClass);
  const parsedRate = parsePercentToBps(input.commission_rate);
  // Policy split by location unless a manual override supplies an explicit rate.
  const rateBps = isOverride && parsedRate != null ? parsedRate : locationBps;
  const calculated =
    isOverride && input.calculated_commission != null
      ? parseMoneyToCents(input.calculated_commission)
      : calculatePercentCommissionCents(Math.max(0, gross - discount), rateBps);
  const final =
    isOverride && input.final_commission != null ? parseMoneyToCents(input.final_commission) : calculated;
  if (isOverride && !String(input.override_reason ?? "").trim()) {
    throw new Error("Override reason is required when changing calculated commission.");
  }

  const saleDate = parseCommissionDate(input.sale_date);
  const serviceDate = parseCommissionDate(input.service_date) ?? saleDate;
  if (!saleDate) throw new Error("Sale date is required.");

  const commissionType = input.commission_type ?? "package_sale";
  const skipDedupe =
    Boolean(input.allow_duplicate) ||
    commissionType === "adjustment" ||
    commissionType === "refund_reversal" ||
    commissionType === "bonus";

  if (!skipDedupe) {
    let dupQuery = supabase
      .from("package_commission_records")
      .select("id, trainer_name, trainer_user_id, client_name, dog_name, package_or_class")
      .eq("sale_date", saleDate)
      .is("archived_at", null)
      .limit(40);
    if (input.trainer_user_id) {
      dupQuery = dupQuery.eq("trainer_user_id", input.trainer_user_id);
    }
    const { data: dupes, error: dupError } = await dupQuery;
    if (dupError) throw new Error(dupError.message);
    const hit = (dupes ?? []).find((row) => {
      const trainerOk = input.trainer_user_id
        ? String(row.trainer_user_id ?? "") === input.trainer_user_id
        : namesMatchCaseInsensitive(String(row.trainer_name ?? ""), trainerName);
      return (
        trainerOk &&
        namesMatchCaseInsensitive(String(row.client_name ?? ""), client) &&
        namesMatchCaseInsensitive(String(row.dog_name ?? ""), dog) &&
        namesMatchCaseInsensitive(String(row.package_or_class ?? ""), packageOrClass)
      );
    });
    if (hit) {
      throw new Error(
        "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
      );
    }
  }

  const warnings = computeMissingRequired({
    trainer_name: trainerName,
    trainer_user_id: input.trainer_user_id ?? null,
    sale_date: saleDate,
    package_or_class: packageOrClass,
    gross_amount_cents: gross,
    commission_rate_bps: rateBps,
    final_commission_cents: final
  });

  const payload = {
    trainer_user_id: input.trainer_user_id ?? null,
    trainer_name: trainerName,
    trainer_email: input.trainer_email ?? null,
    sale_date: saleDate,
    service_date: serviceDate,
    client_name: client,
    dog_name: dog,
    commission_type: commissionType,
    package_or_class: packageOrClass,
    quantity: Number(input.quantity ?? 1),
    gross_amount_cents: gross,
    discount_amount_cents: discount,
    refund_amount_cents: refund,
    commission_rate_bps: rateBps,
    calculated_commission_cents: calculated,
    final_commission_cents: final,
    review_status: warnings.length ? "needs_review" : "reviewed",
    approval_status: "pending",
    payment_status: "unpaid",
    refund_status: refund > 0 ? (refund >= final ? "full" : "partial") : "none",
    source: input.source ?? "manual",
    gingr_transaction_url: String(input.gingr_transaction_url ?? ""),
    external_transaction_id: input.external_transaction_id ?? null,
    import_batch_id: input.import_batch_id ?? null,
    rule_id: input.rule_id ?? null,
    rule_snapshot: input.rule_snapshot ?? null,
    calculation_input: {
      gross_cents: gross,
      discount_cents: discount,
      rate_bps: rateBps,
      location_split: true
    },
    is_manual_override: isOverride,
    override_reason: isOverride ? String(input.override_reason) : null,
    override_by: isOverride ? actor.adminUserId ?? null : null,
    missing_required_info: warnings.length > 0,
    validation_warnings: warnings,
    internal_notes: input.internal_notes ?? null,
    created_by: actor.adminUserId ?? null
  };

  const { data, error } = await supabase.from("package_commission_records").insert(payload).select("*").single();
  if (error) {
    if (/same_day_dedupe|duplicate key|unique constraint/i.test(error.message)) {
      throw new Error(
        "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
      );
    }
    throw new Error(error.message);
  }
  const record = mapDbRecord(data as Record<string, unknown>);
  await writeCommissionAudit(supabase, {
    recordId: record.id,
    action: "record_created",
    actor,
    newValue: String(record.final_commission_cents)
  });
  return record;
}

export async function updateCommissionRecord(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  patch: CreateCommissionInput & { reason?: string }
) {
  assertCanManage(viewer);
  const existing = await getCommissionRecord(supabase, viewer, id);

  if (existing.payment_status === "paid") {
    if (!String(patch.reason ?? "").trim()) {
      throw new Error("A reason is required to edit a paid commission record. Prefer a refund/adjustment.");
    }
  }
  if (existing.approval_status === "approved" && !String(patch.reason ?? "").trim() && patch.final_commission != null) {
    throw new Error("A reason is required to edit an approved commission amount.");
  }

  // Locked payroll: no silent edits
  if (existing.payroll_period_id) {
    const { data: period } = await supabase
      .from("package_commission_payroll_periods")
      .select("status")
      .eq("id", existing.payroll_period_id)
      .maybeSingle();
    if (period?.status === "locked") {
      throw new Error("This record is in a locked payroll period. Create an adjustment instead.");
    }
  }

  const nextPackage = patch.package_or_class ?? existing.package_or_class;
  const nextGross =
    patch.gross_amount != null ? parseMoneyToCents(patch.gross_amount) : existing.gross_amount_cents;
  const nextDiscount =
    patch.discount_amount != null ? parseMoneyToCents(patch.discount_amount) : existing.discount_amount_cents;
  const isOverride = patch.is_manual_override ?? existing.is_manual_override;
  const locationBps = trainerRateBpsForPackage(nextPackage);
  const nextRate = isOverride
    ? patch.commission_rate != null
      ? parsePercentToBps(patch.commission_rate)
      : existing.commission_rate_bps
    : locationBps;
  const calculated =
    isOverride && patch.calculated_commission != null
      ? parseMoneyToCents(patch.calculated_commission)
      : nextRate != null
        ? calculatePercentCommissionCents(Math.max(0, nextGross - nextDiscount), nextRate)
        : existing.calculated_commission_cents;
  const final = isOverride
    ? patch.final_commission != null
      ? parseMoneyToCents(patch.final_commission)
      : existing.final_commission_cents
    : calculated;
  if (isOverride && patch.final_commission != null && !String(patch.override_reason ?? patch.reason ?? "").trim()) {
    throw new Error("Override reason is required.");
  }

  const nextSaleDate =
    patch.sale_date !== undefined ? parseCommissionDate(patch.sale_date) : parseCommissionDate(existing.sale_date);
  const nextServiceDate =
    patch.service_date !== undefined
      ? parseCommissionDate(patch.service_date)
      : parseCommissionDate(existing.service_date) ?? nextSaleDate;

  const updates: Record<string, unknown> = {
    trainer_user_id: patch.trainer_user_id !== undefined ? patch.trainer_user_id : existing.trainer_user_id,
    trainer_name: patch.trainer_name ?? existing.trainer_name,
    trainer_email: patch.trainer_email !== undefined ? patch.trainer_email : existing.trainer_email,
    sale_date: nextSaleDate,
    service_date: nextServiceDate,
    client_name: patch.client_name ?? existing.client_name,
    dog_name: patch.dog_name ?? existing.dog_name,
    commission_type: patch.commission_type ?? existing.commission_type,
    package_or_class: nextPackage,
    quantity: patch.quantity ?? existing.quantity,
    gross_amount_cents: nextGross,
    discount_amount_cents: nextDiscount,
    refund_amount_cents:
      patch.refund_amount != null ? parseMoneyToCents(patch.refund_amount) : existing.refund_amount_cents,
    commission_rate_bps: nextRate,
    calculated_commission_cents: calculated,
    final_commission_cents: final,
    is_manual_override: isOverride,
    override_reason: isOverride ? patch.override_reason ?? patch.reason ?? existing.override_reason : null,
    gingr_transaction_url: patch.gingr_transaction_url ?? existing.gingr_transaction_url,
    external_transaction_id:
      patch.external_transaction_id !== undefined
        ? patch.external_transaction_id
        : existing.external_transaction_id,
    internal_notes: patch.internal_notes !== undefined ? patch.internal_notes : existing.internal_notes
  };

  const warnings = computeMissingRequired({
    trainer_name: String(updates.trainer_name),
    trainer_user_id: updates.trainer_user_id as string | null,
    sale_date: updates.sale_date as string | null,
    package_or_class: String(updates.package_or_class),
    gross_amount_cents: nextGross,
    commission_rate_bps: nextRate,
    final_commission_cents: final
  });
  updates.missing_required_info = warnings.length > 0;
  updates.validation_warnings = warnings;

  const { data, error } = await supabase
    .from("package_commission_records")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeCommissionAudit(supabase, {
    recordId: id,
    action: "record_updated",
    reason: patch.reason ?? patch.override_reason ?? null,
    actor,
    oldValue: String(existing.final_commission_cents),
    newValue: String(final)
  });

  return mapDbRecord(data as Record<string, unknown>);
}

export async function setApprovalStatus(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  status: ApprovalStatus,
  reason?: string
) {
  assertCanManage(viewer);
  if ((status === "rejected" || status === "on_hold") && !String(reason ?? "").trim()) {
    throw new Error("A reason is required for rejection or hold.");
  }
  const existing = await getCommissionRecord(supabase, viewer, id);
  const updates: Record<string, unknown> = {
    approval_status: status,
    rejection_reason: status === "rejected" ? reason : existing.rejection_reason
  };
  if (status === "approved") {
    updates.review_status = "reviewed";
    updates.confirmed_at = new Date().toISOString();
    updates.confirmed_by = actor.adminUserId ?? null;
  }
  if (status === "rejected") updates.review_status = "rejected";
  if (status === "on_hold") updates.review_status = "needs_review";

  const { data, error } = await supabase
    .from("package_commission_records")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    recordId: id,
    action: `approval_${status}`,
    reason: reason ?? null,
    actor,
    oldValue: existing.approval_status,
    newValue: status
  });
  return mapDbRecord(data as Record<string, unknown>);
}

export async function setPaymentStatus(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  status: PaymentStatus,
  reason?: string
) {
  assertCanManage(viewer);
  if ((status === "voided" || status === "paid") && status === "voided" && !String(reason ?? "").trim()) {
    throw new Error("A reason is required to void a commission.");
  }
  const existing = await getCommissionRecord(supabase, viewer, id);
  if (existing.approval_status !== "approved" && status === "ready_for_payroll") {
    throw new Error("Only approved commissions can be marked ready for payroll.");
  }
  const updates: Record<string, unknown> = { payment_status: status };
  if (status === "paid") {
    updates.paid_at = new Date().toISOString();
    updates.paid_by = actor.adminUserId ?? null;
  }
  const { data, error } = await supabase
    .from("package_commission_records")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    recordId: id,
    action: `payment_${status}`,
    reason: reason ?? null,
    actor,
    oldValue: existing.payment_status,
    newValue: status
  });
  return mapDbRecord(data as Record<string, unknown>);
}

export async function bulkUpdateCommissionRecords(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  ids: string[],
  action: string,
  payload: Record<string, unknown> = {}
) {
  assertCanManage(viewer);
  if (!ids.length) throw new Error("Select at least one record.");
  const reason = payload.reason != null ? String(payload.reason) : undefined;
  const results: PackageCommissionRecord[] = [];
  const errors: { id: string; message: string }[] = [];

  for (const id of ids) {
    try {
      if (action === "approve") {
        results.push(await setApprovalStatus(supabase, viewer, actor, id, "approved", reason));
      } else if (action === "reject") {
        results.push(await setApprovalStatus(supabase, viewer, actor, id, "rejected", reason));
      } else if (action === "hold") {
        results.push(await setApprovalStatus(supabase, viewer, actor, id, "on_hold", reason));
      } else if (action === "mark_reviewed") {
        const { data, error } = await supabase
          .from("package_commission_records")
          .update({ review_status: "reviewed" satisfies ReviewStatus })
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const record = mapDbRecord(data as Record<string, unknown>);
        results.push(record);
        await writeCommissionAudit(supabase, {
          recordId: id,
          action: "review_marked",
          actor,
          reason: reason ?? null,
          newValue: "reviewed"
        });
      } else if (action === "ready_for_payroll") {
        results.push(await setPaymentStatus(supabase, viewer, actor, id, "ready_for_payroll", reason));
      } else if (action === "mark_paid") {
        results.push(await setPaymentStatus(supabase, viewer, actor, id, "paid", reason));
      } else if (action === "void") {
        results.push(await setPaymentStatus(supabase, viewer, actor, id, "voided", reason));
      } else if (action === "assign_payroll") {
        const periodId = String(payload.payroll_period_id ?? "");
        if (!periodId) throw new Error("Payroll period is required.");
        const { data, error } = await supabase
          .from("package_commission_records")
          .update({ payroll_period_id: periodId })
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        results.push(mapDbRecord(data as Record<string, unknown>));
      } else if (action === "archive") {
        assertNotManagementDestructive(viewer, "hard_archive");
        const { data, error } = await supabase
          .from("package_commission_records")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        results.push(mapDbRecord(data as Record<string, unknown>));
        await writeCommissionAudit(supabase, { recordId: id, action: "archived", actor, reason: reason ?? null });
      } else if (action === "delete") {
        await deleteCommissionRecord(supabase, viewer, actor, id, reason ?? "Deleted from ledger selection");
        // Deleted rows are gone — return a stub so callers can count successes.
        results.push({ id } as PackageCommissionRecord);
      } else {
        throw new Error(`Unsupported bulk action: ${action}`);
      }
    } catch (error) {
      errors.push({ id, message: error instanceof Error ? error.message : "Failed" });
    }
  }

  return { results, errors };
}

export async function deleteCommissionRecord(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  reason?: string
) {
  assertCanManage(viewer);
  assertNotManagementDestructive(viewer, "delete");
  if (!viewer.isSuperAdmin && viewer.roleKey !== "admin" && viewer.role !== "owner_admin" && viewer.role !== "manager_admin") {
    throw new Error("Only Admin or Super Admin can permanently delete commission records. Prefer archive.");
  }
  const existing = await getCommissionRecord(supabase, viewer, id);
  if (existing.payment_status === "paid") {
    throw new Error("Paid records cannot be deleted. Create a refund adjustment or archive.");
  }
  if (!String(reason ?? "").trim()) throw new Error("A reason is required to delete a commission record.");

  // Audit first — FK on audit.record_id rejects inserts after the row is gone.
  await writeCommissionAudit(supabase, {
    recordId: id,
    action: "record_deleted",
    reason: reason ?? null,
    actor,
    oldValue: JSON.stringify({
      final: existing.final_commission_cents,
      dog: existing.dog_name,
      client: existing.client_name,
      sale_date: existing.sale_date,
      trainer: existing.trainer_name
    })
  });

  const { error } = await supabase.from("package_commission_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Soft-archive duplicate ledger rows (same trainer + client + dog + class + date).
 * Keeps one active row per fingerprint (prefer paid → approved → non-rejected → oldest).
 */
export async function purgeRejectedDuplicateCommissions(
  supabase: SupabaseClient,
  actor: CommissionActor,
  options?: { trainerNameIncludes?: string; allTrainers?: boolean }
): Promise<{ archived: number; ids: string[] }> {
  const trainerFilter = options?.trainerNameIncludes?.trim().toLowerCase() ?? "";
  const allTrainers = Boolean(options?.allTrainers) || !trainerFilter;

  let query = supabase
    .from("package_commission_records")
    .select(
      "id, trainer_name, trainer_user_id, client_name, dog_name, package_or_class, sale_date, approval_status, review_status, payment_status, created_at"
    )
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (!allTrainers) {
    query = query.ilike("trainer_name", `%${trainerFilter}%`);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const groups = new Map<string, Array<(typeof rows)[number]>>();
  for (const row of rows ?? []) {
    const key = commissionDedupeKey({
      trainerName: String(row.trainer_name ?? ""),
      trainerUserId: row.trainer_user_id != null ? String(row.trainer_user_id) : null,
      clientName: String(row.client_name ?? ""),
      dogName: String(row.dog_name ?? ""),
      packageOrClass: String(row.package_or_class ?? ""),
      saleDate: String(row.sale_date ?? "").slice(0, 10)
    });
    if (!String(row.sale_date ?? "") || !String(row.dog_name ?? "").trim() || !String(row.package_or_class ?? "").trim()) {
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const toArchive: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const rank = (row: (typeof group)[number]) => {
        if (row.payment_status === "paid") return 0;
        if (row.approval_status === "approved") return 1;
        if (row.approval_status === "rejected" || row.review_status === "rejected") return 3;
        return 2;
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
    for (const dupe of sorted.slice(1)) {
      toArchive.push(String(dupe.id));
    }
  }

  if (!toArchive.length) return { archived: 0, ids: [] };

  const note = "Removed as duplicate same name/date/class entry.";
  // Chunk updates to avoid oversized IN lists
  for (let i = 0; i < toArchive.length; i += 100) {
    const chunk = toArchive.slice(i, i + 100);
    const { error: updateError } = await supabase
      .from("package_commission_records")
      .update({
        archived_at: new Date().toISOString(),
        is_possible_duplicate: true,
        internal_notes: note,
        updated_at: new Date().toISOString()
      })
      .in("id", chunk);
    if (updateError) throw new Error(updateError.message);
  }

  for (const id of toArchive) {
    await writeCommissionAudit(supabase, {
      recordId: id,
      action: "duplicate_removed",
      reason: note,
      actor,
      metadata: { trainer_filter: allTrainers ? "all" : trainerFilter, key: "name_date_class" }
    });
  }

  return { archived: toArchive.length, ids: toArchive };
}
