import type { PackageCommissionRecord } from "./types";

export function mapDbRecord(row: Record<string, unknown>): PackageCommissionRecord {
  return {
    id: String(row.id),
    legacy_id: row.legacy_id != null ? String(row.legacy_id) : null,
    trainer_user_id: row.trainer_user_id != null ? String(row.trainer_user_id) : null,
    trainer_name: String(row.trainer_name ?? "Unassigned"),
    trainer_email: row.trainer_email != null ? String(row.trainer_email) : null,
    sale_date: row.sale_date != null ? String(row.sale_date) : null,
    service_date: row.service_date != null ? String(row.service_date) : null,
    client_name: String(row.client_name ?? ""),
    dog_name: String(row.dog_name ?? ""),
    commission_type: (row.commission_type as PackageCommissionRecord["commission_type"]) ?? "package_sale",
    package_or_class: String(row.package_or_class ?? ""),
    quantity: Number(row.quantity ?? 1),
    gross_amount_cents: Number(row.gross_amount_cents ?? 0),
    discount_amount_cents: Number(row.discount_amount_cents ?? 0),
    refund_amount_cents: Number(row.refund_amount_cents ?? 0),
    commission_rate_bps: row.commission_rate_bps != null ? Number(row.commission_rate_bps) : null,
    calculated_commission_cents: Number(row.calculated_commission_cents ?? 0),
    final_commission_cents: Number(row.final_commission_cents ?? 0),
    review_status: (row.review_status as PackageCommissionRecord["review_status"]) ?? "needs_review",
    approval_status: (row.approval_status as PackageCommissionRecord["approval_status"]) ?? "pending",
    payment_status: (row.payment_status as PackageCommissionRecord["payment_status"]) ?? "unpaid",
    refund_status: (row.refund_status as PackageCommissionRecord["refund_status"]) ?? "none",
    source: (row.source as PackageCommissionRecord["source"]) ?? "manual",
    gingr_transaction_url: String(row.gingr_transaction_url ?? ""),
    external_transaction_id: row.external_transaction_id != null ? String(row.external_transaction_id) : null,
    payroll_period_id: row.payroll_period_id != null ? String(row.payroll_period_id) : null,
    import_batch_id: row.import_batch_id != null ? String(row.import_batch_id) : null,
    rule_id: row.rule_id != null ? String(row.rule_id) : null,
    rule_snapshot: (row.rule_snapshot as Record<string, unknown> | null) ?? null,
    calculation_input: (row.calculation_input as Record<string, unknown> | null) ?? null,
    is_manual_override: Boolean(row.is_manual_override),
    override_reason: row.override_reason != null ? String(row.override_reason) : null,
    override_by: row.override_by != null ? String(row.override_by) : null,
    has_open_comments: Boolean(row.has_open_comments),
    is_possible_duplicate: Boolean(row.is_possible_duplicate),
    missing_required_info: Boolean(row.missing_required_info),
    validation_warnings: Array.isArray(row.validation_warnings) ? row.validation_warnings : [],
    internal_notes: row.internal_notes != null ? String(row.internal_notes) : null,
    parent_record_id: row.parent_record_id != null ? String(row.parent_record_id) : null,
    archived_at: row.archived_at != null ? String(row.archived_at) : null,
    created_by: row.created_by != null ? String(row.created_by) : null,
    confirmed_at: row.confirmed_at != null ? String(row.confirmed_at) : null,
    confirmed_by: row.confirmed_by != null ? String(row.confirmed_by) : null,
    paid_at: row.paid_at != null ? String(row.paid_at) : null,
    paid_by: row.paid_by != null ? String(row.paid_by) : null,
    rejection_reason: row.rejection_reason != null ? String(row.rejection_reason) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString())
  };
}

export function computeMissingRequired(input: {
  trainer_name?: string;
  trainer_user_id?: string | null;
  sale_date?: string | null;
  package_or_class?: string;
  gross_amount_cents?: number;
  commission_rate_bps?: number | null;
  final_commission_cents?: number;
}) {
  const warnings: string[] = [];
  if (!input.trainer_user_id && (!input.trainer_name || input.trainer_name === "Unassigned")) {
    warnings.push("missing_trainer");
  }
  if (!input.sale_date) warnings.push("missing_date");
  if (!input.package_or_class?.trim()) warnings.push("missing_package_or_class");
  if (input.gross_amount_cents == null) warnings.push("missing_gross");
  return warnings;
}
