import assert from "node:assert/strict";
import { toPublicBoardDog, toPublicLiveBoardResponse, toPublicRawPayload } from "../lib/board-public-dog";
import { resolveDogPhotoUrl } from "../lib/board-utils";
import { isFastWebhookTransition } from "../lib/board-checkout-merge";
import { getCheckoutFilterReason, getCheckoutPromptKey, getCheckoutPromptTimestamp, isPromptedCheckoutDog } from "../lib/checkout-prompt";
import { extractLobbyBreed, getLobbyPromptedAt } from "../lib/lobby/status-label";
import type { LiveDog } from "../lib/types";

const SECRET_MARKERS = [
  "sig-abc123",
  "owner@example.com",
  "555-0100",
  "123 Main St",
  "Takes medication twice daily",
  "staff-user-42",
  "Jane Owner"
];

function dog(raw_payload: Record<string, unknown> | null): LiveDog {
  return {
    id: "dog-1",
    gingr_reservation_id: "res-1",
    gingr_animal_id: "animal-1",
    animal_name: "Atlas",
    owner_name: "Victoria",
    photo_url: null,
    reservation_type: "Daycare",
    current_status: "checking_out",
    display_status: "checking_out",
    room: "Front Desk",
    notes: null,
    flags: {},
    status_started_at: "2026-07-01T12:00:00.000Z",
    completed_at: null,
    display_until: "2026-07-01T12:04:00.000Z",
    last_seen_from_gingr_at: "2026-07-01T12:00:00.000Z",
    raw_payload,
    hidden: false,
    updated_at: "2026-07-01T12:00:00.000Z"
  };
}

const webhookPayload = {
  source: "gingr_webhook",
  webhook_type: "checkout_basket_added",
  signature: "sig-abc123",
  entity_id: "res-1",
  entity_type: "reservation",
  gingr_event_id: "evt-9",
  event_timestamp: "2026-07-01T11:59:58.000Z",
  basket_added_by: "staff-user-42",
  entity_data: {
    added_to_basket: true,
    checkout_basket_added_at: "2026-07-01T11:59:59.000Z",
    owner_email: "owner@example.com",
    owner_phone: "555-0100",
    owner_address: "123 Main St",
    name: "Jane Owner",
    medical_notes: "Takes medication twice daily",
    animal: {
      name: "Atlas",
      breed: "Labrador",
      image_url: "https://cdn.gingrapp.com/a/atlas.jpg",
      owner: { email: "owner@example.com" }
    },
    reservation: { status_string: "Checking Out", owner_phone: "555-0100" }
  },
  record: { a_breed: "Labrador", profile_photo: { url: "https://cdn.gingrapp.com/a/p.jpg", token: "sig-abc123" } }
};

const original = dog(webhookPayload);
const sanitized = toPublicBoardDog(original);
const serialized = JSON.stringify(sanitized);

for (const marker of SECRET_MARKERS) {
  assert.ok(!serialized.includes(marker), `public board dog must not include ${marker}`);
}
assert.ok(!serialized.includes("\"signature\""), "signature key removed");
assert.equal((sanitized.raw_payload as Record<string, unknown>).basket_added_by, true, "actor kept as presence only");
assert.equal(((sanitized.raw_payload as Record<string, Record<string, unknown>>).entity_data).name, undefined);
assert.equal(
  ((sanitized.raw_payload as Record<string, Record<string, Record<string, unknown>>>).entity_data.animal).name,
  "Atlas",
  "animal name kept inside animal container"
);

// Every browser-side reader must produce identical output on the public projection.
assert.equal(isPromptedCheckoutDog(sanitized), isPromptedCheckoutDog(original));
assert.equal(isPromptedCheckoutDog(sanitized), true);
assert.equal(getCheckoutPromptTimestamp(sanitized.raw_payload), getCheckoutPromptTimestamp(original.raw_payload));
assert.equal(getCheckoutPromptKey(sanitized), getCheckoutPromptKey(original));
assert.equal(getCheckoutFilterReason(sanitized.raw_payload), getCheckoutFilterReason(original.raw_payload));
assert.equal(extractLobbyBreed(sanitized), extractLobbyBreed(original));
assert.equal(getLobbyPromptedAt(sanitized), getLobbyPromptedAt(original));
assert.equal(resolveDogPhotoUrl(sanitized), resolveDogPhotoUrl(original));
assert.equal(isFastWebhookTransition(sanitized), isFastWebhookTransition(original));

const backOfHouse = dog({ source: "gingr_back_of_house", record: { status: "Going Home", owner_email: "owner@example.com" } });
assert.equal(toPublicBoardDog(backOfHouse).raw_payload?.source, "gingr_back_of_house");
assert.ok(!JSON.stringify(toPublicBoardDog(backOfHouse)).includes("owner@example.com"));

assert.equal(toPublicRawPayload(null), null);
assert.equal(toPublicRawPayload("not-an-object"), null);
assert.deepEqual(toPublicRawPayload({ entity_data: ["array-not-record"] }), {});

const deep = { payload: { payload: { payload: { payload: { breed: "Deep", email: "owner@example.com" } } } } };
assert.ok(!JSON.stringify(toPublicRawPayload(deep)).includes("owner@example.com"));

const response = toPublicLiveBoardResponse({
  checking_in: [original],
  checking_out: [original],
  counts: { checking_in: 1, checking_out: 1, total: 2 },
  last_updated: "2026-07-01T12:00:00.000Z"
});
const responseJson = JSON.stringify(response);
for (const marker of SECRET_MARKERS) {
  assert.ok(!responseJson.includes(marker), `live-board response must not include ${marker}`);
}
assert.equal(response.counts.total, 2);
assert.ok(JSON.stringify(original).includes("sig-abc123"), "input row is not mutated");

console.log("public board feed tests passed");
