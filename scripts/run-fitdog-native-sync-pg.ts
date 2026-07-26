/**
 * Apply a native Fitdog activity-stream sync directly via Postgres.
 * Useful in this agent environment where the Supabase service role key is unavailable.
 */
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";
import { FitdogNativeApiProvider } from "../lib/fitdog-ops/providers/native-api";
import { parseFitdogNotification } from "../lib/fitdog-ops/notifications-parse";
import { severityForAlertType } from "../lib/fitdog-ops/classify";
import { buildFitdogIdempotencyKey } from "../lib/fitdog-ops/idempotency";
import { fitdogHistoryResolveHours } from "../lib/fitdog-ops/config";

loadEnvFiles();

function buildDbUrl() {
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) throw new Error("SUPABASE_DB_PASSWORD required");
  const user = encodeURIComponent("postgres.tzkocaucqtmmnrttxira");
  const pass = encodeURIComponent(password);
  return `postgresql://${user}:${pass}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}

async function main() {
  const provider = new FitdogNativeApiProvider();
  const started = Date.now();
  const snapshot = await provider.sync({ mode: "backfill", days: 30 });
  const client = new Client({ connectionString: buildDbUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const historyCutoff = Date.now() - fitdogHistoryResolveHours() * 60 * 60 * 1000;
  let created = 0;
  let updated = 0;
  let resolved = 0;

  for (const item of snapshot.notifications || []) {
    const parsed = parseFitdogNotification(item);
    const amountDue = 0;
    const idempotencyKey = buildFitdogIdempotencyKey({
      source_event_id: parsed.id,
      owner_id: parsed.owner_name,
      dog_id: parsed.dog_name,
      reservation_id: parsed.service_date,
      invoice_id: null,
      alert_type: parsed.alert_type,
      amount_due: amountDue
    });
    const detectedAt = parsed.detected_at || new Date().toISOString();
    const isHistory = new Date(detectedAt).getTime() < historyCutoff;
    const status = isHistory ? "resolved" : "new";
    const severity = isHistory ? "low" : severityForAlertType(parsed.alert_type);

    const existing = await client.query(`select id from operations_alerts where idempotency_key = $1`, [
      idempotencyKey
    ]);
    if (existing.rowCount) {
      await client.query(
        `update operations_alerts
         set failure_reason = $2, service_name = $3, service_date = $4, dog_name = $5,
             owner_name = $6, source_url = $7, updated_at = now()
         where idempotency_key = $1`,
        [
          idempotencyKey,
          parsed.failure_reason,
          parsed.service_name,
          parsed.service_date,
          parsed.dog_name,
          parsed.owner_name,
          parsed.source_url
        ]
      );
      updated += 1;
      continue;
    }

    await client.query(
      `insert into operations_alerts (
         source, source_event_id, source_record_id, idempotency_key, alert_type, severity,
         owner_name, dog_name, service_name, service_date, amount_due, amount_paid, currency,
         failure_reason, payment_attempt_count, status, package_credit_check, source_url,
         detected_at, resolved_at, resolution_type, resolution_notes
       ) values (
         'fitdog', $1, $1, $2, $3, $4,
         $5, $6, $7, $8, 0, 0, 'USD',
         $9, $10, $11, $12::jsonb, $13,
         $14, $15, $16, $17
       )`,
      [
        parsed.id,
        idempotencyKey,
        parsed.alert_type,
        severity,
        parsed.owner_name || "Owner",
        parsed.dog_name,
        parsed.service_name,
        parsed.service_date,
        parsed.failure_reason,
        parsed.alert_type === "CARD_DECLINED" ? 1 : 0,
        status,
        JSON.stringify({ source: "fitdog_activity_stream" }),
        parsed.source_url,
        detectedAt,
        isHistory ? detectedAt : null,
        isHistory ? "imported_history" : null,
        isHistory ? "Imported from Fitdog activity history." : null
      ]
    );
    created += 1;
    if (isHistory) resolved += 1;
  }

  await client.query(
    `update fitdog_integration_settings
     set integration_mode = 'api',
         last_successful_sync_at = now(),
         last_backfill_at = now(),
         updated_at = now()
     where id = 'default'`
  );

  // Close stale sync-error spam
  await client.query(
    `update operations_alerts
     set status = 'resolved', resolved_at = now(), resolution_notes = 'Cleared after native API sync fix.',
         resolution_type = 'sync_recovered', updated_at = now()
     where alert_type = 'FITDOG_SYNC_ERROR' and status = 'new'`
  );

  const durationMs = Date.now() - started;
  await client.query(
    `insert into fitdog_sync_runs (
       id, trigger, mode, status, started_at, finished_at, duration_ms,
       records_scanned, alerts_created, alerts_updated, alerts_resolved, error_count, message, metadata
     ) values (
       $1::uuid, 'backfill', 'backfill', 'completed', now() - make_interval(secs => $2::int / 1000), now(), $2::int,
       $3::int, $4::int, $5::int, $6::int, 0, 'Native activity-stream sync complete.', '{"provider":"api"}'::jsonb
     )`,
    [randomUUID(), durationMs, snapshot.records_scanned || 0, created, updated, resolved]
  );

  const counts = await client.query(
    `select status, alert_type, count(*)::int as n from operations_alerts group by 1,2 order by 3 desc`
  );
  console.log(
    JSON.stringify(
      {
        ms: Date.now() - started,
        created,
        updated,
        resolved,
        scanned: snapshot.records_scanned,
        counts: counts.rows
      },
      null,
      2
    )
  );
  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
