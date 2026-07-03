import assert from "node:assert/strict";
import { isVisibleLobbyCheckoutDog } from "../lib/lobby/checkout";
import { buildGingrCheckoutKeySet } from "../lib/board-checkout-merge";
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
  record: { status_string: "Checking Out", animal_id: "animal-1", id: "res-1", type: "Overnight: Petite Suite" }
});

const keys = buildGingrCheckoutKeySet([gingrBasketDog]);
const now = new Date("2026-07-02T21:00:00.000Z");

assert.equal(isVisibleLobbyCheckoutDog(gingrBasketDog, now, keys), true);

const expiredButStillInBasket = {
  ...gingrBasketDog,
  status_started_at: "2026-07-02T19:00:00.000Z"
};
assert.equal(isVisibleLobbyCheckoutDog(expiredButStillInBasket, now, keys), true);

const removedFromBasket = {
  ...checkoutDog({
    source: "gingr_webhook",
    webhook_type: "checking_out",
    entity_data: { reservation_id: "res-99", animal_id: "animal-99" }
  }),
  gingr_reservation_id: "res-99",
  gingr_animal_id: "animal-99"
};
assert.equal(isVisibleLobbyCheckoutDog(removedFromBasket, now, keys), false);
assert.equal(isVisibleLobbyCheckoutDog(removedFromBasket, now, keys, { requireGingrBasket: true }), false);

const unexpiredButNotInBasket = {
  ...removedFromBasket,
  status_started_at: "2026-07-02T20:58:00.000Z"
};
assert.equal(isVisibleLobbyCheckoutDog(unexpiredButNotInBasket, now, keys), true);
assert.equal(isVisibleLobbyCheckoutDog(unexpiredButNotInBasket, now, keys, { requireGingrBasket: true }), false);

console.log("lobby checkout visibility tests passed");
