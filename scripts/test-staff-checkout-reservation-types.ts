import assert from "node:assert/strict";
import {
  isTrainingReservationType,
  mapGingrBoardToLiveDogs
} from "../lib/gingr-board-sync";
import { includePromptedCheckoutInBoard } from "../lib/board-checkout-merge";
import { setCachedBackOfHouseBoard } from "../lib/gingr-request-guard";
import type { LiveDog } from "../lib/types";

assert.equal(isTrainingReservationType("Training & Classes", 26), true);
assert.equal(isTrainingReservationType("Training Only", 20), true);
assert.equal(isTrainingReservationType("Full Day Daycare", 1), false);
assert.equal(isTrainingReservationType(null, 26), true);

const nowIso = "2026-07-10T20:00:00.000Z";

setCachedBackOfHouseBoard({
  source: "gingr_back_of_house",
  checking_in: [],
  checking_out: [
    { id: 101, animal_id: 501, a_first: "Daycare", type: "Daycare", event_time: nowIso },
    { id: 102, animal_id: 502, a_first: "Groom", type: "Grooming", event_time: nowIso },
    { id: 103, animal_id: 503, a_first: "Train", type: "Training", event_time: nowIso },
    { id: 104, animal_id: 504, a_first: "Board", type: "Boarding", event_time: nowIso },
    {
      id: 105,
      animal_id: 505,
      a_first: "Lila",
      type: "Training & Classes",
      type_id: 26,
      status_string: "Checking Out Soon",
      event_time: nowIso
    }
  ]
});

const mapped = mapGingrBoardToLiveDogs({
  source: "gingr_back_of_house",
  checking_in: [
    {
      id: 201,
      animal_id: 601,
      a_first: "ClassPup",
      type: "Training & Classes",
      type_id: 26,
      status_string: "Checking In Soon",
      check_in_stamp: null,
      event_time: nowIso
    },
    {
      id: 202,
      animal_id: 602,
      a_first: "CheckedTrain",
      type: "Training & Classes",
      type_id: 26,
      status_string: "Checked In",
      check_in_stamp: nowIso,
      event_time: nowIso
    }
  ],
  checking_out: [
    { id: 101, animal_id: 501, a_first: "Daycare", type: "Daycare", event_time: nowIso },
    { id: 102, animal_id: 502, a_first: "Groom", type: "Grooming", event_time: nowIso },
    { id: 103, animal_id: 503, a_first: "Train", type: "Training", event_time: nowIso },
    { id: 104, animal_id: 504, a_first: "Board", type: "Boarding", event_time: nowIso },
    {
      id: 105,
      animal_id: 505,
      a_first: "Lila",
      type: "Training & Classes",
      type_id: 26,
      status_string: "Checking Out Soon",
      event_time: nowIso
    },
    {
      id: 106,
      animal_id: 506,
      a_first: "Murphy",
      type: "Training & Classes",
      type_id: 26,
      status_string: "Checking Out Soon",
      in_checkout_basket: true,
      checkout_basket_added_at: nowIso,
      event_time: nowIso
    }
  ]
});

assert.equal(
  mapped.some((dog) => dog.animal_name === "Lila"),
  false,
  "Scheduled Training Checking Out Soon dogs must not appear on boards"
);
assert.equal(
  mapped.some((dog) => dog.animal_name === "ClassPup"),
  false,
  "Training Checking In Soon without a check-in stamp must not appear"
);
assert.equal(
  mapped.some((dog) => dog.animal_name === "CheckedTrain" && dog.display_status === "checking_in"),
  true,
  "Training dogs with an active check-in stamp must appear"
);
assert.equal(
  mapped.some((dog) => dog.animal_name === "Murphy" && dog.display_status === "checking_out"),
  true,
  "Training checkouts with basket/prompt evidence must appear"
);

assert.deepEqual(
  mapped
    .filter((dog) => dog.display_status === "checking_out")
    .map((dog) => dog.reservation_type)
    .sort(),
  ["Boarding", "Daycare", "Grooming", "Training", "Training & Classes"]
);

const trainingWebhook = {
  id: "wh-1",
  gingr_reservation_id: "999",
  gingr_animal_id: "888",
  animal_name: "Murphy",
  owner_name: "Owner",
  photo_url: null,
  reservation_type: "Training & Classes",
  current_status: "checking_out",
  display_status: "checking_out",
  room: null,
  notes: null,
  flags: {},
  status_started_at: new Date(Date.now() - 60_000).toISOString(),
  completed_at: null,
  display_until: new Date(Date.now() + 240_000).toISOString(),
  last_seen_from_gingr_at: new Date().toISOString(),
  raw_payload: { source: "gingr_webhook", webhook_type: "checking_out" },
  hidden: false,
  updated_at: new Date().toISOString()
} as LiveDog;

assert.equal(
  includePromptedCheckoutInBoard(trainingWebhook, new Set(), Date.now()),
  true,
  "Training webhook checkouts stay visible without Gingr basket membership"
);

console.log("staff checkout reservation-type tests passed");
