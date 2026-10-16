/**
 * User Interactions RBAC matrix (server policy helpers).
 * Run: npx tsx scripts/test-user-interactions-staff-ops-auth.ts
 */
import assert from "node:assert/strict";
import { accessFromLegacyRole } from "../lib/admin/permissions";
import {
  assertStaffOpsPostAuthorized,
  buildUserInteractionsCapabilities,
  parseStaffOpsRevision,
  StaffOpsAuthorizationError
} from "../lib/user-interactions/staff-ops-auth";

function access(role: string) {
  return accessFromLegacyRole(null, null, role);
}

function expectAllowed(role: string, action: string, body: Record<string, unknown> = {}) {
  assertStaffOpsPostAuthorized(access(role), role, action, body);
}

function expectDenied(role: string, action: string, body: Record<string, unknown> = {}) {
  assert.throws(
    () => assertStaffOpsPostAuthorized(access(role), role, action, body),
    StaffOpsAuthorizationError
  );
}

// Full admins
for (const role of ["owner_admin", "super_admin", "admin"] as const) {
  const caps = buildUserInteractionsCapabilities(access(role), role);
  assert.equal(caps.canCreateFollowUp, true);
  assert.equal(caps.canCreateIssue, true);
  expectAllowed(role, "create_follow_up");
  expectAllowed(role, "update_issue", { status: "Resolved", resolution_notes: "done" });
}

// Groomer — notes only
{
  const role = "groomer";
  const caps = buildUserInteractionsCapabilities(access(role), role);
  assert.equal(caps.canCreateNote, true);
  assert.equal(caps.canCreateFollowUp, false);
  assert.equal(caps.canCreateIssue, false);
  expectAllowed(role, "create_crossover");
  expectDenied(role, "create_follow_up");
  expectDenied(role, "create_issue");
  expectDenied(role, "update_follow_up", { status: "Resolved" });
}

// Viewer — read-only capabilities
{
  const role = "staff_viewer";
  const caps = buildUserInteractionsCapabilities(access(role), role);
  assert.equal(caps.canCreateNote, false);
  assert.equal(caps.canUpdateNote, false);
  expectDenied(role, "create_crossover");
  expectDenied(role, "update_crossover", { status: "Resolved" });
}

// Coordinator — follow-ups and issues
{
  const role = "front_desk_coordinator";
  const caps = buildUserInteractionsCapabilities(access(role), role);
  assert.equal(caps.canCreateFollowUp, true);
  assert.equal(caps.canCompleteFollowUp, true);
  expectAllowed(role, "create_follow_up");
  expectAllowed(role, "update_follow_up", { status: "Resolved" });
  expectAllowed(role, "update_follow_up", { status: "Resolved", resolution_notes: "Called owner." });
}

// Groomer may assign notes when edit permission is granted
{
  const role = "groomer";
  expectAllowed(role, "update_crossover", { assigned_to: "Sam" });
}

assert.equal(parseStaffOpsRevision({ staff_ops_revision: 12 }), 12);
assert.equal(parseStaffOpsRevision({ staff_ops_revision: "7" }), 7);
assert.equal(parseStaffOpsRevision({}), undefined);
assert.equal(parseStaffOpsRevision({ staff_ops_revision: -1 }), undefined);

// Trainer — create notes, not follow-ups
{
  const role = "trainer";
  const caps = buildUserInteractionsCapabilities(access(role), role);
  assert.equal(caps.canCreateNote, true);
  expectDenied(role, "create_follow_up");
}

console.log("test-user-interactions-staff-ops-auth: all assertions passed");
