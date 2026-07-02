import assert from "node:assert/strict";
import {
  getLobbyCheckoutDisplayMs,
  getLobbyCheckoutDisplayUntilIso,
  isLobbyCheckoutDogExpired,
  shouldExpireLobbyCheckoutDog
} from "../lib/lobby/checkout-display";
import type { LiveDog } from "../lib/types";

const anchor = "2026-07-01T16:00:00.000Z";
const dog: LiveDog = {
  id: "lobby-1",
  gingr_reservation_id: "100",
  gingr_animal_id: "200",
  animal_name: "Shiva",
  owner_name: null,
  photo_url: null,
  reservation_type: "Daycare",
  current_status: "checking_out",
  display_status: "checking_out",
  room: null,
  notes: null,
  flags: {},
  status_started_at: anchor,
  completed_at: null,
  display_until: null,
  last_seen_from_gingr_at: anchor,
  raw_payload: { source: "gingr_back_of_house", record: { event_time: anchor } },
  hidden: false,
  updated_at: anchor
};

assert.equal(getLobbyCheckoutDisplayMs(), 10 * 60 * 1000);

const untilIso = getLobbyCheckoutDisplayUntilIso(dog);
assert.equal(untilIso, "2026-07-01T16:10:00.000Z");

assert.equal(shouldExpireLobbyCheckoutDog(dog, new Date("2026-07-01T16:09:59.000Z")), false);
assert.equal(shouldExpireLobbyCheckoutDog(dog, new Date("2026-07-01T16:10:00.000Z")), true);

assert.equal(isLobbyCheckoutDogExpired({ display_until: untilIso }, Date.parse("2026-07-01T16:09:59.000Z")), false);
assert.equal(isLobbyCheckoutDogExpired({ display_until: untilIso }, Date.parse("2026-07-01T16:10:00.000Z")), true);

console.log("lobby checkout display tests passed");
