/**
 * One-time merge: link Ivonne Campuzano commission rows to ivonneeBICE@gmail.com.
 * Run: npx tsx scripts/merge-trainer-ivonne.ts --apply
 */
import { Client } from "pg";
import { loadEnvFiles } from "./load-env-local";

const TARGET_USER_ID = "fadf94f4-010b-441e-83e6-7c45d60ed3a3";
const TARGET_EMAIL = "ivonneeBICE@gmail.com";
const TARGET_NAME = "Ivonne Campuzano";
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

  try {
    const user = await client.query(
      `select id, full_name, email, role, status from public.admin_users where id = $1`,
      [TARGET_USER_ID]
    );
    if (!user.rows[0]) throw new Error(`Target user ${TARGET_USER_ID} not found.`);
    console.log("Before admin_users:", user.rows[0]);

    const ledgerBefore = await client.query(
      `select trainer_user_id, trainer_name, trainer_email, count(*)::int as records
       from public.package_commission_records
       where lower(trainer_name) like '%ivonne%'
          or lower(trainer_name) like '%campuzano%'
          or lower(coalesce(trainer_email, '')) like '%ivonne%'
          or lower(coalesce(trainer_email, '')) like '%bice%'
       group by trainer_user_id, trainer_name, trainer_email`
    );
    console.log("\nBefore ledger:", ledgerBefore.rows);

    const settingsRow = await client.query(`select settings from public.admin_settings where id = 'default'`);
    const settings = (settingsRow.rows[0]?.settings ?? {}) as Record<string, unknown>;
    const pkg = settings.package_commissions as { rows?: Array<Record<string, unknown>> } | undefined;
    const legacyRows = Array.isArray(pkg?.rows) ? pkg.rows : [];
    const legacyMatches = legacyRows.filter((row) =>
      /ivonne|campuzano/i.test(String(row.trainer_name ?? "")) ||
      /ivonne|bice/i.test(String(row.trainer_email ?? ""))
    );
    console.log(`\nLegacy JSON rows to update: ${legacyMatches.length}`);

    if (!APPLY) {
      console.log("\nDry run only. Re-run with --apply to write changes.");
      return;
    }

    await client.query("BEGIN");

    await client.query(
      `update public.admin_users
       set full_name = $1,
           email = lower($2),
           updated_at = now()
       where id = $3`,
      [TARGET_NAME, TARGET_EMAIL, TARGET_USER_ID]
    );

    const ledgerUpdate = await client.query(
      `update public.package_commission_records
       set trainer_user_id = $1,
           trainer_email = lower($2),
           trainer_name = $3,
           updated_at = now()
       where lower(trainer_name) like '%ivonne%'
          or lower(trainer_name) like '%campuzano%'
          or lower(coalesce(trainer_email, '')) like '%ivonne%'
          or lower(coalesce(trainer_email, '')) like '%bice%'
          or trainer_user_id = $1`,
      [TARGET_USER_ID, TARGET_EMAIL, TARGET_NAME]
    );
    console.log(`\nUpdated ledger rows: ${ledgerUpdate.rowCount ?? 0}`);

    let legacyUpdated = 0;
    for (const row of legacyRows) {
      const name = String(row.trainer_name ?? "");
      const email = String(row.trainer_email ?? "");
      const matches =
        /ivonne|campuzano/i.test(name) ||
        /ivonne|bice/i.test(email) ||
        row.trainer_user_id === TARGET_USER_ID;
      if (!matches) continue;
      row.trainer_user_id = TARGET_USER_ID;
      row.trainer_email = TARGET_EMAIL.toLowerCase();
      row.trainer_name = TARGET_NAME;
      legacyUpdated += 1;
    }
    settings.package_commissions = { ...(pkg ?? {}), rows: legacyRows };
    await client.query(
      `update public.admin_settings set settings = $1::jsonb, updated_at = now() where id = 'default'`,
      [JSON.stringify(settings)]
    );
    console.log(`Updated legacy JSON rows: ${legacyUpdated}`);

    const directoryUpdate = await client.query(
      `update public.staff_directory
       set name = $1,
           email = lower($2),
           admin_user_id = $3,
           updated_at = now()
       where admin_user_id = $3
          or lower(coalesce(email, '')) like '%ivonne%'
          or lower(coalesce(email, '')) like '%bice%'
          or lower(name) like '%ivonne%'
          or lower(name) like '%campuzano%'`,
      [TARGET_NAME, TARGET_EMAIL, TARGET_USER_ID]
    );
    console.log(`Updated staff_directory rows: ${directoryUpdate.rowCount ?? 0}`);

    await client.query(
      `insert into public.admin_audit_logs (actor_email, action, target_type, target_id, details)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        "system@fitdog.merge",
        "trainer.merge_commissions",
        "admin_users",
        TARGET_USER_ID,
        JSON.stringify({
          trainer_name: TARGET_NAME,
          email: TARGET_EMAIL.toLowerCase(),
          ledger_rows: ledgerUpdate.rowCount ?? 0,
          legacy_rows: legacyUpdated
        })
      ]
    );

    await client.query("COMMIT");
    console.log("\nMerge complete.");

    const after = await client.query(
      `select id, full_name, email from public.admin_users where id = $1`,
      [TARGET_USER_ID]
    );
    console.log("After admin_users:", after.rows[0]);

    const ledgerAfter = await client.query(
      `select trainer_user_id, trainer_name, trainer_email, count(*)::int as records
       from public.package_commission_records
       where trainer_user_id = $1
       group by trainer_user_id, trainer_name, trainer_email`,
      [TARGET_USER_ID]
    );
    console.log("After ledger:", ledgerAfter.rows);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
