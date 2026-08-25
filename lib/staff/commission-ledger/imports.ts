type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;
import { assertCanManage } from "./auth";
import { writeCommissionAudit } from "./audit";
import { insertCommissionRecordsForImport } from "./records";
import { isTimeoutLikeError } from "@/lib/safe-url";
import { COMMISSIONS_IMPORT_SLOW_MESSAGE } from "./import-timeouts";
import {
  canListCommissionsViaPostgres,
  insertCommissionImportViaPostgres,
  loadExistingSameDayDuplicatesViaPostgres
} from "./import-via-postgres";
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
import { commissionDedupeKey } from "./dedupe";
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
  timedOut?: boolean;
};

function saleCategoryToType(category: unknown) {
  return String(category ?? "").toLowerCase() === "class" ? "group_class" : "package_sale";
}

function parseSoldDate(value: unknown): string | null {
  return parseCommissionDate(value);
}

async function loadExistingSameDayDuplicates(
  supabase: SupabaseClient,
  saleDates: string[]
): Promise<Set<string>> {
  const uniqueDates = [...new Set(saleDates.filter(Boolean))];
  const found = new Set<string>();
  if (!uniqueDates.length) return found;

  const chunkSize = 40;
  for (let i = 0; i < uniqueDates.length; i += chunkSize) {
    const chunk = uniqueDates.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("package_commission_records")
      .select("sale_date, trainer_name, trainer_user_id, client_name, dog_name, package_or_class")
      .in("sale_date", chunk)
      .is("archived_at", null)
      .limit(400);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      found.add(
        commissionDedupeKey({
          trainerName: String(row.trainer_name ?? ""),
          trainerUserId: (row.trainer_user_id as string) || null,
          clientName: String(row.client_name ?? ""),
          dogName: String(row.dog_name ?? ""),
          packageOrClass: String(row.package_or_class ?? ""),
          saleDate: String(row.sale_date ?? "").slice(0, 10)
        })
      );
    }
  }
  return found;
}

async function insertImportErrorRows(
  supabase: SupabaseClient,
  batchId: string,
  errors: ImportStageResult["errors"]
) {
  if (!errors.length) return;
  const rows = errors.map((err) => ({
    batch_id: batchId,
    row_number: err.line,
    severity:
      err.severity === "warning"
        ? "warning"
        : err.severity === "duplicate" || err.message.toLowerCase().includes("duplicate")
          ? "duplicate"
          : "error",
    message: err.message,
    raw_row: {}
  }));
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await supabase.from("package_commission_import_errors").insert(rows.slice(i, i + chunkSize));
  }
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

  const saleDates = parsed
    .map((row) => parseSoldDate(row.sold_at))
    .filter((value): value is string => Boolean(value));
  let existingKeys = new Set<string>();
  try {
    existingKeys = canListCommissionsViaPostgres()
      ? await loadExistingSameDayDuplicatesViaPostgres(saleDates)
      : await loadExistingSameDayDuplicates(supabase, saleDates);
  } catch (error) {
    if (!isTimeoutLikeError(error)) throw error;
  }

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

    // Same name + date + class: never import twice (ledger or within this CSV).
    if (saleDate && dog && client && pkg) {
      const fingerprint = commissionDedupeKey({
        trainerName: resolvedTrainerName,
        trainerUserId,
        clientName: client,
        dogName: dog,
        packageOrClass: pkg,
        saleDate
      });

      if (seenInBatch.has(fingerprint) || existingKeys.has(fingerprint)) {
        duplicates += 1;
        errors.push({
          line: i + 1,
          message: seenInBatch.has(fingerprint)
            ? "Duplicate in CSV (same trainer/name/date/class) — skipped"
            : "Duplicate same name/date/class already in ledger — skipped",
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

  const createInputs = previewRows.map((row) => {
    const useInvoiceShare = Boolean(row._useInvoiceShare);
    return {
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
      source: "csv_import" as const,
      internal_notes: row.notes ? String(row.notes) : null,
      allow_duplicate: true,
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
    };
  });

  const records: { id: string }[] = [];
  let imported = 0;
  let failed = errors.filter((e) => e.severity === "error").length;
  let timedOut = false;
  let batchId = "import";

  const applyInserted = (inserted: {
    records: { id: string }[];
    failures: { index: number; message: string }[];
    timedOut: boolean;
  }) => {
    timedOut = inserted.timedOut;
    records.push(...inserted.records);
    imported = inserted.records.length;
    for (const failure of inserted.failures) {
      const line = Number(previewRows[failure.index]?._line ?? 0);
      const isDuplicate = /duplicate/i.test(failure.message);
      if (isDuplicate) {
        duplicates += 1;
        errors.push({ line, message: failure.message, severity: "duplicate" });
      } else {
        failed += 1;
        errors.push({ line, message: failure.message, severity: "error" });
      }
    }
    if (timedOut) {
      const remaining = previewRows.length - imported - inserted.failures.length;
      failed += Math.max(0, remaining);
      errors.push({
        line: 0,
        message: COMMISSIONS_IMPORT_SLOW_MESSAGE,
        severity: "error"
      });
    }
  };

  if (canListCommissionsViaPostgres()) {
    try {
      const inserted = await insertCommissionImportViaPostgres(
        actor,
        {
          filename: input.filename ?? "paste.csv",
          uploadedBy: actor.adminUserId ?? null,
          totalRows: parsed.length,
          warningRows: warnings,
          failedRows: errors.filter((e) => e.severity === "error").length,
          duplicateRows: duplicates,
          grossTotalCents: grossTotal,
          commissionTotalCents: commissionTotal
        },
        createInputs
      );
      batchId = inserted.batchId;
      applyInserted(inserted);
      return {
        batchId,
        imported,
        failed,
        warnings,
        duplicates,
        skippedDuplicates: duplicates,
        errors,
        records,
        timedOut
      };
    } catch (error) {
      if (isTimeoutLikeError(error)) {
        timedOut = true;
        errors.push({ line: 0, message: COMMISSIONS_IMPORT_SLOW_MESSAGE, severity: "error" });
        return {
          batchId,
          imported,
          failed,
          warnings,
          duplicates,
          skippedDuplicates: duplicates,
          errors,
          records,
          timedOut
        };
      }
      // Connect/schema miss — save via REST instead of failing the whole CSV.
    }
  }

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
  batchId = batch.id;

  try {
    const inserted = await insertCommissionRecordsForImport(
      supabase,
      actor,
      createInputs.map((row) => ({ ...row, import_batch_id: batch.id }))
    );
    applyInserted(inserted);
  } catch (error) {
    if (!isTimeoutLikeError(error)) throw error;
    timedOut = true;
    errors.push({
      line: 0,
      message: COMMISSIONS_IMPORT_SLOW_MESSAGE,
      severity: "error"
    });
  }

  try {
    await insertImportErrorRows(supabase, batch.id, errors);
    await supabase
      .from("package_commission_import_batches")
      .update({
        imported_rows: imported,
        failed_rows: failed,
        duplicate_rows: duplicates
      })
      .eq("id", batch.id);

    await writeCommissionAudit(supabase, {
      entityType: "import_batch",
      entityId: batch.id,
      action: "csv_imported",
      actor,
      metadata: { imported, failed, duplicates, timedOut, filename: input.filename ?? "paste.csv" }
    });
  } catch (error) {
    if (!isTimeoutLikeError(error)) throw error;
    timedOut = true;
  }

  return {
    batchId,
    imported,
    failed,
    warnings,
    duplicates,
    skippedDuplicates: duplicates,
    errors,
    records,
    timedOut
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
