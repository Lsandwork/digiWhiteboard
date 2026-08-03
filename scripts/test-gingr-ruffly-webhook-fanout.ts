import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webhookSrc = readFileSync(resolve(__dirname, "../app/api/gingr/webhook/route.ts"), "utf8");
const fanoutSrc = readFileSync(resolve(__dirname, "../lib/integrations/gingr/webhooks/fanout.ts"), "utf8");
const setupSrc = readFileSync(resolve(__dirname, "../components/ruffly/settings/RufflySettingsPanel.tsx"), "utf8");

assert.match(webhookSrc, /fanoutVerifiedGingrWebhookToRuffly/);
assert.match(webhookSrc, /fanoutVerifiedGingrWebhookToRuffly\(payload\)/);
assert.match(fanoutSrc, /ingestGingrWebhook/);
assert.match(fanoutSrc, /isRufflyEnabled/);
assert.match(fanoutSrc, /after\(/);
assert.match(setupSrc, /Gingr allows only one webhook URL/);
assert.match(setupSrc, /api\/gingr\/webhook/);

console.log("Gingr → Ruffly webhook fanout wiring looks good.");
