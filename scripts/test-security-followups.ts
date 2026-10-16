/**
 * Remaining Phase-3 security follow-ups: tracking link expiry + newsletter unsubscribe tokens.
 */
import assert from "node:assert/strict";
import { toPublicRawPayload } from "../lib/board-public-dog";
import {
  createNewsletterUnsubscribeToken,
  verifyNewsletterUnsubscribeToken
} from "../lib/blog/newsletter-unsubscribe";
import {
  isOwnerTrackingLinkExpired,
  OWNER_TRACKING_LINK_GRACE_MS
} from "../lib/route-generator/owner-tracking";

process.env.ADMIN_SESSION_SECRET = "test-only-session-secret";

// --- Owner tracking links expire after operating_date + grace.
const day = "2026-10-01";
const start = Date.UTC(2026, 9, 1);
assert.equal(isOwnerTrackingLinkExpired(day, start + 12 * 60 * 60_000), false);
assert.equal(isOwnerTrackingLinkExpired(day, start + OWNER_TRACKING_LINK_GRACE_MS), false);
assert.equal(isOwnerTrackingLinkExpired(day, start + OWNER_TRACKING_LINK_GRACE_MS + 1), true);
assert.equal(isOwnerTrackingLinkExpired(null), false);
assert.equal(isOwnerTrackingLinkExpired("not-a-date"), false);

// --- Newsletter unsubscribe requires a signed token; email alone is insufficient.
const token = createNewsletterUnsubscribeToken("owner@example.com");
assert.equal(verifyNewsletterUnsubscribeToken(token), "owner@example.com");
assert.equal(verifyNewsletterUnsubscribeToken("forged.payload"), null);
assert.equal(verifyNewsletterUnsubscribeToken(""), null);
const expired = createNewsletterUnsubscribeToken("owner@example.com", Date.now() - 400 * 24 * 60 * 60_000);
assert.equal(verifyNewsletterUnsubscribeToken(expired), null);

// --- Board write path must only persist the public raw_payload schema (signature stripped).
const stored = toPublicRawPayload({
  source: "gingr_webhook",
  signature: "sig-should-never-land-on-board",
  webhook_type: "checking_out",
  entity_data: { name: "Jane Owner", animal: { name: "Atlas", breed: "Lab" }, owner_phone: "555" }
});
assert.ok(stored);
assert.equal((stored as Record<string, unknown>).signature, undefined);
assert.ok(!JSON.stringify(stored).includes("sig-should-never-land-on-board"));
assert.ok(!JSON.stringify(stored).includes("555"));
assert.equal((stored as { entity_data?: { animal?: { name?: string } } }).entity_data?.animal?.name, "Atlas");

console.log("security follow-up tests passed");
