import assert from "node:assert/strict";
import { resolveFitdogLastBookedForClient } from "../lib/staff/vip-auto-book/directory-sync";
import {
  fitdogServiceMatches,
  isFitdogVipPlatform,
  matchVipToFitdogHit,
  ownerNamesMatch,
  shouldClearNeedToRebook
} from "../lib/staff/vip-auto-book/match-utils";
import type { VipAutoBookClient } from "../lib/staff/vip-auto-book/types";

assert.equal(ownerNamesMatch("Tony Kalili", "Tony Kalili"), true);
assert.equal(ownerNamesMatch("Tony Kalili", "T Kalili"), true);
assert.equal(fitdogServiceMatches("adventure_hike", "Adventure Hikes"), true);
assert.equal(fitdogServiceMatches("adventure_hike", "Group Class"), false);
assert.equal(isFitdogVipPlatform("APP"), true);
assert.equal(isFitdogVipPlatform("Gingr / APP"), true);
assert.equal(isFitdogVipPlatform("Gingr"), false);

assert.equal(shouldClearNeedToRebook("2026-09-07", "2026-08-08"), true);
assert.equal(shouldClearNeedToRebook("2026-08-07", "2026-08-08"), false);
assert.equal(shouldClearNeedToRebook(null, "2026-08-08"), false);

const percy = {
  id: "vip-1",
  fitdogOwnerId: null,
  fitdogDogId: null,
  dogName: "Percy",
  ownerName: "Tony Kalili",
  serviceKind: "adventure_hike",
  platform: "APP"
} as VipAutoBookClient;

assert.equal(
  matchVipToFitdogHit(percy, {
    dogId: "d1",
    ownerId: "o1",
    dogName: "Percy",
    ownerName: "Tony Kalili"
  }),
  true
);

assert.equal(
  resolveFitdogLastBookedForClient(percy, [
    { date: "2026-08-26", serviceRaw: "Adventure Hikes" },
    { date: "2026-08-28", serviceRaw: "Adventure Hikes" },
    { date: "2026-09-07", serviceRaw: "Adventure Hikes" },
    { date: "2026-09-10", serviceRaw: "Group Class" }
  ]),
  "2026-09-07",
  "must prefer latest Adventure Hike date (09/07), not a later unrelated class"
);

assert.equal(
  resolveFitdogLastBookedForClient(percy, [
    { date: "2026-09-04", serviceRaw: "Adventure Hikes" },
    { date: "2026-09-07", serviceRaw: "Adventure Hikes" }
  ]),
  "2026-09-07"
);

console.log("vip fitdog last-booked checks passed");
