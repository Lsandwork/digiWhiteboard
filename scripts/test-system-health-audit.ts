import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const auditSrc = readFileSync(resolve(__dirname, "../lib/admin/system-health-audit.ts"), "utf8");
const webhookSrc = readFileSync(resolve(__dirname, "../app/api/gingr/webhook/route.ts"), "utf8");

assert.match(auditSrc, /isSyntheticDisplayDevice/);
assert.match(auditSrc, /isUnsupportedWebhookNoise/);
assert.match(auditSrc, /clear_unsupported_webhook_noise/);
assert.match(auditSrc, /acknowledge_cast_tv_unused/);
assert.match(auditSrc, /prune_offline_display_registry|prune_stale_display_devices/);
assert.match(webhookSrc, /ignoredWebhookTypes/);
assert.match(webhookSrc, /ignored: true/);
assert.match(webhookSrc, /email_sent/);
assert.doesNotMatch(
  webhookSrc,
  /throw new Error\(`Unsupported webhook_type/,
  "unsupported webhook types must not 500"
);

console.log("system health audit tests passed");
