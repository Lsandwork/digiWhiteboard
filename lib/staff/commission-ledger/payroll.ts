type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage, assertSuperAdmin, assertNotManagementDestructive } from "./auth";
import { writeCommissionAudit } from "./audit";
import { centsToDisplay } from "./money";
import type { CommissionActor, CommissionViewer, PayrollPeriodStatus } from "./types";

export async function listPayrollPeriods(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("package_commission_payroll_periods")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPayrollPeriod(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: { name: string; start_date: string; end_date: string; payment_date?: string | null; notes?: string | null }
) {
  assertCanManage(viewer);
  if (!input.name.trim()) throw new Error("Payroll period name is required.");
  if (!input.start_date || !input.end_date) throw new Error("Start and end dates are required.");
  if (input.end_date < input.start_date) throw new Error("End date must be on or after start date.");

  const { data, error } = await supabase
    .from("package_commission_payroll_periods")
    .insert({
      name: input.name.trim(),
      start_date: input.start_date,
      end_date: input.end_date,
      payment_date: input.payment_date ?? null,
      status: "open" satisfies PayrollPeriodStatus,
      notes: input.notes ?? null,
      created_by: actor.adminUserId ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    entityType: "payroll_period",
    entityId: data.id,
    action: "payroll_created",
    actor,
    newValue: input.name
  });
  return data;
}

export async function setPayrollPeriodStatus(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  status: PayrollPeriodStatus,
  reason?: string
) {
  assertCanManage(viewer);
  const { data: existing, error: loadError } = await supabase
    .from("package_commission_payroll_periods")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadError || !existing) throw new Error("Payroll period not found.");

  if (existing.status === "locked" && status !== "locked") {
    assertSuperAdmin(viewer);
    assertNotManagementDestructive(viewer, "reopen_payroll");
    if (!String(reason ?? "").trim()) throw new Error("A reason is required to reopen a locked payroll period.");
  }

  const updates: Record<string, unknown> = { status };
  if (status === "locked" || status === "paid") {
    updates.closed_by = actor.adminUserId ?? null;
    updates.closed_at = new Date().toISOString();
  }
  if (existing.status === "locked" && status !== "locked") {
    updates.reopen_reason = reason ?? null;
    updates.closed_at = null;
    updates.closed_by = null;
  }

  const { data, error } = await supabase
    .from("package_commission_payroll_periods")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await writeCommissionAudit(supabase, {
    entityType: "payroll_period",
    entityId: id,
    action: `payroll_${status}`,
    reason: reason ?? null,
    actor,
    oldValue: String(existing.status),
    newValue: status
  });
  return data;
}

export async function getPayrollPeriodSummary(supabase: SupabaseClient, periodId: string) {
  const { data: period, error } = await supabase
    .from("package_commission_payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (error || !period) throw new Error("Payroll period not found.");

  const { data: rows } = await supabase
    .from("package_commission_records")
    .select("trainer_user_id, trainer_name, gross_amount_cents, final_commission_cents, refund_amount_cents, payment_status")
    .eq("payroll_period_id", periodId)
    .is("archived_at", null);

  const byTrainer = new Map<
    string,
    { trainer_name: string; gross: number; commission: number; refund: number; count: number }
  >();
  let gross = 0;
  let commission = 0;
  let refund = 0;
  for (const row of rows ?? []) {
    const r = row as Record<string, unknown>;
    const key = String(r.trainer_user_id ?? r.trainer_name ?? "unknown");
    const entry = byTrainer.get(key) ?? {
      trainer_name: String(r.trainer_name ?? "Unassigned"),
      gross: 0,
      commission: 0,
      refund: 0,
      count: 0
    };
    entry.gross += Number(r.gross_amount_cents ?? 0);
    entry.commission += Number(r.final_commission_cents ?? 0);
    entry.refund += Number(r.refund_amount_cents ?? 0);
    entry.count += 1;
    byTrainer.set(key, entry);
    gross += Number(r.gross_amount_cents ?? 0);
    commission += Number(r.final_commission_cents ?? 0);
    refund += Number(r.refund_amount_cents ?? 0);
  }

  return {
    period,
    totals: {
      trainers: byTrainer.size,
      grossSales: centsToDisplay(gross),
      commissionTotal: centsToDisplay(commission),
      refundTotal: centsToDisplay(refund),
      finalPayroll: centsToDisplay(commission - refund),
      gross_cents: gross,
      commission_cents: commission,
      refund_cents: refund
    },
    trainers: [...byTrainer.values()]
  };
}

export async function acknowledgeTrainerStatement(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  periodId: string
) {
  if (!viewer.adminUserId) throw new Error("Trainer identity required.");
  const { error } = await supabase.from("package_commission_statement_acks").upsert({
    payroll_period_id: periodId,
    trainer_user_id: viewer.adminUserId,
    acknowledged_at: new Date().toISOString()
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
