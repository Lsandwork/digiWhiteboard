type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage } from "./auth";
import { writeCommissionAudit } from "./audit";
import { createCommissionRecord } from "./records";
import {
  parsePackageCommissionCsv,
  matchTrainerByName,
  type PackageCommissionTrainerOption
} from "@/lib/staff/package-commissions-csv";
import {
  detectServiceLocation,
  trainerRateBpsForPackage,
  trainerRatePercentForPackage
} from "./location-rate";
import { calculatePercentCommissionCents, parseMoneyToCents } from "./money";
import { parseCommissionDate } from "./dates";
import { commissionDedupeKey, namesMatchCaseInsensitive } from "./dedupe";
import type { CommissionActor, CommissionViewer } from "./types";

export type ImportStageResult = {
  batchId: string;
  imported: number;
  failed: number;
  warnings: number;
  duplicates: number;
  skippedDuplicates: number;
  errors: { line: number; message: string; severity: string }[];
  records: { id: string }[];
};

function saleCategoryToType(category: unknown) {
  return String(category ?? "").toLowerCase() === "class" ? "group_class" : "package_sale";
}

function parseSoldDate(value: unknown): string | null {
  return parseCommissionDate(value);
}

async function findExistingSameDayDuplicate(
  supabase: SupabaseClient,
  fields: {
    trainerName: string;
    trainerUserId?: string | null;
    clientName: string;
    dogName: string;
    packageOrClass: string;
    saleDate: string;
    finalCommissionCents: number;
  }
): Promise<string | null> {
  let query = supabase
    .from("package_commission_records")
    .select("id, trainer_name, trainer_user_id, client_name, dog_name, package_or_class")
    .eq("sale_date", fields.saleDate)
    .eq("final_commission_cents", fields.finalCommissionCents)
    .is("archived_at", null)
    .limit(25);

  if (fields.trainerUserId) {
    query = query.eq("trainer_user_id", fields.trainerUserId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const match = (data ?? []).find((row) => {
    const trainerOk = fields.trainerUserId
      ? String(row.trainer_user_id ?? "") === fields.trainerUserId
      : namesMatchCaseInsensitive(String(row.trainer_name ?? ""), fields.trainerName);
    return (
      trainerOk &&
      namesMatchCaseInsensitive(String(row.client_name ?? ""), fields.clientName) &&
      namesMatchCaseInsensitive(String(row.dog_name ?? ""), fields.dogName) &&
      namesMatchCaseInsensitive(String(row.package_or_class ?? ""), fields.packageOrClass)
    );
  });
  return match ? String(match.id) : null;
}

/**
 * Three-stage-ready importer: validates then creates ledger rows + import batch.
 * Skips same-day duplicates (existing ledger + within the CSV itself).
 */
export async function importCommissionCsvToLedger(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  input: {
    csvText: string;
    filename?: string;
    trainers?: PackageCommissionTrainerOption[];
    dryRun?: boolean;
  }
): Promise<ImportStageResult> {
  assertCanManage(viewer);
  const parsed = parsePackageCommissionCsv(input.csvText, { trainers: input.trainers });
  if (!parsed.length) throw new Error("No rows found in CSV.");

  const errors: ImportStageResult["errors"] = [];
  const previewRows: Array<Record<string, unknown>> = [];
  const seenInBatch = new Set<string>();
  let warnings = 0;
  let duplicates = 0;

  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    const saleDate = parseSoldDate(row.sold_at);
    const dog = String(row.dog_name ?? "").trim();
    const client = String(row.owner_name ?? "").trim();
    const pkg = String(row.package_type ?? "").trim();
    const trainerName = String(row.trainer_name ?? "").trim() || "Unassigned";
    const matched =
      row.trainer_user_id
        ? null
        : matchTrainerByName(trainerName, input.trainers);
    const trainerUserId = (row.trainer_user_id as string) || matched?.id || null;
    const resolvedTrainerName = matched?.full_name || trainerName;
    const grossCents = parseMoneyToCents(row.package_sale_amount);
    const rateBps = trainerRateBpsForPackage(pkg);
    const mode = String(row.commission_mode ?? "").toLowerCase();
    const shareRaw = String(row.commission_amount ?? "").trim();
    // Invoice CSV imports use Trainer Share ($) as the payout source of truth (incl. $0.00).
    const useInvoiceShare = mode === "amount" && shareRaw !== "";
    const finalCents = useInvoiceShare
      ? parseMoneyToCents(shareRaw)
      : calculatePercentCommissionCents(grossCents, rateBps);
    const issues: string[] = [];
    if (!dog) issues.push("Missing dog name");
    if (!client) issues.push("Missing client / owner name");
    if (!pkg) issues.push("Missing package or class");
    if (!saleDate) issues.push("Invalid or missing date");
    if (!row.trainer_name || String(row.trainer_name) === "Unassigned") {
      issues.push("Missing trainer");
      warnings += 1;
    }

    const hardError = issues.some(
      (msg) =>
        msg.startsWith("Missing dog") ||
        msg.startsWith("Missing client") ||
        msg.startsWith("Missing package") ||
        msg.startsWith("Invalid")
    );
    if (hardError) {
      errors.push({ line: i + 1, message: issues.join("; "), severity: "error" });
      continue;
    }

    // Same-day duplicate: skip (do not import).
    if (saleDate && dog && client && pkg) {
      const fingerprint = commissionDedupeKey({
        trainerName: resolvedTrainerName,
        trainerUserId,
        clientName: client,
        dogName: dog,
        packageOrClass: pkg,
        saleDate,
        finalCommissionCents: finalCents
      });

      if (seenInBatch.has(fingerprint)) {
        duplicates += 1;
        errors.push({
          line: i + 1,
          message: "Duplicate in CSV (same trainer/client/dog/package/date/amount) — skipped",
          severity: "duplicate"
        });
        continue;
      }

      const existingId = await findExistingSameDayDuplicate(supabase, {
        trainerName: resolvedTrainerName,
        trainerUserId,
        clientName: client,
        dogName: dog,
        packageOrClass: pkg,
        saleDate,
        finalCommissionCents: finalCents
      });
      if (existingId) {
        duplicates += 1;
        errors.push({
          line: i + 1,
          message: "Duplicate same-day entry already in ledger — skipped",
          severity: "duplicate"
        });
        continue;
      }

      seenInBatch.add(fingerprint);
    }

    if (issues.length) {
      warnings += 1;
      errors.push({ line: i + 1, message: issues.join("; "), severity: "warning" });
    }

    previewRows.push({
      ...row,
      trainer_user_id: trainerUserId,
      trainer_name: resolvedTrainerName,
      trainer_email: (row.trainer_email as string) || matched?.email || null,
      _saleDate: saleDate,
      _finalCents: finalCents,
      _useInvoiceShare: useInvoiceShare,
      _line: i + 1
    });
  }

  if (input.dryRun) {
    const { data: batch } = await supabase
      .from("package_commission_import_batches")
      .insert({
        original_filename: input.filename ?? "paste.csv",
        uploaded_by: actor.adminUserId ?? null,
        mapping_template: { format: "auto" },
        total_rows: parsed.length,
        imported_rows: 0,
        warning_rows: warnings,
        failed_rows: errors.filter((e) => e.severity === "error").length,
        duplicate_rows: duplicates,
        status: "pending",
        notes: "Validation preview"
      })
      .select("id")
      .single();
    return {
      batchId: batch?.id ?? "preview",
      imported: 0,
      failed: errors.filter((e) => e.severity === "error").length,
      warnings,
      duplicates,
      skippedDuplicates: duplicates,
      errors,
      records: []
    };
  }

  const grossTotal = previewRows.reduce((sum, row) => sum + parseMoneyToCents(row.package_sale_amount), 0);
  const commissionTotal = previewRows.reduce((sum, row) => sum + Number(row._finalCents ?? 0), 0);

  const { data: batch, error: batchError } = await supabase
    .from("package_commission_import_batches")
    .insert({
      original_filename: input.filename ?? "paste.csv",
      uploaded_by: actor.adminUserId ?? null,
      mapping_template: { format: "auto_gingr_or_legacy" },
      total_rows: parsed.length,
      imported_rows: 0,
      warning_rows: warnings,
      failed_rows: errors.filter((e) => e.severity === "error").length,
      duplicate_rows: duplicates,
      gross_total_cents: grossTotal,
      commission_total_cents: commissionTotal,
      status: "completed"
    })
    .select("*")
    .single();
  if (batchError) throw new Error(batchError.message);

  for (const err of errors) {
    await supabase.from("package_commission_import_errors").insert({
      batch_id: batch.id,
      row_number: err.line,
      severity:
        err.severity === "warning"
          ? "warning"
          : err.severity === "duplicate" || err.message.toLowerCase().includes("duplicate")
            ? "duplicate"
            : "error",
      message: err.message,
      raw_row: {}
    });
  }

  const records: { id: string }[] = [];
  let imported = 0;
  let failed = errors.filter((e) => e.severity === "error").length;

  for (const row of previewRows) {
    try {
      const useInvoiceShare = Boolean(row._useInvoiceShare);
      const created = await createCommissionRecord(supabase, viewer, actor, {
        trainer_user_id: (row.trainer_user_id as string) || null,
        trainer_name: String(row.trainer_name ?? "Unassigned"),
        trainer_email: (row.trainer_email as string) || null,
        sale_date: String(row._saleDate),
        service_date: String(row._saleDate),
        client_name: String(row.owner_name ?? ""),
        dog_name: String(row.dog_name ?? ""),
        commission_type: saleCategoryToType(row.sale_category) as "group_class" | "package_sale",
        package_or_class: String(row.package_type ?? ""),
        quantity: 1,
        gross_amount: row.package_sale_amount,
        gingr_transaction_url: String(row.gingr_transaction_url ?? ""),
        source: "csv_import",
        import_batch_id: batch.id,
        internal_notes: row.notes ? String(row.notes) : null,
        allow_duplicate: false,
        // Gingr invoice: honor Trainer Share ($) including $0.00 rows.
        ...(useInvoiceShare
          ? {
              is_manual_override: true,
              final_commission: row.commission_amount,
              calculated_commission: row.commission_amount,
              commission_rate: row.commission_percent,
              override_reason: "Imported Trainer Share from Gingr invoice CSV"
            }
          : {}),
        rule_snapshot: {
          import_mode: useInvoiceShare ? "invoice_trainer_share" : "location_split",
          location: detectServiceLocation(String(row.package_type ?? "")),
          trainer_rate_percent: trainerRatePercentForPackage(String(row.package_type ?? "")),
          csv_commission_percent: row.commission_percent ?? null,
          csv_trainer_share: row.commission_amount ?? null,
          sold_at: row.sold_at ?? null
        }
      });
      records.push({ id: created.id });
      imported += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed";
      const isDuplicate = /duplicate/i.test(message);
      if (isDuplicate) {
        duplicates += 1;
        errors.push({ line: Number(row._line ?? 0), message, severity: "duplicate" });
      } else {
        failed += 1;
        errors.push({ line: Number(row._line ?? 0), message, severity: "error" });
      }
    }
  }

  await supabase
    .from("package_commission_import_batches")
    .update({ imported_rows: imported, failed_rows: failed, duplicate_rows: duplicates })
    .eq("id", batch.id);

  await writeCommissionAudit(supabase, {
    entityType: "import_batch",
    entityId: batch.id,
    action: "csv_imported",
    actor,
    metadata: { imported, failed, duplicates, filename: input.filename ?? "paste.csv" }
  });

  return {
    batchId: batch.id,
    imported,
    failed,
    warnings,
    duplicates,
    skippedDuplicates: duplicates,
    errors,
    records
  };
}

export async function listImportBatches(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("package_commission_import_batches")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function undoImportBatch(
  supabase: SupabaseClient,
  viewer: CommissionViewer,
  actor: CommissionActor,
  batchId: string
) {
  assertCanManage(viewer);
  const { data: batch, error } = await supabase
    .from("package_commission_import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (error || !batch) throw new Error("Import batch not found.");
  if (batch.status === "undone") throw new Error("This import was already undone.");

  const { data: rows } = await supabase
    .from("package_commission_records")
    .select("id, payment_status, payroll_period_id")
    .eq("import_batch_id", batchId)
    .is("archived_at", null);

  for (const row of rows ?? []) {
    const r = row as { id: string; payment_status: string; payroll_period_id: string | null };
    if (r.payment_status === "paid") {
      throw new Error("Cannot undo import: one or more records are already paid.");
    }
    if (r.payroll_period_id) {
      const { data: period } = await supabase
        .from("package_commission_payroll_periods")
        .select("status")
        .eq("id", r.payroll_period_id)
        .maybeSingle();
      if (period?.status === "locked") {
        throw new Error("Cannot undo import: records are in a locked payroll period.");
      }
    }
  }

  const ids = (rows ?? []).map((r) => String((r as { id: string }).id));
  if (ids.length) {
    await supabase
      .from("package_commission_records")
      .update({ archived_at: new Date().toISOString() })
      .in("id", ids);
  }

  await supabase
    .from("package_commission_import_batches")
    .update({
      status: "undone",
      undone_at: new Date().toISOString(),
      undone_by: actor.adminUserId ?? null
    })
    .eq("id", batchId);

  await writeCommissionAudit(supabase, {
    entityType: "import_batch",
    entityId: batchId,
    action: "csv_import_undone",
    actor,
    metadata: { archived: ids.length }
  });

  return { archived: ids.length };
}
