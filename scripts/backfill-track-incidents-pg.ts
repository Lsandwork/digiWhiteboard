/**
 * Backfill track_incidents from gingr_webhook_events via Postgres (bypasses PostgREST cache).
 * Run: npx tsx scripts/backfill-track-incidents-pg.ts
 */
import { Client } from "pg";
import type { GingrWebhookPayload } from "../lib/gingr";
import { normalizeGingrIncidentPayload } from "../lib/staff/track-incidents/normalize";
import { loadEnvFiles } from "./load-env-local";

async function main() {
  loadEnvFiles();
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("Missing SUPABASE_DB_PASSWORD");
  const ref = "tzkocaucqtmmnrttxira";
  const client = new Client({
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const tables = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name in ('track_incidents','track_incident_sync_runs')
     order by 1`
  );
  console.log("tables", tables.rows);

  const { rows: events } = await client.query<{
    id: string;
    payload: GingrWebhookPayload;
  }>(
    `select id, payload
     from public.gingr_webhook_events
     where webhook_type in ('incident_created','incident_edited')
     order by created_at asc`
  );

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const normalized = normalizeGingrIncidentPayload(event.payload);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    const existing = await client.query(
      `select id from public.track_incidents where gingr_incident_id = $1 limit 1`,
      [normalized.gingr_incident_id]
    );

    if (existing.rowCount) {
      await client.query(
        `update public.track_incidents set
           incident_number = $1,
           occurred_at = $2,
           dog_name = $3,
           gingr_animal_id = $4,
           owner_name = $5,
           gingr_owner_id = $6,
           incident_type = $7,
           incident_type_id = $8,
           reported_by = $9,
           reported_by_username = $10,
           location_name = $11,
           location_id = $12,
           notes = $13,
           raw_payload = $14::jsonb,
           gingr_webhook_event_id = $15,
           latest_update = $16,
           updated_at = now()
         where gingr_incident_id = $17`,
        [
          normalized.incident_number,
          normalized.occurred_at,
          normalized.dog_name,
          normalized.gingr_animal_id,
          normalized.owner_name,
          normalized.gingr_owner_id,
          normalized.incident_type,
          normalized.incident_type_id,
          normalized.reported_by,
          normalized.reported_by_username,
          normalized.location_name,
          normalized.location_id,
          normalized.notes,
          JSON.stringify(normalized.raw_payload),
          event.id,
          `Synced from Gingr ${new Date().toISOString()}`,
          normalized.gingr_incident_id
        ]
      );
      updated += 1;
    } else {
      await client.query(
        `insert into public.track_incidents (
           incident_number, gingr_incident_id, occurred_at, source,
           dog_name, gingr_animal_id, owner_name, gingr_owner_id,
           incident_type, incident_type_id, reported_by, reported_by_username,
           location_name, location_id, notes, status, priority,
           raw_payload, gingr_webhook_event_id, latest_update
         ) values (
           $1,$2,$3,'gingr',
           $4,$5,$6,$7,
           $8,$9,$10,$11,
           $12,$13,$14,'new','medium',
           $15::jsonb,$16,$17
         )`,
        [
          normalized.incident_number,
          normalized.gingr_incident_id,
          normalized.occurred_at,
          normalized.dog_name,
          normalized.gingr_animal_id,
          normalized.owner_name,
          normalized.gingr_owner_id,
          normalized.incident_type,
          normalized.incident_type_id,
          normalized.reported_by,
          normalized.reported_by_username,
          normalized.location_name,
          normalized.location_id,
          normalized.notes,
          JSON.stringify(normalized.raw_payload),
          event.id,
          `Imported from Gingr webhook ${new Date().toISOString()}`
        ]
      );
      imported += 1;
    }

    await client.query(
      `update public.gingr_webhook_events
       set processed = true, processing_error = null
       where id = $1`,
      [event.id]
    );
  }

  await client.query(
    `insert into public.track_incident_sync_runs
       (trigger, status, finished_at, imported_count, updated_count, skipped_count, message, metadata)
     values ('manual', 'completed', now(), $1, $2, $3, $4, $5::jsonb)`,
    [
      imported,
      updated,
      skipped,
      "Initial backfill from Gingr incident webhooks via Postgres.",
      JSON.stringify({ gingr_http_calls: 0 })
    ]
  );

  const count = await client.query(`select count(*)::int as n from public.track_incidents`);
  console.log({ imported, updated, skipped, total: count.rows[0]?.n });
  await client.end();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
