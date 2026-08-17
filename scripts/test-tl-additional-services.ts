import assert from "node:assert/strict";
import { auditTlAdditionalServicesFromReservations } from "../lib/tl-digi-board/additional-services-audit";
import {
  additionalServicesFromReservation,
  buildTlAdditionalServicesSummary
} from "../lib/tl-digi-board/additional-services";
import {
  mergeGingrServiceRows,
  resolveGingrServiceCompletion,
  serviceDisplayName
} from "../lib/tl-digi-board/gingr-service-completion";
import {
  isTlServicesEmailSendSlot,
  isTlServicesEmailWindow,
  tlServicesEmailSlotKey
} from "../lib/tl-digi-board/additional-services-email";
import {
  canonicalTlBoardServiceName,
  isTlBoardAdditionalService,
  TL_BOARD_REQUIRED_ADDITIONAL_SERVICES
} from "../lib/tl-digi-board/tl-service-names";
import { DEFAULT_TL_DIGI_BOARD_CONFIG } from "../lib/tl-digi-board/config";
import type { GingrReservation } from "../lib/integrations/gingr/types";

assert.equal(TL_BOARD_REQUIRED_ADDITIONAL_SERVICES.length, 10);

for (const label of TL_BOARD_REQUIRED_ADDITIONAL_SERVICES) {
  assert.equal(isTlBoardAdditionalService(label), true, label);
  assert.equal(canonicalTlBoardServiceName(label), label);
}

assert.equal(isTlBoardAdditionalService("Bath"), false);
assert.equal(isTlBoardAdditionalService("Free Daily Walk"), false);

assert.deepEqual(resolveGingrServiceCompletion({ complete: 1710000000 }), {
  state: "complete",
  source: "reservation.complete",
  reliable: true
});
assert.deepEqual(resolveGingrServiceCompletion({ complete: null }), {
  state: "incomplete",
  source: "reservation.complete",
  reliable: true
});
assert.deepEqual(resolveGingrServiceCompletion({ name: "Private Walk" }), {
  state: "unknown",
  source: "missing_completion_fields",
  reliable: false
});

const merged = mergeGingrServiceRows(
  { id: "1", name: "Taxi Service - Business Only" },
  { id: "1", name: "Taxi Service - Business Only", complete: null }
);
assert.equal(resolveGingrServiceCompletion(merged).reliable, true);

const reservation = {
  id: "3001",
  reservation_id: "3001",
  check_in_stamp: "1710000000",
  animal: { id: "88", name: "Atlas", image: "https://example.com/atlas.jpg" },
  reservation_type: { type: "Daycare" },
  services: [
    { id: "s1", name: "Daily Enrichment (3pm) - Business Only", scheduled_at: "2026-08-17 15:00:00", complete: null },
    { id: "s2", name: "Taxi Service - Business Only", scheduled_at: "2026-08-17 09:00:00", complete: 1710000000 },
    { id: "s3", name: "Puzzle Playtime", scheduled_at: "2026-08-17 14:00:00" }
  ]
} as GingrReservation;

const pending = additionalServicesFromReservation(reservation, "2026-08-17", DEFAULT_TL_DIGI_BOARD_CONFIG);
assert.deepEqual(
  pending.map((row) => [row.serviceName, row.displayStatus]),
  [
    ["Daily Enrichment (3pm) - Business Only", "needs_completion"],
    ["Puzzle Playtime", "completion_unknown"]
  ]
);
assert.equal(serviceDisplayName({ name: "Puzzle Playtime" }), "Puzzle Playtime");

const summary = buildTlAdditionalServicesSummary({ pending, completedHiddenCount: 1 });
assert.equal(summary.knownIncomplete, 1);
assert.equal(summary.completionUnknown, 1);
assert.equal(summary.completed, 1);

const auditPass = auditTlAdditionalServicesFromReservations([reservation], "2026-08-17", new Date("2026-08-17T20:00:00.000Z"));
assert.equal(auditPass.allRequiredTypesPass, false);
assert.equal(
  auditPass.perType.find((row) => row.serviceType === "Daily Enrichment (3pm) - Business Only")?.status,
  "pass"
);
assert.equal(auditPass.perType.find((row) => row.serviceType === "Puzzle Playtime")?.status, "fail");

const reservationReliable = {
  ...reservation,
  services: [
    { id: "s1", name: "Daily Enrichment (3pm) - Business Only", scheduled_at: "2026-08-17 15:00:00", complete: null }
  ]
} as GingrReservation;
const auditAllReliable = auditTlAdditionalServicesFromReservations(
  [reservationReliable],
  "2026-08-17",
  new Date("2026-08-17T20:00:00.000Z")
);
assert.equal(auditAllReliable.allReliable, true);

const sixThirtyAm = new Date("2026-08-17T13:30:00.000Z");
assert.equal(isTlServicesEmailWindow(sixThirtyAm), true);
assert.equal(isTlServicesEmailSendSlot(sixThirtyAm), true);
assert.equal(tlServicesEmailSlotKey(sixThirtyAm), "2026-08-17T06:30");

console.log("test-tl-additional-services: ok");
