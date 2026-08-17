import assert from "node:assert/strict";
import {
  assertTlAdditionalServicesAuditPasses,
  auditTlAdditionalServicesFromReservations
} from "../lib/tl-digi-board/additional-services-audit";
import { TL_BOARD_REQUIRED_ADDITIONAL_SERVICES } from "../lib/tl-digi-board/tl-service-names";
import type { GingrReservation } from "../lib/integrations/gingr/types";

const date = "2026-08-17";
const now = new Date("2026-08-17T20:00:00.000Z");

assert.equal(TL_BOARD_REQUIRED_ADDITIONAL_SERVICES.length, 10);

const emptyAudit = auditTlAdditionalServicesFromReservations([], date, now);
assert.equal(emptyAudit.allRequiredTypesPass, true);
assert.equal(emptyAudit.perType.every((row) => row.status === "not_scheduled_today"), true);

const allTypesReservation = {
  id: "4000",
  reservation_id: "4000",
  check_in_stamp: "1",
  animal: { id: "1", name: "Demo" },
  services: TL_BOARD_REQUIRED_ADDITIONAL_SERVICES.map((name, index) => ({
    id: `svc-${index}`,
    name,
    scheduled_at: `${date} 10:00:00`,
    complete: null
  }))
} as GingrReservation;

const fullAudit = auditTlAdditionalServicesFromReservations([allTypesReservation], date, now);
assert.equal(fullAudit.allRequiredTypesPass, true);
assert.equal(fullAudit.perType.every((row) => row.status === "pass"), true);
assert.equal(fullAudit.perType.every((row) => row.scheduledToday === 1), true);
assertTlAdditionalServicesAuditPasses(fullAudit);

const failReservation = {
  ...allTypesReservation,
  services: [{ id: "x", name: "Private Walk", scheduled_at: `${date} 09:00:00` }]
} as GingrReservation;
const failAudit = auditTlAdditionalServicesFromReservations([failReservation], date, now);
assert.equal(failAudit.allRequiredTypesPass, false);
assert.throws(() => assertTlAdditionalServicesAuditPasses(failAudit));

console.log("test-tl-additional-services-audit: ok");
