/**
 * Repair null sale_date on ledger rows from legacy admin_settings JSON.
 * Run: npx tsx scripts/fix-commission-sale-dates.ts --apply
 */
import { Client } from "pg";
import { parseCommissionDate } from "../lib/staff/commission-ledger/dates";
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

  const settings = await client.query(`select settings from public.admin_settings where id = 'default'`);
  const pkg = (settings.rows[0]?.settings as { package_commissions?: { rows?: Array<Record<string, unknown>> } })
    ?.package_commissions;
  const legacyRows = Array.isArray(pkg?.rows) ? pkg.rows : [];
  const byLegacyId = new Map<string, string | null>();
  for (const row of legacyRows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    byLegacyId.set(id, parseCommissionDate(row.sold_at));
  }

  const missing = await client.query(
    `select id, legacy_id, sale_date, service_date from public.package_commission_records where sale_date is null`
  );
  console.log(`Rows missing sale_date: ${missing.rowCount ?? 0}`);

  let updated = 0;
  for (const row of missing.rows) {
    const legacyId = String(row.legacy_id ?? "");
    const parsed = legacyId ? byLegacyId.get(legacyId) : null;
    if (!parsed) continue;
    console.log(`  ${row.id} -> ${parsed}`);
    if (APPLY) {
      await client.query(
        `update public.package_commission_records
         set sale_date = $1, service_date = coalesce(service_date, $1), updated_at = now()
         where id = $2`,
        [parsed, row.id]
      );
    }
    updated += 1;
  }

  console.log(APPLY ? `Updated ${updated} row(s).` : `Would update ${updated} row(s). Re-run with --apply.`);
  await client.end();
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
