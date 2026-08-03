import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { isSmsOptOutRequest, OPT_OUT_CONFIRMATION } from "../lib/ruffly/consent/opt-out";
import { isWithinQuietHours } from "../lib/ruffly/consent/quiet-hours";
import { destinationsForFeedbackRating, isReviewGatingDisabled } from "../lib/ruffly/reviews/no-gating";
import { AI_DISCLOSURE, detectHandoffSignals, shouldHandoffToStaff } from "../lib/ruffly/ai/guardrails";
import { craftWebchatReply, selectRelevantArticles } from "../lib/ruffly/ai/webchat-reply";
import { RUFFLY_STARTER_KNOWLEDGE_ARTICLES } from "../lib/ruffly/knowledge/starter-articles";
import { RUFFLY_PERMISSIONS } from "../lib/ruffly/permissions";
import { accessFromLegacyRole, hasPermission } from "../lib/admin/permissions";
import {
  gingrWebhookIdempotencyKey,
  verifyGingrWebhookSignature
} from "../lib/integrations/gingr/webhooks/verify";
import { rewriteRufflyPublicPath, shouldRewriteRufflyRoot } from "../lib/ruffly-domain";
import { isRufflyGingrBookingEnabled } from "../lib/ruffly/flags";
import { hashToken, signRufflyToken, verifyRufflyToken } from "../lib/ruffly/tokens/signed-token";

assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/"), true);
assert.equal(shouldRewriteRufflyRoot("ruffly.ruffops.com", "/widget.js"), false);
assert.equal(shouldRewriteRufflyRoot("staff.ruffops.com", "/"), false);
assert.equal(rewriteRufflyPublicPath("ruffly.ruffops.com", "/review/tok"), "/ruffly/review/tok");
assert.equal(isRufflyGingrBookingEnabled(), false);

assert.equal(isSmsOptOutRequest("STOP"), true);
assert.equal(isSmsOptOutRequest("please stop texting me"), true);
assert.equal(isSmsOptOutRequest("Thanks for the update"), false);
assert.match(OPT_OUT_CONFIRMATION, /unsubscribed from all Fitdog texts/i);
assert.doesNotMatch(OPT_OUT_CONFIRMATION, /Transactional messages about your dog may still apply/i);

assert.equal(
  isWithinQuietHours({ start: "21:00", end: "08:00", timezone: "UTC" }, new Date("2026-07-30T22:30:00.000Z")),
  true
);
assert.equal(
  isWithinQuietHours({ start: "21:00", end: "08:00", timezone: "UTC" }, new Date("2026-07-30T15:00:00.000Z")),
  false
);
assert.equal(
  isWithinQuietHours({ start: "09:00", end: "17:00", timezone: "UTC" }, new Date("2026-07-30T12:00:00.000Z")),
  true
);

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
assert.doesNotMatch(AI_DISCLOSURE, /not a human/i);

const hoursMatches = selectRelevantArticles("what are the business hours?", RUFFLY_STARTER_KNOWLEDGE_ARTICLES, 2);
assert.ok(hoursMatches.some((article) => /hour|location/i.test(article.title)));

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
assert.equal(hasPermission(marketing, "ruffly.view"), false);
assert.equal(hasPermission(marketing, "ruffly.campaigns.view"), false);

const frontDesk = accessFromLegacyRole("u4", "front@fitdog.com", "front_desk_coordinator");
assert.equal(hasPermission(frontDesk, "ruffly.view"), true);
assert.equal(hasPermission(frontDesk, "ruffly.inbox.reply"), true);
assert.equal(hasPermission(frontDesk, "ruffly.settings.manage"), false);

const management = accessFromLegacyRole("u5", "mgr@fitdog.com", "assistant_manager");
assert.equal(hasPermission(management, "ruffly.view"), true);
assert.equal(hasPermission(management, "ruffly.analytics.view"), true);
assert.equal(hasPermission(management, "ruffly.integrations.manage"), false);

const admin = accessFromLegacyRole("u6", "admin@fitdog.com", "manager_admin");
assert.equal(hasPermission(admin, "ruffly.view"), true);
assert.equal(hasPermission(admin, "ruffly.settings.manage"), true);
assert.equal(hasPermission(admin, "ruffly.integrations.manage"), false);

const trainer = accessFromLegacyRole("u7", "trainer@fitdog.com", "trainer");
assert.equal(hasPermission(trainer, "ruffly.view"), false);

async function testWebchatReplies() {
  process.env.RUFFLY_AI_ENABLED = "false";
  const hoursReply = await craftWebchatReply({ message: "what are the business hours?" });
  assert.match(hoursReply.reply, /7:00/i);
  assert.doesNotMatch(hoursReply.reply, /once articles are published/i);
  const nameReply = await craftWebchatReply({ message: "Jasper Lonnie Sandoval" });
  assert.match(nameReply.reply, /got it|how can I help/i);
  assert.doesNotMatch(nameReply.reply, /once articles are published/i);
  const daycareReply = await craftWebchatReply({ message: "daycare" });
  assert.match(daycareReply.reply, /open play|tour/i);
  assert.doesNotMatch(daycareReply.reply, /got it/i);
  const daycareAgain = await craftWebchatReply({ message: "I said daycare" });
  assert.match(daycareAgain.reply, /open play|tour/i);
  assert.doesNotMatch(daycareAgain.reply, /got it/i);
}

testWebchatReplies()
  .then(() => {
    console.log("ruffly core tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
