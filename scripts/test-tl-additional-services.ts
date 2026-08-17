import assert from "node:assert/strict";
import {
  additionalServicesFromReservation,
  buildTlAdditionalServicesSummary
} from "../lib/tl-digi-board/additional-services";
import {
  isGingrServiceCompleted,
  serviceDisplayName
} from "../lib/tl-digi-board/gingr-service-completion";
import {
  isTlServicesEmailSendSlot,
  isTlServicesEmailWindow,
  tlServicesEmailSlotKey
} from "../lib/tl-digi-board/additional-services-email";
import { isTlBoardAdditionalService } from "../lib/tl-digi-board/tl-service-names";
import { DEFAULT_TL_DIGI_BOARD_CONFIG } from "../lib/tl-digi-board/config";
import type { GingrReservation } from "../lib/integrations/gingr/types";

assert.equal(isTlBoardAdditionalService("Private Walk"), true);
assert.equal(isTlBoardAdditionalService("Group Walk"), true);
assert.equal(isTlBoardAdditionalService("Daily Enrichment (3pm) - Business Only"), true);
assert.equal(isTlBoardAdditionalService("Snack time - business only"), true);
assert.equal(isTlBoardAdditionalService("Puzzle Playtime"), true);
assert.equal(isTlBoardAdditionalService("Birthday Party"), true);
assert.equal(isTlBoardAdditionalService("Assessment Hike - Business Only"), true);
assert.equal(isTlBoardAdditionalService("Flea Preventative"), true);
assert.equal(isTlBoardAdditionalService("Bordetella - Business Only"), true);
assert.equal(isTlBoardAdditionalService("Taxi Service - Business Only"), true);
assert.equal(isTlBoardAdditionalService("Bath"), false);
assert.equal(isTlBoardAdditionalService("Free Daily Walk"), false);

assert.equal(isGingrServiceCompleted({ complete: 1710000000 }), true);
assert.equal(isGingrServiceCompleted({ complete: null }), false);
assert.equal(isGingrServiceCompleted({ complete: "" }), false);
assert.equal(isGingrServiceCompleted({ status: "Completed" }), true);
assert.equal(isGingrServiceCompleted({}), false);

const reservation = {
  id: "3001",
  reservation_id: "3001",
  check_in_stamp: "1710000000",
  animal: { id: "88", name: "Atlas", image: "https://example.com/atlas.jpg" },
  reservation_type: { type: "Daycare" },
  services: [
    { id: "s1", name: "Daily Enrichment (3pm) - Business Only", scheduled_at: "2026-08-17 15:00:00" },
    { id: "s2", name: "Taxi Service - Business Only", scheduled_at: "2026-08-17 09:00:00", complete: 1710000000 },
    { id: "s3", name: "Bath", scheduled_at: "2026-08-17 10:00:00" }
  ]
} as GingrReservation;

const pending = additionalServicesFromReservation(reservation, "2026-08-17", DEFAULT_TL_DIGI_BOARD_CONFIG);
assert.deepEqual(
  pending.map((row) => row.serviceName),
  ["Daily Enrichment (3pm) - Business Only"]
);
assert.equal(pending[0]?.dogName, "Atlas");
assert.equal(pending[0]?.gingrAnimalId, "88");
assert.equal(pending[0]?.displayStatus, "needs_completion");
assert.equal(serviceDisplayName({ name: "Puzzle Playtime" }), "Puzzle Playtime");

const summary = buildTlAdditionalServicesSummary(pending, 1);
assert.equal(summary.remaining, 1);
assert.equal(summary.completed, 1);
assert.equal(summary.due, 2);

const sixThirtyAm = new Date("2026-08-17T13:30:00.000Z"); // 6:30 AM PDT
const nineThirtyAm = new Date("2026-08-17T16:30:00.000Z");
const fiveAm = new Date("2026-08-17T12:00:00.000Z");
const eightPm = new Date("2026-08-18T03:15:00.000Z");

assert.equal(isTlServicesEmailWindow(sixThirtyAm), true);
assert.equal(isTlServicesEmailSendSlot(sixThirtyAm), true);
assert.equal(tlServicesEmailSlotKey(sixThirtyAm), "2026-08-17T06:30");
assert.equal(isTlServicesEmailSendSlot(nineThirtyAm), true);
assert.equal(isTlServicesEmailWindow(fiveAm), false);
assert.equal(isTlServicesEmailSendSlot(fiveAm), false);
assert.equal(isTlServicesEmailWindow(eightPm), false);

console.log("test-tl-additional-services: ok");
