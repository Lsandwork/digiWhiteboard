type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage } from "./auth";
import { writeCommissionAudit } from "./audit";
import { createCommissionRecord } from "./records";
import {
  parsePackageCommissionCsv,
  matchTrainerByName,
  type PackageCommissionTrainerOption
} from "@/lib/staff/package-commissions-csv";
import { parseMoneyToCents, parsePercentToBps } from "./money";
import { parseCommissionDate } from "./dates";
import type { CommissionActor, CommissionViewer } from "./types";

export type ImportStageResult = {
  batchId: string;
  imported: number;
  failed: number;
  warnings: number;
  duplicates: number;
  errors: { line: number; message: string; severity: string }[];
  records: { id: string }[];
};

function saleCategoryToType(category: unknown) {
  return String(category ?? "").toLowerCase() === "class" ? "group_class" : "package_sale";
}

function parseSoldDate(value: unknown): string | null {
  return parseCommissionDate(value);
}

/**
 * Three-stage-ready importer: validates then creates ledger rows + import batch.
 * Uses Gingr invoice + legacy Fitdog CSV parsers.
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
  let warnings = 0;
  let duplicates = 0;

  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    const saleDate = parseSoldDate(row.sold_at);
    const dog = String(row.dog_name ?? "").trim();
    const client = String(row.owner_name ?? "").trim();
    const pkg = String(row.package_type ?? "").trim();
    const finalCents = parseMoneyToCents(row.commission_amount);
    const issues: string[] = [];
    if (!dog) issues.push("Missing dog name");
    if (!client) issues.push("Missing client / owner name");
    if (!pkg) issues.push("Missing package or class");
    if (!saleDate) issues.push("Invalid or missing date");
    if (!row.trainer_name || String(row.trainer_name) === "Unassigned") {
      issues.push("Missing trainer");
      warnings += 1;
    }

    // Possible duplicate: same trainer+client+dog+package+date+amount
    if (saleDate && dog && client) {
      const { data: dupes } = await supabase
        .from("package_commission_records")
        .select("id")
        .eq("dog_name", dog)
        .eq("client_name", client)
        .eq("package_or_class", pkg)
        .eq("sale_date", saleDate)
        .eq("final_commission_cents", finalCents)
        .is("archived_at", null)
        .limit(1);
      if (dupes?.length) {
        duplicates += 1;
        warnings += 1;
        issues.push("Possible duplicate");
      }
    }

    if (issues.some((msg) => msg.startsWith("Missing dog") || msg.startsWith("Missing client") || msg.startsWith("Missing package") || msg.startsWith("Invalid"))) {
      errors.push({ line: i + 1, message: issues.join("; "), severity: "error" });
      continue;
    }
    if (issues.length) {
      errors.push({ line: i + 1, message: issues.join("; "), severity: "warning" });
    }

    previewRows.push({
      ...row,
      _saleDate: saleDate,
      _finalCents: finalCents,
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
      severity: err.severity === "warning" ? "warning" : err.message.includes("duplicate") ? "duplicate" : "error",
      message: err.message,
      raw_row: {}
    });
  }

  const records: { id: string }[] = [];
  let imported = 0;
  let failed = errors.filter((e) => e.severity === "error").length;

  for (const row of previewRows) {
    try {
      const matched =
        row.trainer_user_id
          ? null
          : matchTrainerByName(String(row.trainer_name ?? ""), input.trainers);
      const created = await createCommissionRecord(supabase, viewer, actor, {
        trainer_user_id: (row.trainer_user_id as string) || matched?.id || null,
        trainer_name: matched?.full_name || String(row.trainer_name ?? "Unassigned"),
        trainer_email: (row.trainer_email as string) || matched?.email || null,
        sale_date: String(row._saleDate),
        service_date: String(row._saleDate),
        client_name: String(row.owner_name ?? ""),
        dog_name: String(row.dog_name ?? ""),
        commission_type: saleCategoryToType(row.sale_category) as "group_class" | "package_sale",
        package_or_class: String(row.package_type ?? ""),
        quantity: 1,
        gross_amount: row.package_sale_amount,
        commission_rate: row.commission_percent,
        final_commission: row.commission_amount,
        calculated_commission: row.commission_amount,
        gingr_transaction_url: String(row.gingr_transaction_url ?? ""),
        source: "csv_import",
        import_batch_id: batch.id,
        internal_notes: row.notes ? String(row.notes) : null,
        rule_snapshot: {
          import_mode: "amount_from_trainer_share",
          commission_percent: row.commission_percent ?? null
        }
      });
      records.push({ id: created.id });
      imported += 1;
    } catch (error) {
      failed += 1;
      errors.push({
        line: Number(row._line ?? 0),
        message: error instanceof Error ? error.message : "Import failed",
        severity: "error"
      });
    }
  }

  await supabase
    .from("package_commission_import_batches")
    .update({ imported_rows: imported, failed_rows: failed })
    .eq("id", batch.id);

  await writeCommissionAudit(supabase, {
    entityType: "import_batch",
    entityId: batch.id,
    action: "csv_imported",
    actor,
    metadata: { imported, failed, filename: input.filename ?? "paste.csv" }
  });

  return {
    batchId: batch.id,
    imported,
    failed,
    warnings,
    duplicates,
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

// silence unused rate helper warning in some tooling
void parsePercentToBps;
