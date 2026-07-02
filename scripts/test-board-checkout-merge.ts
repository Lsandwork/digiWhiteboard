import assert from "node:assert/strict";
import {
  buildGingrCheckoutKeySet,
  isDogInGingrCheckoutBasket,
  mergeCheckoutDogs,
  reconcileGingrSourcedCheckouts
} from "../lib/board-checkout-merge";
import type { LiveDog } from "../lib/types";

function dog(id: string, source: string): LiveDog {
  return {
    id,
    gingr_reservation_id: id,
    gingr_animal_id: `animal-${id}`,
    animal_name: `Dog ${id}`,
    owner_name: null,
    photo_url: null,
    reservation_type: "Daycare",
    current_status: "checking_out",
    display_status: "checking_out",
    room: null,
    notes: null,
    flags: {},
    status_started_at: "2026-07-01T16:00:00.000Z",
    completed_at: null,
    display_until: null,
    last_seen_from_gingr_at: null,
    raw_payload: { source },
    hidden: false,
    updated_at: "2026-07-01T16:00:00.000Z"
  };
}

const gingrDog = dog("1", "gingr_back_of_house");
const webhookDog = dog("2", "gingr webhook");

assert.equal(mergeCheckoutDogs([gingrDog], [webhookDog]).length, 2);

const reconciled = reconcileGingrSourcedCheckouts(mergeCheckoutDogs([gingrDog], [webhookDog]), [webhookDog]);
assert.equal(reconciled.length, 1);
assert.equal(reconciled[0]?.id, "2");

const keys = buildGingrCheckoutKeySet([gingrDog]);
assert.equal(isDogInGingrCheckoutBasket(gingrDog, keys), true);
assert.equal(isDogInGingrCheckoutBasket(webhookDog, keys), false);

console.log("board checkout merge tests passed");
