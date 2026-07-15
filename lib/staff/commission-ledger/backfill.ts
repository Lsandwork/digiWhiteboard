type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { parseMoneyToCents, parsePercentToBps } from "./money";
import { parseCommissionDate } from "./dates";
import { computeMissingRequired } from "./map";

const LEGACY_KEY = "package_commissions";

function isMissingLedgerTableError(message: string) {
  return (
    /relation .* does not exist/i.test(message) ||
    /schema cache/i.test(message) ||
    /package_commission_records/i.test(message)
  );
}

export function missingLedgerTablesMessage() {
  return "Package commission ledger tables are missing. Apply migration 034_package_commissions_ledger.sql to Supabase, then refresh.";
}

function mapLegacyStatus(status: string): {
  review_status: string;
  approval_status: string;
  payment_status: string;
} {
  switch (status) {
    case "Paid":
      return { review_status: "reviewed", approval_status: "approved", payment_status: "paid" };
    case "Approved":
      return { review_status: "reviewed", approval_status: "approved", payment_status: "unpaid" };
    case "Needs Review":
      return { review_status: "needs_review", approval_status: "pending", payment_status: "unpaid" };
    case "Disputed":
      return { review_status: "disputed", approval_status: "on_hold", payment_status: "unpaid" };
    default:
      return { review_status: "needs_review", approval_status: "pending", payment_status: "unpaid" };
  }
}

function parseLegacyDate(value: string | null | undefined): string | null {
  return parseCommissionDate(value);
}

/**
 * One-time (idempotent) backfill from admin_settings JSON into package_commission_records.
 * Skips rows whose legacy_id already exists.
 */
export async function ensureCommissionLedgerBackfill(supabase: SupabaseClient) {
  const { count, error: countError } = await supabase
    .from("package_commission_records")
    .select("id", { count: "exact", head: true });

  // If table missing, caller surfaces error.
  if (countError) {
    if (isMissingLedgerTableError(countError.message)) {
      throw new Error(missingLedgerTablesMessage());
    }
    throw new Error(countError.message);
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("admin_settings")
    .select("settings")
    .eq("id", "default")
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  const settings = (settingsRow?.settings ?? {}) as Record<string, unknown>;
  const store = settings[LEGACY_KEY] as { rows?: unknown[] } | undefined;
  const legacyRows = Array.isArray(store?.rows) ? store!.rows! : [];
  if (!legacyRows.length) return { inserted: 0, skipped: 0 };

  const { data: existing } = await supabase.from("package_commission_records").select("legacy_id");
  const existingIds = new Set(
    (existing ?? []).map((row) => String((row as { legacy_id?: string }).legacy_id ?? "")).filter(Boolean)
  );

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const raw of legacyRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = String(row.id ?? "");
    if (!legacyId || existingIds.has(legacyId)) {
      skipped += 1;
      continue;
    }

    const statuses = mapLegacyStatus(String(row.status ?? "Pending"));
    const saleCategory = String(row.sale_category ?? "package");
    const commissionType = saleCategory === "class" ? "group_class" : "package_sale";
    const grossCents = parseMoneyToCents(row.package_sale_amount);
    const finalCents = parseMoneyToCents(row.commission_amount);
    const rateBps = parsePercentToBps(row.commission_percent);
    const saleDate = parseLegacyDate(String(row.sold_at ?? ""));
    const warnings = computeMissingRequired({
      trainer_name: String(row.trainer_name ?? ""),
      trainer_user_id: row.trainer_user_id ? String(row.trainer_user_id) : null,
      sale_date: saleDate,
      package_or_class: String(row.package_type ?? ""),
      gross_amount_cents: grossCents,
      commission_rate_bps: rateBps,
      final_commission_cents: finalCents
    });

    toInsert.push({
      legacy_id: legacyId,
      trainer_user_id: row.trainer_user_id ? String(row.trainer_user_id) : null,
      trainer_name: String(row.trainer_name ?? "Unassigned"),
      trainer_email: row.trainer_email ? String(row.trainer_email) : null,
      sale_date: saleDate,
      service_date: saleDate,
      client_name: String(row.owner_name ?? ""),
      dog_name: String(row.dog_name ?? ""),
      commission_type: commissionType,
      package_or_class: String(row.package_type ?? ""),
      quantity: 1,
      gross_amount_cents: grossCents,
      discount_amount_cents: 0,
      refund_amount_cents: 0,
      commission_rate_bps: rateBps,
      calculated_commission_cents: finalCents,
      final_commission_cents: finalCents,
      review_status: statuses.review_status,
      approval_status: statuses.approval_status,
      payment_status: statuses.payment_status,
      refund_status: "none",
      source: "manual",
      gingr_transaction_url: String(row.gingr_transaction_url ?? ""),
      rule_snapshot: {
        legacy_mode: row.commission_mode ?? "amount",
        legacy_percent: row.commission_percent ?? null,
        migrated_from: "admin_settings.package_commissions"
      },
      calculation_input: {
        package_sale_amount: row.package_sale_amount ?? null,
        commission_mode: row.commission_mode ?? null
      },
      missing_required_info: warnings.length > 0,
      validation_warnings: warnings,
      internal_notes: row.notes ? String(row.notes) : null,
      confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
      created_at: row.created_at ? String(row.created_at) : new Date().toISOString(),
      updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString()
    });
    existingIds.add(legacyId);
  }

  let inserted = 0;
  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from("package_commission_records").insert(chunk);
    if (error) {
      if (isMissingLedgerTableError(error.message)) {
        throw new Error(missingLedgerTablesMessage());
      }
      throw new Error(`Backfill failed: ${error.message}`);
    }
    inserted += chunk.length;
  }

  // Migrate embedded comments into threads (best-effort).
  for (const raw of legacyRows) {
    const row = raw as Record<string, unknown>;
    const legacyId = String(row.id ?? "");
    const comments = Array.isArray(row.comments) ? (row.comments as Record<string, unknown>[]) : [];
    if (!legacyId || !comments.length) continue;

    const { data: record } = await supabase
      .from("package_commission_records")
      .select("id")
      .eq("legacy_id", legacyId)
      .maybeSingle();
    if (!record?.id) continue;

    for (const comment of comments) {
      const body = String(comment.body ?? "").trim();
      if (!body) continue;
      const isDispute = String(comment.concern_type ?? "") === "dispute";
      const { data: thread } = await supabase
        .from("package_commission_comment_threads")
        .insert({
          record_id: record.id,
          field_name: "final_commission",
          field_value_at_comment: String(row.commission_amount ?? ""),
          status: isDispute ? "open" : "resolved",
          created_by_role: "trainer",
          resolution_note: isDispute ? null : "Migrated legacy comment",
          resolved_at: isDispute ? null : String(comment.created_at ?? new Date().toISOString())
        })
        .select("id")
        .maybeSingle();
      if (!thread?.id) continue;
      await supabase.from("package_commission_comment_replies").insert({
        thread_id: thread.id,
        body,
        author_name: String(comment.author ?? "Trainer"),
        author_role: "trainer",
        created_at: String(comment.created_at ?? new Date().toISOString())
      });
      if (isDispute) {
        await supabase
          .from("package_commission_records")
          .update({ has_open_comments: true, review_status: "disputed" })
          .eq("id", record.id);
      }
    }
  }

  return { inserted, skipped };
}
