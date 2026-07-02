import assert from "node:assert/strict";
import { isLobbyCheckoutCandidate } from "../lib/lobby/checkout";
import type { LiveDog } from "../lib/types";

function checkoutDog(raw_payload: Record<string, unknown> | null): LiveDog {
  return {
    id: "dog-1",
    gingr_reservation_id: "res-1",
    gingr_animal_id: "animal-1",
    animal_name: "June",
    owner_name: "Owner",
    photo_url: null,
    reservation_type: "Overnight",
    current_status: "checking_out",
    display_status: "checking_out",
    room: "Front Desk",
    notes: null,
    flags: {},
    status_started_at: "2026-07-02T20:00:00.000Z",
    completed_at: null,
    display_until: null,
    last_seen_from_gingr_at: "2026-07-02T20:00:00.000Z",
    raw_payload,
    hidden: false,
    updated_at: "2026-07-02T20:00:00.000Z"
  };
}

const gingrBasketDog = checkoutDog({
  source: "gingr_back_of_house",
  record: { status_string: "Checking Out", animal_id: "animal-1", id: "res-1" }
});

const webhookDog = checkoutDog({
  source: "gingr_webhook",
  webhook_type: "checking_out",
  entity_data: { reservation_id: "res-1" }
});

const unpromptedSupabaseDog = checkoutDog({
  source: "gingr_back_of_house",
  record: { status_string: "Going Home", end_date: "1782961200" }
});

assert.equal(isLobbyCheckoutCandidate(gingrBasketDog, true), true);
assert.equal(isLobbyCheckoutCandidate(webhookDog, true), true);
assert.equal(isLobbyCheckoutCandidate(unpromptedSupabaseDog, false), false);
assert.equal(isLobbyCheckoutCandidate(gingrBasketDog, false), false);

console.log("lobby checkout candidate tests passed");
