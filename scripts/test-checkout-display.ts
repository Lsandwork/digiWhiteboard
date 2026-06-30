import assert from "node:assert/strict";
import {
  CHECKOUT_ALERT_MS,
  getCheckoutDisplayMinutes,
  getCheckoutDisplayMs,
  getStableCheckoutKey,
  shouldExpireCheckoutDog
} from "../lib/checkout-display";
import type { LiveDog } from "../lib/types";

assert.equal(getCheckoutDisplayMinutes(), 4);
assert.equal(getCheckoutDisplayMs(), 4 * 60 * 1000);
assert.equal(CHECKOUT_ALERT_MS, 20_000);

const dog: LiveDog = {
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
  status_started_at: "2026-06-30T12:00:00.000Z",
  completed_at: null,
  display_until: "2026-06-30T12:04:00.000Z",
  last_seen_from_gingr_at: "2026-06-30T12:00:00.000Z",
  hidden: false,
  updated_at: "2026-06-30T12:00:00.000Z"
};

assert.equal(
  shouldExpireCheckoutDog(dog, new Date("2026-06-30T12:03:59.000Z")),
  false
);
assert.equal(
  shouldExpireCheckoutDog(dog, new Date("2026-06-30T12:04:00.000Z")),
  true
);

const keyA = getStableCheckoutKey(dog);
const keyB = getStableCheckoutKey({
  ...dog,
  status_started_at: "2026-06-30T13:00:00.000Z"
});
assert.notEqual(keyA, keyB);

console.log("checkout-display checks passed");
