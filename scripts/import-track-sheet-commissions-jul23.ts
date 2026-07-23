/**
 * Import track-sheet commission rows (Jul 2026) into package_commission_records.
 * Run: npx tsx scripts/import-track-sheet-commissions-jul23.ts --apply
 */
import { Client } from "pg";
import {
  detectServiceLocation,
  trainerRateBpsForPackage
} from "../lib/staff/commission-ledger/location-rate";
import { calculatePercentCommissionCents } from "../lib/staff/commission-ledger/money";
import { loadEnvFiles } from "./load-env-local";

const APPLY = process.argv.includes("--apply");

type Row = {
  dog_name: string;
  client_name: string;
  package_or_class: string;
  gross_cents: number;
  sale_date: string;
  source_url: string;
  added_by: string;
  external_transaction_id: string | null;
};

const ROWS: Row[] = [
  {
    dog_name: "Daisy",
    client_name: "Debra Martin",
    package_or_class: "PUPPY JUMPSTART",
    gross_cents: 99_500,
    sale_date: "2026-07-17",
    source_url: "https://fitdog.gingrapp.com/sale/view_transaction/id/226768",
    added_by: "Ivonne",
    external_transaction_id: "226768"
  },
  {
    dog_name: "Lona",
    client_name: "Laura Baysinger",
    package_or_class: "1 HOME Private Session",
    gross_cents: 22_500,
    sale_date: "2026-07-21",
    source_url: "https://fitdog.gingrapp.com/sale/view_transaction/id/226940",
    added_by: "Ivonne",
    external_transaction_id: "226940"
  },
  {
    dog_name: "Winston",
    client_name: "Kirstin Me",
    package_or_class: "@ Home - Core Pack",
    gross_cents: 260_000,
    sale_date: "2026-07-21",
    source_url: "https://fitdog.gingrapp.com/sale/view_transaction/id/226941",
    added_by: "Ivonne",
    external_transaction_id: "226941"
  },
  {
    dog_name: "Moose",
    client_name: "Paige Williams",
    package_or_class: "3 Pack @ Facility",
    gross_cents: 45_000,
    sale_date: "2026-07-21",
    source_url: "https://app.fitdog.com/dashboard/customer/4993/transactions",
    added_by: "Ivonne",
    external_transaction_id: "app-customer-4993"
  },
  {
    dog_name: "Wiggie",
    client_name: "Yulie Mack",
    package_or_class: "3 Pack @ Home",
    gross_cents: 60_000,
    sale_date: "2026-07-20",
    source_url: "https://fitdog.gingrapp.com/sale/view_transaction/id/226885",
    added_by: "Amanda",
    external_transaction_id: "226885"
  }
];

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

  let inserted = 0;
  let skipped = 0;

  for (const row of ROWS) {
    const rateBps = trainerRateBpsForPackage(row.package_or_class);
    const commission = calculatePercentCommissionCents(row.gross_cents, rateBps);
    const location = detectServiceLocation(row.package_or_class);

    const existing = await client.query(
      `select id from public.package_commission_records
       where archived_at is null
         and dog_name = $1
         and client_name = $2
         and sale_date = $3
         and package_or_class = $4
         and gross_amount_cents = $5
       limit 1`,
      [row.dog_name, row.client_name, row.sale_date, row.package_or_class, row.gross_cents]
    );
    if (existing.rowCount) {
      console.log(`SKIP (exists) ${row.dog_name} / ${row.package_or_class}`);
      skipped += 1;
      continue;
    }

    console.log(
      `${APPLY ? "INSERT" : "WOULD INSERT"} ${row.dog_name} | ${row.client_name} | ${row.package_or_class} | ${location} ${rateBps / 100}% | $${(commission / 100).toFixed(2)} | ${row.source_url}`
    );

    if (!APPLY) continue;

    const { rows: created } = await client.query(
      `insert into public.package_commission_records (
         trainer_name, sale_date, service_date, client_name, dog_name,
         commission_type, package_or_class, quantity,
         gross_amount_cents, discount_amount_cents, refund_amount_cents,
         commission_rate_bps, calculated_commission_cents, final_commission_cents,
         review_status, approval_status, payment_status, refund_status,
         source, gingr_transaction_url, external_transaction_id,
         rule_snapshot, calculation_input, internal_notes,
         missing_required_info, validation_warnings
       ) values (
         'Unassigned', $1, $1, $2, $3,
         'package_sale', $4, 1,
         $5, 0, 0,
         $6, $7, $7,
         'needs_review', 'pending', 'unpaid', 'none',
         'manual', $8, $9,
         $10::jsonb, $11::jsonb, $12,
         true, $13::jsonb
       )
       returning id`,
      [
        row.sale_date,
        row.client_name,
        row.dog_name,
        row.package_or_class,
        row.gross_cents,
        rateBps,
        commission,
        row.source_url,
        row.external_transaction_id,
        JSON.stringify({
          import_mode: "location_split",
          location,
          track_sheet: "jul23",
          added_by: row.added_by
        }),
        JSON.stringify({
          gross_cents: row.gross_cents,
          rate_bps: rateBps,
          location_split: true,
          location
        }),
        `Imported from track sheet. Added by ${row.added_by}. Assign trainer.`,
        JSON.stringify(["Missing trainer assignment"])
      ]
    );

    await client.query(
      `insert into public.package_commission_audit_events
         (record_id, action, new_value, reason, metadata)
       values ($1, 'record_created', $2, $3, $4::jsonb)`,
      [
        created[0].id,
        String(commission),
        "Track sheet import Jul 23",
        JSON.stringify({ source_url: row.source_url, dog: row.dog_name })
      ]
    );
    inserted += 1;
  }

  console.log(
    APPLY
      ? `\nInserted ${inserted}, skipped ${skipped}.`
      : `\nWould insert ${ROWS.length - skipped}, skip ${skipped}. Re-run with --apply.`
  );
  await client.end();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
