/**
 * CSV import over direct Postgres — same path the ledger GET already uses to
 * bypass hung PostgREST. Chunks commit independently so a lock wait cannot
 * roll back rows that already saved.
 */
import { commissionDedupeKey } from "./dedupe";
import { canListCommissionsViaPostgres, withCommissionPostgres } from "./list-via-postgres";
import {
  buildCommissionInsertPayload,
  type CreateCommissionInput
} from "./records";
import { isTimeoutLikeError } from "@/lib/safe-url";
import type { CommissionActor } from "./types";

const DUPLICATE_LOOKUP_TIMEOUT_MS = 1_500;
const IMPORT_WRITE_TIMEOUT_MS = 12_000;
const IMPORT_CONNECT_TIMEOUT_MS = 4_000;
const IMPORT_INSERT_CHUNK = 20;

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
           limit 1500`,
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
      {
        queryTimeoutMs: DUPLICATE_LOOKUP_TIMEOUT_MS,
        statementTimeoutMs: DUPLICATE_LOOKUP_TIMEOUT_MS,
        connectionTimeoutMs: 2_000
      }
    );
  } catch {
    return found;
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

type PreparedRow = {
  index: number;
  payload: ReturnType<typeof buildCommissionInsertPayload>["payload"];
};

function insertParams(payload: PreparedRow["payload"]) {
  return [
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
  ];
}

const INSERT_SQL_HEAD = `insert into package_commission_records (
   trainer_user_id, trainer_name, trainer_email, sale_date, service_date,
   client_name, dog_name, commission_type, package_or_class, quantity,
   gross_amount_cents, discount_amount_cents, refund_amount_cents, commission_rate_bps,
   calculated_commission_cents, final_commission_cents, review_status, approval_status,
   payment_status, refund_status, source, gingr_transaction_url, external_transaction_id,
   import_batch_id, rule_id, rule_snapshot, calculation_input, is_manual_override,
   override_reason, override_by, missing_required_info, validation_warnings,
   internal_notes, created_by
 )`;

function placeholdersForRow(offset: number) {
  const n = (index: number) => `$${offset + index + 1}`;
  return `(
    ${n(0)}, ${n(1)}, ${n(2)}, ${n(3)}::date, ${n(4)}::date,
    ${n(5)}, ${n(6)}, ${n(7)}, ${n(8)}, ${n(9)},
    ${n(10)}, ${n(11)}, ${n(12)}, ${n(13)},
    ${n(14)}, ${n(15)}, ${n(16)}, ${n(17)},
    ${n(18)}, ${n(19)}, ${n(20)}, ${n(21)}, ${n(22)},
    ${n(23)}, ${n(24)}, ${n(25)}::jsonb, ${n(26)}::jsonb, ${n(27)},
    ${n(28)}, ${n(29)}, ${n(30)}, ${n(31)}::jsonb,
    ${n(32)}, ${n(33)}
  )`;
}

async function insertChunk(
  client: import("pg").Client,
  batchId: string | null,
  chunk: PreparedRow[]
): Promise<{ ids: string[]; failures: { index: number; message: string }[]; timedOut: boolean }> {
  const values: unknown[] = [];
  const placeholders = chunk.map((item, rowIndex) => {
    values.push(...insertParams({ ...item.payload, import_batch_id: batchId }));
    return placeholdersForRow(rowIndex * 34);
  });
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '2s'");
    await client.query("set local statement_timeout = '8s'");
    const inserted = await client.query(
      `${INSERT_SQL_HEAD} values ${placeholders.join(",")} returning id`,
      values
    );
    await client.query("commit");
    return {
      ids: (inserted.rows as Array<{ id: string }>).map((row) => String(row.id)),
      failures: [],
      timedOut: false
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    if (isTimeoutLikeError(error) || /lock_timeout|canceling statement/i.test(String((error as Error)?.message ?? error))) {
      if (chunk.length === 1) {
        return {
          ids: [],
          failures: [],
          timedOut: isTimeoutLikeError(error)
        };
      }
      const ids: string[] = [];
      const failures: { index: number; message: string }[] = [];
      let timedOut = false;
      for (const item of chunk) {
        const one = await insertChunk(client, batchId, [item]);
        ids.push(...one.ids);
        failures.push(...one.failures);
        if (one.timedOut) {
          timedOut = true;
          break;
        }
        if (!one.ids.length && !one.failures.length) {
          const message = error instanceof Error ? error.message : "Import failed";
          failures.push({
            index: item.index,
            message: /same_day_dedupe|duplicate key|unique constraint/i.test(message)
              ? "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
              : message
          });
        }
      }
      return { ids, failures, timedOut };
    }
    if (chunk.length > 1) {
      const ids: string[] = [];
      const failures: { index: number; message: string }[] = [];
      let timedOut = false;
      for (const item of chunk) {
        const one = await insertChunk(client, batchId, [item]);
        ids.push(...one.ids);
        failures.push(...one.failures);
        if (one.timedOut) {
          timedOut = true;
          break;
        }
        if (!one.ids.length && !one.failures.length) {
          const message = error instanceof Error ? error.message : "Import failed";
          failures.push({
            index: item.index,
            message: /same_day_dedupe|duplicate key|unique constraint/i.test(message)
              ? "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
              : message
          });
        }
      }
      return { ids, failures, timedOut };
    }
    const message = error instanceof Error ? error.message : "Import failed";
    return {
      ids: [],
      failures: [
        {
          index: chunk[0]?.index ?? 0,
          message: /same_day_dedupe|duplicate key|unique constraint/i.test(message)
            ? "Duplicate commission already exists for this trainer/name/date/class. Same entry cannot be added twice."
            : message
        }
      ],
      timedOut: false
    };
  }
}

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
  const prepared: PreparedRow[] = [];
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
      let batchId: string | null = null;
      try {
        await client.query("begin");
        await client.query("set local lock_timeout = '2s'");
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
        await client.query("commit");
        batchId = String(batchResult.rows[0].id);
      } catch {
        try {
          await client.query("rollback");
        } catch {
          /* ignore */
        }
      }

      const records: { id: string }[] = [];
      let timedOut = false;

      for (let i = 0; i < prepared.length; i += IMPORT_INSERT_CHUNK) {
        const chunk = prepared.slice(i, i + IMPORT_INSERT_CHUNK);
        const inserted = await insertChunk(client, batchId, chunk);
        records.push(...inserted.ids.map((id) => ({ id })));
        failures.push(...inserted.failures);
        if (inserted.timedOut) {
          timedOut = true;
          break;
        }
      }

      if (batchId) {
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
          /* counts are best-effort */
        }
      }

      return { batchId: batchId ?? "import", records, failures, timedOut };
    },
    {
      queryTimeoutMs: IMPORT_WRITE_TIMEOUT_MS,
      statementTimeoutMs: IMPORT_WRITE_TIMEOUT_MS,
      connectionTimeoutMs: IMPORT_CONNECT_TIMEOUT_MS,
      preferSession: true
    }
  );
}
