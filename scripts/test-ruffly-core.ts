import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { isSmsOptOutRequest } from "../lib/ruffly/consent/opt-out";
import { destinationsForFeedbackRating, isReviewGatingDisabled } from "../lib/ruffly/reviews/no-gating";
import { detectHandoffSignals, shouldHandoffToStaff } from "../lib/ruffly/ai/guardrails";
import { RUFFLY_PERMISSIONS } from "../lib/ruffly/permissions";
import { accessFromLegacyRole, hasPermission } from "../lib/admin/permissions";
import {
  gingrWebhookIdempotencyKey,
  verifyGingrWebhookSignature
} from "../lib/integrations/gingr/webhooks/verify";
import { shouldRewriteRufflyRoot } from "../lib/ruffly-domain";
import { hashToken, signRufflyToken, verifyRufflyToken } from "../lib/ruffly/tokens/signed-token";

assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/"), true);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/widget.js"), false);
assert.equal(shouldRewriteRufflyRoot("staff.ruffops.com", "/"), false);

assert.equal(isSmsOptOutRequest("STOP"), true);
assert.equal(isSmsOptOutRequest("please stop texting me"), true);
assert.equal(isSmsOptOutRequest("Thanks for the update"), false);

assert.equal(isReviewGatingDisabled(), true);
const low = destinationsForFeedbackRating(1, {
  googleReviewUrl: "https://example.com/google",
  facebookReviewUrl: "https://example.com/facebook"
});
const high = destinationsForFeedbackRating(5, {
  googleReviewUrl: "https://example.com/google",
  facebookReviewUrl: "https://example.com/facebook"
});
assert.deepEqual(low, high);
assert.equal(low.length, 2);

const handoff = shouldHandoffToStaff(detectHandoffSignals("I want to speak to a real person about a refund"));
assert.equal(handoff.handoff, true);

process.env.GINGR_WEBHOOK_SIGNATURE_KEY = "test-secret";
const payload = {
  webhook_type: "check_out",
  entity_id: "99",
  entity_type: "reservation",
  signature: ""
};
payload.signature = createHmac("sha256", "test-secret")
  .update(`${payload.webhook_type}${payload.entity_id}${payload.entity_type}`)
  .digest("hex");
assert.equal(verifyGingrWebhookSignature(payload, "test-secret"), true);
assert.equal(verifyGingrWebhookSignature({ ...payload, signature: "deadbeef" }, "test-secret"), false);
const key1 = gingrWebhookIdempotencyKey(payload);
const key2 = gingrWebhookIdempotencyKey(payload);
assert.equal(key1, key2);

process.env.RUFFLY_TOKEN_SECRET = "ruffly-test-secret";
const token = signRufflyToken({ typ: "review", sub: "contact-1", ttlSeconds: 60 });
assert.ok(verifyRufflyToken(token));
assert.equal(verifyRufflyToken(token + "x"), null);
assert.equal(hashToken("abc").length, 64);

assert.ok(RUFFLY_PERMISSIONS.includes("ruffly.view"));
const owner = accessFromLegacyRole("u1", "lonnie@fitdog.com", "owner_admin");
assert.equal(hasPermission(owner, "ruffly.view"), true);
assert.equal(hasPermission(owner, "ruffly.integrations.manage"), true);

const viewer = accessFromLegacyRole("u2", "viewer@fitdog.com", "viewer");
assert.equal(hasPermission(viewer, "ruffly.view"), false);

const marketing = accessFromLegacyRole("u3", "m@fitdog.com", "marketing");
assert.equal(hasPermission(marketing, "ruffly.campaigns.view"), true);

console.log("ruffly core tests passed");
