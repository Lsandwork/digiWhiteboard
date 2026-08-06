import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminOps = readFileSync(resolve(__dirname, "../lib/staff/admin-ops.ts"), "utf8");
const panel = readFileSync(resolve(__dirname, "../components/admin/StaffOperationsPanel.tsx"), "utf8");
const api = readFileSync(resolve(__dirname, "../app/api/admin/staff-operations/route.ts"), "utf8");

assert.match(adminOps, /export type ActiveIssueReply/);
assert.match(adminOps, /active_issue_replies/);
assert.match(adminOps, /export async function replyToActiveIssue/);
assert.match(adminOps, /optionalString\(patch\.resolution_notes\) \?\? item\.resolution_notes/);
assert.match(api, /action === "reply_issue"/);
assert.match(panel, /action: "reply_issue"/);
assert.match(panel, /Team Updates/);
assert.match(panel, /active_issue_replies/);
assert.doesNotMatch(panel, /detail\.type === "issues" \? \(\s*<Field label="Resolution notes">/);

console.log("active issue replies tests passed");
