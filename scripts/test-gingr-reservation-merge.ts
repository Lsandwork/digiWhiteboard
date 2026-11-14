/**
 * Route generator merges same-day and checked-in reservation payloads.
 * Run: npx tsx scripts/test-gingr-reservation-merge.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import { mergeGingrReservationsById } from "../lib/gingr-route-generator/gingr-reservation-merge";

const merged = mergeGingrReservationsById(
  [
    {
      id: "1",
      reservation_id: "1",
      addons: [{ name: "Before Outing - Fitdog to Pick Up @ Home", id: "a1" }]
    } as GingrReservation
  ],
  [
    {
      id: "1",
      reservation_id: "1",
      addons: [{ name: "After Outing - Fitdog to Drop Off @ Home", id: "a2" }]
    } as GingrReservation
  ]
);

assert.equal(merged.length, 1);
const addons = (merged[0] as Record<string, unknown>).addons as { name: string }[];
assert.equal(addons.length, 2);

console.log("test-gingr-reservation-merge: ok");