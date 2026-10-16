/**
 * Staff Directory reconciliation, validation, parse and concurrency-rebase tests.
 * Pure/in-memory only — no production accounts are created.
 * Run: npx tsx scripts/test-staff-directory-reconciliation.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyStaffDirectoryReconciliation,
  assertStaffDirectoryIntegrity,
  buildStaffDirectoryReconciliationReport,
  StaffDirectoryValidationError,
  validateStaffDirectoryFields,
  type DirectoryAccountInput
} from "../lib/staff/directory-reconciliation";
import { parseStaffOpsState, DEFAULT_STAFF_DIRECTORY, type StaffDirectoryMember } from "../lib/staff/admin-ops";

const NOW = "2026-10-15T00:00:00.000Z";
let seq = 0;
const newId = () => `generated-${++seq}`;

function member(partial: Partial<StaffDirectoryMember> & { id: string; name: string }): StaffDirectoryMember {
  return {
    role: null, department: "Front Desk", email: null, phone: null, status: "Active",
    notes: null, checklist_items: null, admin_user_id: null, dashboard_role: null,
    created_at: NOW, updated_at: NOW, ...partial
  };
}
function account(partial: Partial<DirectoryAccountInput> & { id: string }): DirectoryAccountInput {
  return { full_name: partial.id, email: `${partial.id}@fitdog.com`, role: "daycare", status: "active", ...partial };
}
function report(directory: StaffDirectoryMember[], accounts: DirectoryAccountInput[]) {
  return buildStaffDirectoryReconciliationReport(directory, accounts);
}
function apply(directory: StaffDirectoryMember[], accounts: DirectoryAccountInput[], approved?: Set<string>) {
  const r = report(directory, accounts);
  return { report: r, result: applyStaffDirectoryReconciliation(directory, r, new Map(accounts.map((a) => [a.id, a])), { approvedAccountIds: approved ?? null, now: NOW, newId }) };
}

// 1. Eligible login missing profile -> proposed addition; apply once; second run idempotent.
{
  const acct = account({ id: "u-abraham", full_name: "Abraham", email: "abraham@fitdog.com" });
  const first = apply([], [acct]);
  assert.equal(first.report.summary.proposedAdditions, 1);
  assert.equal(first.result.appliedAdditions.length, 1);
  assert.equal(first.result.directory[0].admin_user_id, "u-abraham");
  assert.equal(first.result.directory[0].dashboard_role, "daycare");
  const second = apply(first.result.directory, [acct]);
  assert.equal(second.report.summary.proposedAdditions, 0);
  assert.equal(second.report.summary.unchanged, 1);
  assert.equal(second.result.directory.length, 1, "re-running must not duplicate");
}

// 2. Already correctly ID-linked -> unchanged, manual fields preserved on link-apply path.
{
  const acct = account({ id: "u-joe", full_name: "Joe", email: "joe@fitdog.com", role: "driver" });
  const existing = member({ id: "m-joe", name: "Joe", email: "joe@fitdog.com", admin_user_id: "u-joe", dashboard_role: "driver", notes: "manual note", checklist_items: ["Keys"] });
  const r = report([existing], [acct]);
  assert.equal(r.summary.unchanged, 1);
  assert.equal(r.summary.proposedAdditions + r.summary.proposedLinks, 0);
}

// 3. Unique email matches unlinked profile -> proposed link, preserving manual fields.
{
  const acct = account({ id: "u-meghan", full_name: "Meghan", email: "meghan@fitdog.com", role: "marketing" });
  const existing = member({ id: "m-meghan", name: "Meghan", email: "Meghan@Fitdog.com ", notes: "keep me", phone: "555" });
  const { result } = apply([existing], [acct]);
  assert.equal(result.appliedLinks.length, 1);
  assert.equal(result.directory[0].notes, "keep me");
  assert.equal(result.directory[0].phone, "555");
  assert.equal(result.directory[0].admin_user_id, "u-meghan");
}

// 4. Duplicate account email -> flagged, no addition/link.
{
  const a1 = account({ id: "u-dup1", full_name: "Dup One", email: "dup@fitdog.com" });
  const a2 = account({ id: "u-dup2", full_name: "Dup Two", email: "dup@fitdog.com" });
  const r = report([], [a1, a2]);
  assert.equal(r.summary.proposedAdditions, 0);
  assert.ok(r.flagged.some((f) => f.kind === "duplicate_account_email"));
}

// 5. Placeholder + real employee similar name -> flagged, placeholder NOT converted, no addition.
{
  const placeholders = DEFAULT_STAFF_DIRECTORY.map((m) => ({ ...m }));
  const amanda = account({ id: "u-amanda", full_name: "Amanda Smith Nguyen", email: "loveandcare@gmail.com", role: "trainer" });
  const r = report(placeholders, [amanda]);
  assert.equal(r.summary.proposedAdditions, 0);
  assert.ok(r.flagged.some((f) => f.kind === "placeholder_or_name_collision" && f.accountId === "u-amanda"));
  assert.ok(placeholders.every((m) => !m.admin_user_id), "placeholders stay unlinked");
}

// 6. Multiple accounts with similar names, no placeholder -> distinct additions (names never merge people).
{
  const m1 = account({ id: "u-michael1", full_name: "Michael A", email: "michael.a@fitdog.com", role: "groomer" });
  const m2 = account({ id: "u-michael2", full_name: "Michael B", email: "michael.b@fitdog.com", role: "groomer" });
  const { result } = apply([], [m1, m2]);
  assert.equal(result.appliedAdditions.length, 2);
  assert.equal(new Set(result.directory.map((m) => m.admin_user_id)).size, 2);
}

// 7. Disabled + demo + test accounts excluded.
{
  const disabled = account({ id: "u-off", full_name: "Off", email: "off@fitdog.com", status: "disabled" });
  const demo = account({ id: "u-demo", full_name: "Demo", email: "demo-handler@demo.com" });
  const test = account({ id: "u-test", full_name: "Test", email: "janet@test.com" });
  const r = report([], [disabled, demo, test]);
  assert.equal(r.summary.proposedAdditions, 0);
  assert.equal(r.summary.excluded, 3);
}

// 8. Login-less team profile preserved; flagged only if its link is broken (it has none).
{
  const team = member({ id: "default-staff-1", name: "Front Desk Team", role: "Team" });
  const r = report([team], []);
  assert.deepEqual(r.preservedLoginlessMemberIds, ["default-staff-1"]);
  assert.equal(r.flagged.length, 0);
}

// 9. Linked account missing -> flagged, profile NOT deleted.
{
  const orphan = member({ id: "m-orphan", name: "Ghost", admin_user_id: "u-gone", email: "ghost@fitdog.com" });
  const r = report([orphan], []);
  assert.ok(r.flagged.some((f) => f.kind === "linked_account_missing"));
  const { result } = apply([orphan], []);
  assert.equal(result.directory.length, 1);
}

// 10. Concurrent independent edits rebased: apply link against a directory that gained an unrelated profile.
{
  const acct = account({ id: "u-meghan", full_name: "Meghan", email: "meghan@fitdog.com", role: "marketing" });
  const base = [member({ id: "m-meghan", name: "Meghan", email: "meghan@fitdog.com" })];
  const staleReport = report(base, [acct]);
  const freshDirectory = [...base, member({ id: "m-new", name: "Concurrent Add", email: "new@fitdog.com" })];
  const result = applyStaffDirectoryReconciliation(freshDirectory, staleReport, new Map([[acct.id, acct]]), { now: NOW, newId });
  assert.equal(result.directory.length, 2, "unrelated concurrent profile preserved");
  assert.equal(result.appliedLinks.length, 1);
  // Applying the same stale proposal again is a no-op (already linked).
  const again = applyStaffDirectoryReconciliation(result.directory, staleReport, new Map([[acct.id, acct]]), { now: NOW, newId });
  assert.equal(again.appliedLinks.length, 0);
  assert.equal(again.directory.length, 2);
}

// 11. parseState: missing directory -> seed default; explicit [] stays []; unrelated fields preserved.
{
  const missing = parseStaffOpsState({ crossover_messages: [] });
  assert.equal(missing.staff_directory.length, DEFAULT_STAFF_DIRECTORY.length);
  const empty = parseStaffOpsState({ staff_directory: [], crossover_messages: [{ id: "x" }] as never });
  assert.equal(empty.staff_directory.length, 0, "explicit empty array must not be silently reseeded on read");
  assert.equal(empty.crossover_messages.length, 1);
}

// 12. Validation boundary + integrity guard.
{
  assert.throws(() => validateStaffDirectoryFields({ name: "" }, { partial: false }), StaffDirectoryValidationError);
  assert.throws(() => validateStaffDirectoryFields({ department: "Narnia" }, { partial: true }), StaffDirectoryValidationError);
  assert.throws(() => validateStaffDirectoryFields({ email: "not-an-email" }, { partial: true }), StaffDirectoryValidationError);
  assert.throws(() => validateStaffDirectoryFields({ status: "Deleted" }, { partial: true }), StaffDirectoryValidationError);
  validateStaffDirectoryFields({ status: "Inactive" }, { partial: true });
  assert.throws(() => assertStaffDirectoryIntegrity(undefined), StaffDirectoryValidationError);
  assert.throws(
    () => assertStaffDirectoryIntegrity([member({ id: "a", name: "A", admin_user_id: "u-1" }), member({ id: "b", name: "B", admin_user_id: "u-1" })]),
    /multiple profiles/
  );
}

// 13. Source guards: directory mutations send revision; apply requires confirm + manage permission; no login sync in reconciliation apply.
{
  const panel = readFileSync(join(process.cwd(), "components/admin/StaffDirectoryPanel.tsx"), "utf8");
  const route = readFileSync(join(process.cwd(), "app/api/admin/staff-operations/route.ts"), "utf8");
  const ops = readFileSync(join(process.cwd(), "lib/staff/admin-ops.ts"), "utf8");
  assert.match(panel, /staff_ops_revision/);
  assert.match(route, /preview_staff_directory_reconciliation/);
  assert.match(route, /body\.confirm !== true/);
  const applyBody = ops.slice(ops.indexOf("export async function applyStaffDirectoryReconciliation"), ops.indexOf("export async function markStaffNotificationRead"));
  assert.doesNotMatch(applyBody, /syncStaffDirectoryLoginAccount|createAdminUser|changeAdminUserPassword/);
  assert.match(ops, /assertStaffDirectoryIntegrity\(next\.staff_directory\)/);
}

console.log("test-staff-directory-reconciliation: all assertions passed");
