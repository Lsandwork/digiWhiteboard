import assert from "node:assert/strict";
import {
  buildGingrBasketCheckoutKeys,
  filterCheckoutsToGingrBasket
} from "../lib/basket-cleared-checkout";
import type { LiveDog } from "../lib/types";

const basketKeys = buildGingrBasketCheckoutKeys({
  checking_out: [{ id: "res-100", animal_id: "animal-200" }],
  source: "gingr_back_of_house"
});

const inBasket: LiveDog = {
  id: "supabase-1",
  gingr_reservation_id: "res-100",
  gingr_animal_id: "animal-200",
  animal_name: "Brody",
  owner_name: "Johnson",
  photo_url: null,
  reservation_type: "Daycare",
  current_status: "checking_out",
  display_status: "checking_out",
  room: null,
  notes: null,
  flags: {},
  status_started_at: "2026-06-30T12:00:00.000Z",
  completed_at: null,
  display_until: null,
  last_seen_from_gingr_at: null,
  raw_payload: { source: "gingr webhook" },
  hidden: false,
  updated_at: "2026-06-30T12:00:00.000Z"
};

const cleared: LiveDog = {
  ...inBasket,
  id: "supabase-2",
  gingr_reservation_id: "res-999",
  gingr_animal_id: "animal-999"
};

assert.equal(filterCheckoutsToGingrBasket([inBasket, cleared], basketKeys).length, 1);
assert.equal(filterCheckoutsToGingrBasket([inBasket, cleared], basketKeys)[0]?.id, "supabase-1");
assert.equal(filterCheckoutsToGingrBasket([inBasket, cleared], new Set()).length, 0);

console.log("basket-cleared-checkout checks passed");
