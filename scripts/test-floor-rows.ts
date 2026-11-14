import assert from "node:assert/strict";
import { buildFloorRows } from "../lib/ops-command-center/floor-rows";
import type { LiveFloor } from "../lib/ops-command-center/live-floor";

const floor: LiveFloor = {
  businessDate: "2026-11-13",
  tomorrowDate: "2026-11-14",
  syncedAt: null,
  stale: false,
  error: null,
  onSite: [],
  onSiteByCategory: { boarding: 0, daycare: 1, training: 0, grooming: 0, outing: 0, other: 0 },
  pickupsRemaining: [],
  overduePickups: [
    {
      reservationId: "r1",
      animalId: "100",
      dogName: "Late Pickup",
      breed: "Mix",
      ownerName: "Owner",
      serviceType: "Daycare",
      category: "daycare",
      startsAt: null,
      endsAt: "2026-11-13T19:00:00.000Z",
      checkedInAt: null,
      allergies: null,
      medicines: null,
      hasNotes: false,
      minutesLate: 30,
      overstay: true
    }
  ],
  arrivalsExpected: [],
  lateArrivals: [
    {
      reservationId: "r2",
      animalId: "101",
      dogName: "Late Arrival",
      breed: "Mix",
      ownerName: "Owner",
      serviceType: "Daycare",
      category: "daycare",
      startsAt: "2026-11-13T15:00:00.000Z",
      endsAt: null,
      checkedInAt: null,
      allergies: null,
      medicines: null,
      hasNotes: false,
      minutesLate: 20
    }
  ],
  leftToday: 0,
  arrivedToday: 0,
  medicalWatch: [],
  tomorrow: {
    arrivals: 0,
    byCategory: { boarding: 0, daycare: 0, training: 0, grooming: 0, outing: 0, other: 0 },
    unconfirmed: 0,
    boardingArrivals: []
  }
};

const rows = buildFloorRows(floor);
assert.equal(rows[0]?.dogName, "Late Pickup");
assert.equal(rows[0]?.primaryLabel, "Open Gingr");
assert.equal(rows[1]?.dogName, "Late Arrival");
console.log("floor-rows ok", rows.length);