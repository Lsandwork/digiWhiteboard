/**
 * CSV import over direct Postgres — same path the ledger GET already uses to
 * bypass hung PostgREST. One short connection, one transaction, no 25s REST
 * round-trips for duplicate scans or per-row inserts.
 */
import { commissionDedupeKey } from "./dedupe";
import { canListCommissionsViaPostgres, withCommissionPostgres } from "./list-via-postgres";
import {
  buildCommissionInsertPayload,
  type CreateCommissionInput
} from "./records";
import { isTimeoutLikeError } from "@/lib/safe-url";
import type { CommissionActor } from "./types";

const DUPLICATE_LOOKUP_TIMEOUT_MS = 2_500;
const IMPORT_WRITE_TIMEOUT_MS = 15_000;

export { canListCommissionsViaPostgres };

export async function loadExistingSameDayDuplicatesViaPostgres(saleDates: string[]): Promise<Set<string>> {
  const uniqueDates = [...new Set(saleDates.filter(Boolean))];
  const found = new Set<string>();
  if (!uniqueDates.length || !canListCommissionsViaPostgres()) return found;

  try {
    return await withCommissionPostgres(
      async (client) => {
        const result = await client.query(
          `select sale_date::text as sale_date, trainer_name, trainer_user_id, client_name, dog_name, package_or_class
           from package_commission_records
           where archived_at is null
             and sale_date = any($1::date[])
           limit 4000`,
          [uniqueDates]
        );
        for (const row of result.rows as Array<Record<string, unknown>>) {
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
        return found;
      },
      { queryTimeoutMs: DUPLICATE_LOOKUP_TIMEOUT_MS, statementTimeoutMs: DUPLICATE_LOOKUP_TIMEOUT_MS }
    );
  } catch (error) {
    if (isTimeoutLikeError(error)) return found;
    throw error;
  }
}

type ImportBatchMeta = {
  filename: string;
  uploadedBy: string | null;
  totalRows: number;
  warningRows: number;
  failedRows: number;
  duplicateRows: number;
  grossTotalCents: number;
  commissionTotalCents: number;
};

export async function insertCommissionImportViaPostgres(
  actor: CommissionActor,
  batch: ImportBatchMeta,
  inputs: CreateCommissionInput[]
): Promise<{
  batchId: string;
  records: { id: string }[];
  failures: { index: number; message: string }[];
  timedOut: boolean;
}> {
  const prepared: { index: number; payload: ReturnType<typeof buildCommissionInsertPayload>["payload"] }[] = [];
  const failures: { index: number; message: string }[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    try {
      prepared.push({ index, payload: buildCommissionInsertPayload(actor, inputs[index]).payload });
    } catch (error) {
      failures.push({ index, message: error instanceof Error ? error.message : "Invalid row" });
    }
  }

  return withCommissionPostgres(
    async (client) => {
      const batchResult = await client.query(
        `insert into package_commission_import_batches (
           original_filename, uploaded_by, mapping_template, total_rows, imported_rows,
           warning_rows, failed_rows, duplicate_rows, gross_total_cents, commission_total_cents, status
         ) values ($1, $2, $3::jsonb, $4, 0, $5, $6, $7, $8, $9, 'completed')
         returning id`,
        [
          batch.filename,
          batch.uploadedBy,
          JSON.stringify({ format: "auto_gingr_or_legacy" }),
          batch.totalRows,
          batch.warningRows,
          batch.failedRows,
          batch.duplicateRows,
          batch.grossTotalCents,
          batch.commissionTotalCents
        ]
      );
      const batchId = String(batchResult.rows[0].id);
      const records: { id: string }[] = [];
      let timedOut = false;

      for (const item of prepared) {
        const payload = { ...item.payload, import_batch_id: batchId };
        try {
          const inserted = await client.query(
            `insert into package_commission_records (
               trainer_user_id, trainer_name, trainer_email, sale_date, service_date,
               client_name, dog_name, commission_type, package_or_class, quantity,
               gross_amount_cents, discount_amount_cents, refund_amount_cents, commission_rate_bps,
               calculated_commission_cents, final_commission_cents, review_status, approval_status,
               payment_status, refund_status, source, gingr_transaction_url, external_transaction_id,
               import_batch_id, rule_id, rule_snapshot, calculation_input, is_manual_override,
               override_reason, override_by, missing_required_info, validation_warnings,
               internal_notes, created_by
             ) values (
               $1, $2, $3, $4::date, $5::date,
               $6, $7, $8, $9, $10,
               $11, $12, $13, $14,
               $15, $16, $17, $18,
               $19, $20, $21, $22, $23,
               $24, $25, $26::jsonb, $27::jsonb, $28,
               $29, $30, $31, $32::jsonb,
               $33, $34
             ) returning id`,
            [
              payload.trainer_user_id,
              payload.trainer_name,
              payload.trainer_email,
              payload.sale_date,
              payload.service_date,
              payload.client_name,
              payload.dog_name,
              payload.commission_type,
              payload.package_or_class,
              payload.quantity,
              payload.gross_amount_cents,
              payload.discount_amount_cents,
              payload.refund_amount_cents,
              payload.commission_rate_bps,
              payload.calculated_commission_cents,
              payload.final_commission_cents,
              payload.review_status,
              payload.approval_status,
              payload.payment_status,
              payload.refund_status,
              payload.source,
              payload.gingr_transaction_url,
              payload.external_transaction_id,
              payload.import_batch_id,
              payload.rule_id,
              JSON.stringify(payload.rule_snapshot ?? {}),
              JSON.stringify(payload.calculation_input ?? {}),
              payload.is_manual_override,
              payload.override_reason,
              payload.override_by,
              payload.missing_required_info,
              JSON.stringify(payload.validation_warnings ?? []),
              payload.internal_notes,
              payload.created_by
            ]
          );
          records.push({ id: String(inserted.rows[0].id) });
        } catch (error) {
          if (isTimeoutLikeError(error)) {
            timedOut = true;
            break;
          }
          const message = error instanceof Error ? error.message : "Import failed";
          failures.push({
            index: item.index,
            message: /same_day_dedupe|duplicate key|unique constraint/i.test(message)
              ? "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
              : message
          });
        }
      }

      try {
        await client.query(
          `update package_commission_import_batches
           set imported_rows = $2, failed_rows = $3, duplicate_rows = $4
           where id = $1`,
          [
            batchId,
            records.length,
            batch.failedRows + failures.filter((f) => !/duplicate/i.test(f.message)).length,
            batch.duplicateRows + failures.filter((f) => /duplicate/i.test(f.message)).length
          ]
        );
      } catch {
        /* counts are best-effort after a slow import */
      }
      return { batchId, records, failures, timedOut };
    },
    { queryTimeoutMs: IMPORT_WRITE_TIMEOUT_MS, statementTimeoutMs: IMPORT_WRITE_TIMEOUT_MS }
  );
}
