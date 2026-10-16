/**
 * Staff ops revision parsing and bulk-create revision semantics.
 * Run: npx tsx scripts/test-staff-ops-concurrency.ts
 */
import assert from "node:assert/strict";
import { parseStaffOpsRevision, StaffOpsConflictError } from "../lib/user-interactions/staff-ops-auth";

assert.equal(parseStaffOpsRevision({ staff_ops_revision: 3 }), 3);
assert.equal(parseStaffOpsRevision({ staff_ops_revision: "3.9" }), 3);
assert.equal(parseStaffOpsRevision({ staff_ops_revision: "bad" }), undefined);
assert.equal(parseStaffOpsRevision({ action: "update_crossover" }), undefined);

const conflict = new StaffOpsConflictError();
assert.equal(conflict.name, "StaffOpsConflictError");
assert.match(conflict.message, /updated by someone else/i);

console.log("test-staff-ops-concurrency: all assertions passed");
