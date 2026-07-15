type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage, assertSuperAdmin } from "./auth";
import { writeCommissionAudit } from "./audit";
import { calculatePercentCommissionCents, parseMoneyToCents, parsePercentToBps } from "./money";
import type { CalculationType, CommissionActor, CommissionType, CommissionViewer } from "./types";

export type CommissionRuleInput = {
  name: string;
  trainer_user_id?: string | null;
  applies_to_all_trainers?: boolean;
  commission_type?: CommissionType;
  package_or_class?: string | null;
  calculation_type?: CalculationType;
  rate?: unknown;
  fixed_amount?: unknown;
  tier_config?: unknown;
  effective_start?: string;
  effective_end?: string | null;
  priority?: number;
  is_active?: boolean;
  requires_manual_approval?: boolean;
};

export async function listCommissionRules(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("package_commission_rules")
    .select("*")
    .order("priority", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCommissionRule(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: CommissionRuleInput
) {
  assertCanManage(viewer);
  if (!input.name.trim()) throw new Error("Rule name is required.");
  const rateBps = parsePercentToBps(input.rate);
  const fixedCents = input.fixed_amount != null ? parseMoneyToCents(input.fixed_amount) : null;

  const { data, error } = await supabase
    .from("package_commission_rules")
    .insert({
      name: input.name.trim(),
      trainer_user_id: input.trainer_user_id ?? null,
      applies_to_all_trainers: input.applies_to_all_trainers ?? true,
      commission_type: input.commission_type ?? "package_sale",
      package_or_class: input.package_or_class ?? null,
      calculation_type: input.calculation_type ?? "percentage_of_gross",
      rate_bps: rateBps,
      fixed_amount_cents: fixedCents,
      tier_config: input.tier_config ?? [],
      effective_start: input.effective_start ?? new Date().toISOString().slice(0, 10),
      effective_end: input.effective_end ?? null,
      priority: input.priority ?? 100,
      is_active: input.is_active ?? true,
      requires_manual_approval: input.requires_manual_approval ?? false,
      created_by: actor.adminUserId ?? null,
      updated_by: actor.adminUserId ?? null
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    entityType: "rule",
    entityId: data.id,
    action: "rule_created",
    actor,
    newValue: input.name
  });
  return data;
}

export async function updateCommissionRule(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string,
  input: CommissionRuleInput
) {
  assertCanManage(viewer);
  // Historical rule edits reserved for super admin if locking concept is used later — allow admin updates of active future rules.
  if (viewer.roleKey === "management") {
    throw new Error("Management cannot modify commission rules.");
  }

  const { data: existing } = await supabase.from("package_commission_rules").select("*").eq("id", id).maybeSingle();
  if (!existing) throw new Error("Commission rule not found.");

  const { data, error } = await supabase
    .from("package_commission_rules")
    .update({
      name: input.name?.trim() || existing.name,
      trainer_user_id: input.trainer_user_id !== undefined ? input.trainer_user_id : existing.trainer_user_id,
      applies_to_all_trainers:
        input.applies_to_all_trainers !== undefined
          ? input.applies_to_all_trainers
          : existing.applies_to_all_trainers,
      commission_type: input.commission_type ?? existing.commission_type,
      package_or_class: input.package_or_class !== undefined ? input.package_or_class : existing.package_or_class,
      calculation_type: input.calculation_type ?? existing.calculation_type,
      rate_bps: input.rate !== undefined ? parsePercentToBps(input.rate) : existing.rate_bps,
      fixed_amount_cents:
        input.fixed_amount !== undefined ? parseMoneyToCents(input.fixed_amount) : existing.fixed_amount_cents,
      tier_config: input.tier_config ?? existing.tier_config,
      effective_start: input.effective_start ?? existing.effective_start,
      effective_end: input.effective_end !== undefined ? input.effective_end : existing.effective_end,
      priority: input.priority ?? existing.priority,
      is_active: input.is_active ?? existing.is_active,
      requires_manual_approval:
        input.requires_manual_approval ?? existing.requires_manual_approval,
      updated_by: actor.adminUserId ?? null
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    entityType: "rule",
    entityId: id,
    action: "rule_updated",
    actor,
    newValue: String(data.name)
  });
  return data;
}

/** Preview calculator — does not write. */
export function previewCommissionRule(input: {
  calculation_type: CalculationType;
  gross_amount: unknown;
  discount_amount?: unknown;
  rate?: unknown;
  fixed_amount?: unknown;
  quantity?: number;
}) {
  const gross = parseMoneyToCents(input.gross_amount);
  const discount = parseMoneyToCents(input.discount_amount);
  const rateBps = parsePercentToBps(input.rate) ?? 0;
  const fixed = parseMoneyToCents(input.fixed_amount);
  const qty = Math.max(1, Number(input.quantity ?? 1));

  switch (input.calculation_type) {
    case "percentage_of_gross":
      return calculatePercentCommissionCents(gross, rateBps);
    case "percentage_after_discount":
      return calculatePercentCommissionCents(Math.max(0, gross - discount), rateBps);
    case "fixed_per_package":
    case "fixed_per_class":
    case "fixed_per_session":
      return fixed;
    case "fixed_per_attendee":
      return fixed * qty;
    case "manual_amount":
      return fixed;
    case "refund_reversal":
      return -Math.abs(fixed || calculatePercentCommissionCents(gross, rateBps));
    default:
      return calculatePercentCommissionCents(Math.max(0, gross - discount), rateBps);
  }
}

export async function deleteCommissionRule(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  id: string
) {
  assertSuperAdmin(viewer);
  const { error } = await supabase.from("package_commission_rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await writeCommissionAudit(supabase, {
    entityType: "rule",
    entityId: id,
    action: "rule_deleted",
    actor
  });
}
