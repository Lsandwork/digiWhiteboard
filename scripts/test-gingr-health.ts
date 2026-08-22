import assert from "node:assert/strict";
import { evaluateGingrHealth } from "../lib/ops-command-center/gingr-health";

const nowMs = new Date("2026-08-10T16:34:00.000Z").getTime();

const offlineWebhookOnly = evaluateGingrHealth({
  lastWebhookAt: "2026-07-31T16:00:00.000Z",
  lastDogSeenAt: null,
  nowMs
});
assert.equal(offlineWebhookOnly.status, "offline");

const healthyFromDogSeen = evaluateGingrHealth({
  lastWebhookAt: "2026-07-31T16:00:00.000Z",
  lastDogSeenAt: "2026-08-10T16:30:00.000Z",
  nowMs
});
assert.equal(healthyFromDogSeen.status, "healthy");
assert.match(healthyFromDogSeen.detail, /Board sync live|Last Gingr activity/i);

const degraded = evaluateGingrHealth({
  lastWebhookAt: "2026-08-10T15:50:00.000Z",
  lastDogSeenAt: null,
  nowMs
});
assert.equal(degraded.status, "degraded");

const unknown = evaluateGingrHealth({ lastWebhookAt: null, lastDogSeenAt: null, nowMs });
assert.equal(unknown.status, "unknown");

const timedOutProbe = evaluateGingrHealth({
  lastWebhookAt: null,
  lastDogSeenAt: null,
  nowMs,
  probeTimedOut: true
});
assert.equal(timedOutProbe.status, "degraded");
assert.doesNotMatch(timedOutProbe.detail, /No Gingr webhook or board dog sync timestamps yet/);

console.log("gingr health tests passed");
