/**
 * Staff Directory reconciliation CLI — DRY RUN by default.
 *
 *   npx tsx scripts/reconcile-staff-directory.ts              # report only, writes nothing
 *   STAFF_DIRECTORY_RECONCILE_CONFIRM=APPLY npx tsx scripts/reconcile-staff-directory.ts --apply
 *
 * Apply mode: writes a verified backup of staff_admin_ops + report under
 * tmp/staff-directory-backups/ BEFORE mutating, then applies only the
 * unambiguous additions/links from a fresh server-side report. It never
 * creates logins, changes roles/passwords/status, or deletes profiles.
 * Point .env.local at the intended project — treat the linked project as production.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./load-env-local";

loadEnvFiles();

import { listAdminUsers } from "@/lib/admin/users";
import {
  applyStaffDirectoryReconciliation,
  listStaffOps,
  previewStaffDirectoryReconciliation
} from "@/lib/staff/admin-ops";
import { getServiceSupabase } from "@/lib/supabase/server";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  const supabase = getServiceSupabase();
  const [preview, state, users] = await Promise.all([
    previewStaffDirectoryReconciliation(supabase),
    listStaffOps(supabase),
    listAdminUsers(supabase)
  ]);
  const report = preview.report;
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    revision: preview.revision,
    directoryCount: state.staff_directory.length,
    accountCount: users.length,
    summary: report.summary,
    proposedAdditions: report.proposedAdditions,
    proposedLinks: report.proposedLinks,
    flagged: report.flagged,
    excludedAccounts: report.excludedAccounts
  }, null, 2));

  if (!apply) {
    console.log("\nDry run only — no data was changed. Re-run with --apply + STAFF_DIRECTORY_RECONCILE_CONFIRM=APPLY after human review.");
    return;
  }
  if (process.env.STAFF_DIRECTORY_RECONCILE_CONFIRM !== "APPLY") {
    throw new Error("Refusing to apply: set STAFF_DIRECTORY_RECONCILE_CONFIRM=APPLY to confirm this production write.");
  }

  // Verified backup of the complete affected object before any write.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(process.cwd(), "tmp", "staff-directory-backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `staff-admin-ops-${stamp}.json`);
  writeFileSync(backupPath, JSON.stringify({ backedUpAt: new Date().toISOString(), revision: preview.revision, staff_admin_ops: state, report }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  const approvedAccountIds = [
    ...report.proposedAdditions.map((i) => i.accountId),
    ...report.proposedLinks.map((i) => i.accountId)
  ];
  const result = await applyStaffDirectoryReconciliation(supabase, "script:reconcile-staff-directory", {
    expectedRevision: preview.revision,
    approvedAccountIds
  });
  console.log(JSON.stringify({
    appliedAdditions: result.appliedAdditions.length,
    appliedLinks: result.appliedLinks.length,
    skipped: result.skippedAccountIds,
    directoryCountAfter: result.directoryCount,
    revisionAfter: result.revision
  }, null, 2));
  console.log(`Rollback: restore staff_admin_ops from ${backupPath} (see repair report) — do not overwrite unrelated keys.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
