import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const auditSrc = readFileSync(resolve(__dirname, "../lib/admin/system-health-audit.ts"), "utf8");
const webhookSrc = readFileSync(resolve(__dirname, "../app/api/gingr/webhook/route.ts"), "utf8");

assert.match(auditSrc, /isSyntheticDisplayDevice/);
assert.match(auditSrc, /isUnsupportedWebhookNoise/);
assert.match(auditSrc, /clear_unsupported_webhook_noise/);
assert.match(auditSrc, /acknowledge_cast_tv_unused/);
assert.match(auditSrc, /acknowledge_cast_tv_missing/);
assert.match(auditSrc, /acknowledge_cast_tv_offline/);
assert.match(auditSrc, /acknowledge_displays_offline/);
assert.match(auditSrc, /acknowledgeOpenAuditIssues/);
assert.match(auditSrc, /prune_offline_display_registry|prune_stale_display_devices/);
assert.match(webhookSrc, /ignoredWebhookTypes/);
assert.match(webhookSrc, /ignored: true/);
assert.match(webhookSrc, /email_sent/);
assert.doesNotMatch(
  webhookSrc,
  /throw new Error\(`Unsupported webhook_type/,
  "unsupported webhook types must not 500"
);

const healthChecks = readFileSync(resolve(__dirname, "../lib/system-health/health-checks.ts"), "utf8");
assert.match(healthChecks, /low-severity audit note/);
assert.match(healthChecks, /severity === "medium" \|\| severity === "high"/);

const routeProbe = readFileSync(resolve(__dirname, "../lib/system-health/probes/route-generator.ts"), "utf8");
assert.match(routeProbe, /passed with warnings \(generation succeeded\)/);
assert.doesNotMatch(
  routeProbe,
  /st === "warning"\) \{\s*status = "WARNING"/,
  "PASS_WITH_WARNINGS must not sticky-yellow Route Generator"
);

const settingsSrc = readFileSync(resolve(__dirname, "../lib/system-health/settings.ts"), "utf8");
assert.match(settingsSrc, /endLiveDebugSessions/);

const apiSrc = readFileSync(resolve(__dirname, "../app/api/admin/system-health/route.ts"), "utf8");
assert.match(apiSrc, /end_live_debug/);
assert.match(apiSrc, /run_whiteboard_audit/);
assert.match(apiSrc, /acknowledge_audit_issue/);
assert.match(apiSrc, /audit_issues/);

const uiSrc = readFileSync(
  resolve(__dirname, "../components/admin/system-health/SystemHealthDebuggingApp.tsx"),
  "utf8"
);
assert.match(uiSrc, /id: "audit_issues"/);
assert.match(uiSrc, /openAuditDetails/);
assert.match(uiSrc, /acknowledgeAuditIssue/);

console.log("system health audit tests passed");
