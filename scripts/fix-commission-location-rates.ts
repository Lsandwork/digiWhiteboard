/**
 * Recompute trainer commission splits by service location:
 *   At-home packages/sessions → 70% trainer / 30% Fitdog
 *   Facility packages/sessions → 50% trainer / 50% Fitdog
 *
 * Skips locked payroll periods, refund/adjustment overrides, and archived rows.
 * Run: npx tsx scripts/fix-commission-location-rates.ts
 * Apply: npx tsx scripts/fix-commission-location-rates.ts --apply
 */
import { Client } from "pg";
import {
  detectServiceLocation,
  trainerRateBpsForPackage
} from "../lib/staff/commission-ledger/location-rate";
import { calculatePercentCommissionCents } from "../lib/staff/commission-ledger/money";
import { loadEnvFiles } from "./load-env-local";

const APPLY = process.argv.includes("--apply");

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

  const { rows } = await client.query<{
    id: string;
    package_or_class: string;
    gross_amount_cents: number;
    discount_amount_cents: number;
    commission_rate_bps: number | null;
    calculated_commission_cents: number;
    final_commission_cents: number;
    commission_type: string;
    source: string;
    is_manual_override: boolean;
    payroll_status: string | null;
  }>(`
    select
      r.id,
      r.package_or_class,
      r.gross_amount_cents,
      r.discount_amount_cents,
      r.commission_rate_bps,
      r.calculated_commission_cents,
      r.final_commission_cents,
      r.commission_type,
      r.source,
      r.is_manual_override,
      p.status as payroll_status
    from public.package_commission_records r
    left join public.package_commission_payroll_periods p on p.id = r.payroll_period_id
    where r.archived_at is null
    order by r.sale_date nulls last, r.created_at
  `);

  let wouldUpdate = 0;
  let skippedLocked = 0;
  let skippedAdjustment = 0;
  let alreadyCorrect = 0;
  const byLocation = { at_home: 0, facility: 0 };

  for (const row of rows) {
    if (row.payroll_status === "locked") {
      skippedLocked += 1;
      continue;
    }
    if (row.commission_type === "refund_reversal" || row.source === "adjustment") {
      skippedAdjustment += 1;
      continue;
    }

    const location = detectServiceLocation(row.package_or_class);
    byLocation[location] += 1;
    const rateBps = trainerRateBpsForPackage(row.package_or_class);
    const base = Math.max(0, Number(row.gross_amount_cents) - Number(row.discount_amount_cents));
    const calculated = calculatePercentCommissionCents(base, rateBps);
    const needsUpdate =
      row.commission_rate_bps !== rateBps ||
      row.calculated_commission_cents !== calculated ||
      row.final_commission_cents !== calculated ||
      row.is_manual_override === true;

    if (!needsUpdate) {
      alreadyCorrect += 1;
      continue;
    }

    wouldUpdate += 1;
    if (wouldUpdate <= 25 || APPLY) {
      console.log(
        `${row.id.slice(0, 8)} | ${location.padEnd(8)} | ${String(row.commission_rate_bps ?? "null").padStart(4)}→${rateBps} | $${(row.final_commission_cents / 100).toFixed(2)}→$${(calculated / 100).toFixed(2)} | ${row.package_or_class}`
      );
    }

    if (APPLY) {
      await client.query(
        `update public.package_commission_records
         set commission_rate_bps = $1,
             calculated_commission_cents = $2,
             final_commission_cents = $2,
             is_manual_override = false,
             override_reason = null,
             override_by = null,
             calculation_input = coalesce(calculation_input, '{}'::jsonb) || $3::jsonb,
             updated_at = now()
         where id = $4`,
        [
          rateBps,
          calculated,
          JSON.stringify({
            rate_bps: rateBps,
            location_split: true,
            location,
            repaired_at: new Date().toISOString()
          }),
          row.id
        ]
      );
      await client.query(
        `insert into public.package_commission_audit_events
           (record_id, action, field_name, old_value, new_value, reason, metadata)
         values ($1, 'record_updated', 'commission_rate', $2, $3, $4, $5::jsonb)`,
        [
          row.id,
          String(row.final_commission_cents),
          String(calculated),
          "Location split repair: at-home 70/30, facility 50/50",
          JSON.stringify({
            old_rate_bps: row.commission_rate_bps,
            new_rate_bps: rateBps,
            location
          })
        ]
      );
    }
  }

  console.log("\nSummary");
  console.log(`  scanned: ${rows.length}`);
  console.log(`  at_home: ${byLocation.at_home}`);
  console.log(`  facility: ${byLocation.facility}`);
  console.log(`  already correct: ${alreadyCorrect}`);
  console.log(`  skipped locked payroll: ${skippedLocked}`);
  console.log(`  skipped refund/adjustment: ${skippedAdjustment}`);
  console.log(
    APPLY
      ? `  updated: ${wouldUpdate}`
      : `  would update: ${wouldUpdate}. Re-run with --apply to write.`
  );

  await client.end();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
