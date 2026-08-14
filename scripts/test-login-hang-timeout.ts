import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const loginSource = readFileSync(join(process.cwd(), "app/api/admin/login/route.ts"), "utf8");
const sessionSource = readFileSync(join(process.cwd(), "app/api/admin/session/route.ts"), "utf8");
const auditSource = readFileSync(join(process.cwd(), "lib/admin/audit.ts"), "utf8");
const dashboardSource = readFileSync(join(process.cwd(), "app/api/admin/dashboard/route.ts"), "utf8");

assert.match(loginSource, /withTimeoutFallback/);
assert.match(loginSource, /POST_AUTH_SIDE_EFFECT_MS/);
assert.match(loginSource, /touchAdminUserLogin/);
assert.match(loginSource, /writeAdminAuditLog/);
assert.doesNotMatch(
  loginSource,
  /await touchAdminUserLogin\([\s\S]*?\);\s*\n\s*await writeAdminAuditLog/
);

assert.match(auditSource, /withTimeoutFallback/);
assert.match(auditSource, /AUDIT_TIMEOUT_MS/);

assert.match(sessionSource, /session\.isDemo/);
assert.match(sessionSource, /withTimeoutFallback/);
assert.match(sessionSource, /SESSION_SIDE_EFFECT_MS/);

assert.match(
  dashboardSource,
  /if \(isDemoSession\(session\)\) \{[\s\S]*?getDemoSandbox/
);
assert.match(dashboardSource, /DEMO_DASHBOARD_TIMEOUT_MS|withTimeoutFallback\(getDemoSandbox/);
assert.ok(
  dashboardSource.indexOf("if (isDemoSession(session))") <
    dashboardSource.indexOf("loadFastPromptedCheckouts(supabase)"),
  "demo session must short-circuit before live board queries"
);

console.log("login hang timeout guards passed");
