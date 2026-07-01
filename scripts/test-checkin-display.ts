import assert from "node:assert/strict";
import {
  getCheckinDisplayMinutes,
  getCheckinDisplayMs,
  getCheckinDisplayUntilAt,
  getStableCheckinKey,
  resolveActiveCheckinDisplayUntil,
  shouldExpireCheckinDog
} from "../lib/checkin-display";
import type { LiveDog } from "../lib/types";

assert.equal(getCheckinDisplayMinutes(), 4);
assert.equal(getCheckinDisplayMs(), 4 * 60 * 1000);

const dog: LiveDog = {
  id: "dog-1",
  gingr_reservation_id: "res-1",
  gingr_animal_id: "animal-1",
  animal_name: "Atlas",
  owner_name: "Victoria",
  photo_url: null,
  reservation_type: "Daycare",
  current_status: "checking_in",
  display_status: "checking_in",
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
  shouldExpireCheckinDog(dog, new Date("2026-06-30T12:03:59.000Z")),
  false
);
assert.equal(
  shouldExpireCheckinDog(dog, new Date("2026-06-30T12:04:00.000Z")),
  true
);

// Dogs without check_in completion must still expire at the display limit.
const stuckDog: LiveDog = {
  ...dog,
  completed_at: null,
  current_status: "checking_in",
  display_until: "2026-06-30T12:04:00.000Z"
};
assert.equal(shouldExpireCheckinDog(stuckDog, new Date("2026-06-30T12:04:01.000Z")), true);

const staleDisplayUntilDog: LiveDog = {
  ...dog,
  display_until: "2026-06-30T11:00:00.000Z"
};
assert.equal(
  shouldExpireCheckinDog(staleDisplayUntilDog, new Date("2026-06-30T12:02:00.000Z")),
  false
);
assert.equal(
  getCheckinDisplayUntilAt(staleDisplayUntilDog, undefined, new Date("2026-06-30T12:02:00.000Z"))?.toISOString(),
  "2026-06-30T12:04:00.000Z"
);
assert.equal(
  resolveActiveCheckinDisplayUntil(
    "2026-06-30T12:00:00.000Z",
    "2026-06-30T11:00:00.000Z",
    new Date("2026-06-30T12:05:00.000Z")
  ),
  "2026-06-30T12:09:00.000Z"
);

const keyA = getStableCheckinKey(dog);
const keyB = getStableCheckinKey({
  ...dog,
  status_started_at: "2026-06-30T13:00:00.000Z"
});
assert.notEqual(keyA, keyB);

console.log("checkin-display checks passed");
