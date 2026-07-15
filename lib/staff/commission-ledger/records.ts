type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage, assertNotManagementDestructive, trainerOwnsRecord } from "./auth";
import { writeCommissionAudit } from "./audit";
import { ensureCommissionLedgerBackfill } from "./backfill";
import { mapDbRecord, computeMissingRequired } from "./map";
import {
  calculatePercentCommissionCents,
  parseMoneyToCents,
  parsePercentToBps
} from "./money";
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

const SORTABLE: Record<string, string> = {
  sale_date: "sale_date",
  service_date: "service_date",
  trainer_name: "trainer_name",
  client_name: "client_name",
  dog_name: "dog_name",
  package_or_class: "package_or_class",
  gross_amount_cents: "gross_amount_cents",
  final_commission_cents: "final_commission_cents",
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
  const dateField = filters.dateField ?? "sale_date";
  if (filters.dateFrom) q = q.gte(dateField, filters.dateFrom);
  if (filters.dateTo) q = q.lte(dateField, filters.dateTo);
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

export async function listCommissionRecords(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  filters: CommissionListFilters = {}
): Promise<CommissionListResult> {
  await ensureCommissionLedgerBackfill(supabase);

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(5000, Math.max(10, filters.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sortBy = SORTABLE[filters.sortBy ?? "sale_date"] ?? "sale_date";
  const ascending = (filters.sortDir ?? "desc") === "asc";

  let countQuery = applyListFilters(
    supabase.from("package_commission_records").select("id", { count: "exact", head: true }),
    filters,
    viewer
  );
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  let dataQuery = applyListFilters(
    supabase.from("package_commission_records").select("*"),
    filters,
    viewer
  )
    .order(sortBy, { ascending, nullsFirst: false })
    .range(from, to);

  const { data, error } = await dataQuery;
  if (error) throw new Error(error.message);

  const summary = await loadSummary(supabase, filters, viewer);

  return {
    rows: ((data ?? []) as Record<string, unknown>[]).map((row) => mapDbRecord(row)),
    total: count ?? 0,
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
  await ensureCommissionLedgerBackfill(supabase);
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
};

export async function createCommissionRecord(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: CreateCommissionInput
) {
  assertCanManage(viewer);

  const gross = parseMoneyToCents(input.gross_amount);
  const discount = parseMoneyToCents(input.discount_amount);
  const refund = parseMoneyToCents(input.refund_amount);
  const rateBps = parsePercentToBps(input.commission_rate);
  const calculated =
    input.calculated_commission != null
      ? parseMoneyToCents(input.calculated_commission)
      : rateBps != null
        ? calculatePercentCommissionCents(Math.max(0, gross - discount), rateBps)
        : parseMoneyToCents(input.final_commission);
  const isOverride = Boolean(input.is_manual_override);
  const final = isOverride ? parseMoneyToCents(input.final_commission) : calculated;
  if (isOverride && !String(input.override_reason ?? "").trim()) {
    throw new Error("Override reason is required when changing calculated commission.");
  }

  const trainerName = String(input.trainer_name ?? "").trim() || "Unassigned";
  const packageOrClass = String(input.package_or_class ?? "").trim();
  const client = String(input.client_name ?? "").trim();
  const dog = String(input.dog_name ?? "").trim();
  if (!client) throw new Error("Client name is required.");
  if (!dog) throw new Error("Dog name is required.");
  if (!packageOrClass) throw new Error("Package or class is required.");
  if (!input.sale_date) throw new Error("Sale date is required.");

  const warnings = computeMissingRequired({
    trainer_name: trainerName,
    trainer_user_id: input.trainer_user_id ?? null,
    sale_date: input.sale_date,
    package_or_class: packageOrClass,
    gross_amount_cents: gross,
    commission_rate_bps: rateBps,
    final_commission_cents: final
  });

  const payload = {
    trainer_user_id: input.trainer_user_id ?? null,
    trainer_name: trainerName,
    trainer_email: input.trainer_email ?? null,
    sale_date: input.sale_date,
    service_date: input.service_date ?? input.sale_date,
    client_name: client,
    dog_name: dog,
    commission_type: input.commission_type ?? "package_sale",
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
      rate_bps: rateBps
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
  if (error) throw new Error(error.message);
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

  const nextGross =
    patch.gross_amount != null ? parseMoneyToCents(patch.gross_amount) : existing.gross_amount_cents;
  const nextDiscount =
    patch.discount_amount != null ? parseMoneyToCents(patch.discount_amount) : existing.discount_amount_cents;
  const nextRate =
    patch.commission_rate != null ? parsePercentToBps(patch.commission_rate) : existing.commission_rate_bps;
  const calculated =
    patch.calculated_commission != null
      ? parseMoneyToCents(patch.calculated_commission)
      : nextRate != null
        ? calculatePercentCommissionCents(Math.max(0, nextGross - nextDiscount), nextRate)
        : existing.calculated_commission_cents;
  const isOverride = patch.is_manual_override ?? existing.is_manual_override;
  const final = isOverride
    ? patch.final_commission != null
      ? parseMoneyToCents(patch.final_commission)
      : existing.final_commission_cents
    : calculated;
  if (isOverride && patch.final_commission != null && !String(patch.override_reason ?? patch.reason ?? "").trim()) {
    throw new Error("Override reason is required.");
  }

  const updates: Record<string, unknown> = {
    trainer_user_id: patch.trainer_user_id !== undefined ? patch.trainer_user_id : existing.trainer_user_id,
    trainer_name: patch.trainer_name ?? existing.trainer_name,
    trainer_email: patch.trainer_email !== undefined ? patch.trainer_email : existing.trainer_email,
    sale_date: patch.sale_date ?? existing.sale_date,
    service_date: patch.service_date ?? existing.service_date,
    client_name: patch.client_name ?? existing.client_name,
    dog_name: patch.dog_name ?? existing.dog_name,
    commission_type: patch.commission_type ?? existing.commission_type,
    package_or_class: patch.package_or_class ?? existing.package_or_class,
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

  const { error } = await supabase.from("package_commission_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    recordId: id,
    action: "record_deleted",
    reason: reason ?? null,
    actor,
    oldValue: JSON.stringify({ final: existing.final_commission_cents, dog: existing.dog_name })
  });
}
