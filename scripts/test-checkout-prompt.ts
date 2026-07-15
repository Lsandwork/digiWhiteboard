import assert from "node:assert/strict";
import { isPromptedCheckoutDog, isPromptedCheckoutRecord } from "../lib/checkout-prompt";
import type { LiveDog } from "../lib/types";

function checkoutDog(raw_payload: Record<string, unknown> | null, startedAt = "2026-07-01T12:00:00.000Z"): LiveDog {
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
    status_started_at: startedAt,
    completed_at: null,
    display_until: "2026-07-01T12:04:00.000Z",
    last_seen_from_gingr_at: startedAt,
    raw_payload,
    hidden: false,
    updated_at: startedAt
  };
}

assert.equal(isPromptedCheckoutRecord({ status_string: "Going Home", end_date: "1782961200" }), false);
assert.equal(isPromptedCheckoutRecord({ pickup_time: "5:00 PM" }), false);
assert.equal(isPromptedCheckoutRecord({ reservation_end: "2026-07-01T17:00:00.000Z" }), false);
assert.equal(isPromptedCheckoutRecord({ status: "going_home" }), false);

assert.equal(isPromptedCheckoutRecord({ checkout_prompted: true }), false);
assert.equal(
  isPromptedCheckoutRecord({
    checkout_prompted_at: "2026-07-01T12:00:00.000Z",
    prompted_by: "Front Desk"
  }),
  false
);
assert.equal(
  isPromptedCheckoutRecord({
    ready_for_pickup_at: "2026-07-01T12:00:00.000Z",
    prompted_by_user_id: "123"
  }),
  false
);
assert.equal(isPromptedCheckoutRecord({ gingr_event_type: "send_to_front" }), false);
assert.equal(isPromptedCheckoutRecord({ source: "coordinator_prompt" }), false);
assert.equal(isPromptedCheckoutRecord({ gingr_event_type: "added_to_basket" }), true);
assert.equal(isPromptedCheckoutRecord({ checkout_basket_added: true }), true);
assert.equal(
  isPromptedCheckoutRecord({
    source: "gingr_webhook",
    webhook_type: "checking_out",
    entity_data: { reservation_id: "res-1" }
  }),
  true
);
assert.equal(
  isPromptedCheckoutRecord({
    checkout_basket_added_at: "2026-07-01T12:00:00.000Z",
    checkout_basket_added_by_user_id: "123"
  }),
  true
);

assert.equal(isPromptedCheckoutDog(checkoutDog({ source: "gingr_back_of_house", record: { status_string: "Checking Out Soon" } })), false);
assert.equal(
  isPromptedCheckoutDog(
    checkoutDog({
      source: "gingr_webhook",
      webhook_type: "checking_out",
      entity_data: { reservation_id: "res-1" }
    })
  ),
  true
);
assert.equal(
  isPromptedCheckoutDog(
    checkoutDog({
      source: "gingr_webhook",
      webhook_type: "added_to_basket",
      entity_data: { reservation_id: "res-1" }
    })
  ),
  true
);
assert.equal(
  isPromptedCheckoutDog({
    ...checkoutDog({ source: "gingr_webhook", webhook_type: "added_to_basket" }),
    display_status: "checking_in"
  }),
  false
);

console.log("checkout-prompt checks passed");
