import assert from "node:assert/strict";
import { mapGingrBoardToLiveDogs } from "../lib/gingr-board-sync";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";
import type { LiveDog } from "../lib/types";

const nowIso = "2026-07-10T20:00:00.000Z";

setCachedBackOfHouseBoard({
  source: "gingr_back_of_house",
  checking_in: [],
  checking_out: [
    { id: 101, animal_id: 501, a_first: "Daycare", type: "Daycare", event_time: nowIso },
    { id: 102, animal_id: 502, a_first: "Groom", type: "Grooming", event_time: nowIso },
    { id: 103, animal_id: 503, a_first: "Train", type: "Training", event_time: nowIso },
    { id: 104, animal_id: 504, a_first: "Board", type: "Boarding", event_time: nowIso }
  ]
});

const mapped = mapGingrBoardToLiveDogs({
  source: "gingr_back_of_house",
  checking_in: [],
  checking_out: [
    { id: 101, animal_id: 501, a_first: "Daycare", type: "Daycare", event_time: nowIso },
    { id: 102, animal_id: 502, a_first: "Groom", type: "Grooming", event_time: nowIso },
    { id: 103, animal_id: 503, a_first: "Train", type: "Training", event_time: nowIso },
    { id: 104, animal_id: 504, a_first: "Board", type: "Boarding", event_time: nowIso }
  ]
});

assert.equal(mapped.length, 4);
assert.deepEqual(
  mapped.map((dog) => dog.reservation_type).sort(),
  ["Boarding", "Daycare", "Grooming", "Training"]
);

const checkoutOnly = mapped.filter((dog: LiveDog) => dog.display_status === "checking_out");
assert.equal(checkoutOnly.length, 4);

console.log("staff checkout reservation-type tests passed");
