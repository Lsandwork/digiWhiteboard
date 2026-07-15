type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage } from "./auth";
import { writeCommissionAudit } from "./audit";
import { createCommissionRecord } from "./records";
import { parseMoneyToCents } from "./money";
import type { CommissionActor, CommissionViewer } from "./types";

export async function createRefundAdjustment(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: {
    original_record_id: string;
    amount: unknown;
    refund_percent?: unknown;
    refund_date?: string | null;
    reason: string;
    external_reference?: string | null;
    payroll_period_id?: string | null;
  }
) {
  assertCanManage(viewer);
  const reason = String(input.reason ?? "").trim();
  if (!reason) throw new Error("Refund reason is required.");

  const { data: original, error } = await supabase
    .from("package_commission_records")
    .select("*")
    .eq("id", input.original_record_id)
    .maybeSingle();
  if (error || !original) throw new Error("Original commission record not found.");

  const amountCents = Math.abs(parseMoneyToCents(input.amount));
  if (amountCents <= 0) throw new Error("Refund amount must be greater than zero.");

  const originalFinal = Number(original.final_commission_cents ?? 0);
  const refundStatus =
    amountCents >= originalFinal ? "full" : amountCents > 0 ? "partial" : "none";

  // Choose payroll period: provided, or next open period if original already paid.
  let payrollPeriodId = input.payroll_period_id ?? null;
  if (!payrollPeriodId && original.payment_status === "paid") {
    const { data: openPeriod } = await supabase
      .from("package_commission_payroll_periods")
      .select("id")
      .in("status", ["open", "under_review", "draft"])
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    payrollPeriodId = openPeriod?.id ?? null;
  }

  const adjustmentRecord = await createCommissionRecord(supabase, viewer, actor, {
    trainer_user_id: original.trainer_user_id,
    trainer_name: original.trainer_name,
    trainer_email: original.trainer_email,
    sale_date: input.refund_date ?? new Date().toISOString().slice(0, 10),
    service_date: input.refund_date ?? new Date().toISOString().slice(0, 10),
    client_name: original.client_name,
    dog_name: original.dog_name,
    commission_type: "refund_reversal",
    package_or_class: `Refund: ${original.package_or_class}`,
    quantity: 1,
    gross_amount: 0,
    final_commission: -(amountCents / 100),
    calculated_commission: -(amountCents / 100),
    is_manual_override: true,
    override_reason: reason,
    source: "adjustment",
    internal_notes: `Linked refund for ${original.id}. ${input.external_reference ?? ""}`.trim(),
    rule_snapshot: {
      original_record_id: original.id,
      original_final_cents: originalFinal,
      refund_cents: amountCents
    }
  });

  if (payrollPeriodId) {
    await supabase
      .from("package_commission_records")
      .update({ payroll_period_id: payrollPeriodId })
      .eq("id", adjustmentRecord.id);
  }

  const { data: adj, error: adjError } = await supabase
    .from("package_commission_adjustments")
    .insert({
      original_record_id: original.id,
      adjustment_record_id: adjustmentRecord.id,
      adjustment_type: refundStatus === "full" ? "refund" : "partial_refund",
      amount_cents: -amountCents,
      refund_percent_bps:
        originalFinal > 0 ? Math.round((amountCents / originalFinal) * 10_000) : null,
      refund_date: input.refund_date ?? new Date().toISOString().slice(0, 10),
      reason,
      external_reference: input.external_reference ?? null,
      created_by: actor.adminUserId ?? null,
      approval_status: "approved",
      payroll_period_id: payrollPeriodId
    })
    .select("*")
    .single();
  if (adjError) throw new Error(adjError.message);

  const priorRefund = Number(original.refund_amount_cents ?? 0);
  await supabase
    .from("package_commission_records")
    .update({
      refund_amount_cents: priorRefund + amountCents,
      refund_status: priorRefund + amountCents >= originalFinal ? "full" : "partial"
    })
    .eq("id", original.id);

  await writeCommissionAudit(supabase, {
    recordId: original.id,
    action: "refund_created",
    reason,
    actor,
    newValue: String(-amountCents),
    metadata: { adjustment_id: adj.id, adjustment_record_id: adjustmentRecord.id }
  });

  return { adjustment: adj, record: adjustmentRecord };
}
