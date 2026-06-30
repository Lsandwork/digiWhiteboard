import assert from "node:assert/strict";
import {
  getHideAfterAt,
  isContinuingSameTransition,
  MINIMUM_VISIBLE_MS,
  shouldHideCompletedDog
} from "../lib/transition-cleanup";

const startedAt = new Date("2026-06-30T12:00:00.000Z");

const activeDog = {
  status_started_at: startedAt.toISOString(),
  completed_at: null,
  current_status: "checking_in",
  hidden: false,
  display_status: "checking_in" as const
};

const completedEarly = {
  ...activeDog,
  completed_at: new Date(startedAt.getTime() + 30_000).toISOString(),
  current_status: "checked_in"
};

assert.equal(
  shouldHideCompletedDog(completedEarly, new Date(startedAt.getTime() + MINIMUM_VISIBLE_MS - 1)),
  false
);
assert.equal(
  shouldHideCompletedDog(completedEarly, new Date(startedAt.getTime() + MINIMUM_VISIBLE_MS)),
  true
);

assert.equal(isContinuingSameTransition(activeDog, "checking_in"), true);
assert.equal(
  isContinuingSameTransition({ ...completedEarly, hidden: false, display_status: "checking_in" }, "checking_in"),
  false
);

const hideAfter = getHideAfterAt(activeDog);
assert.equal(hideAfter?.toISOString(), new Date(startedAt.getTime() + MINIMUM_VISIBLE_MS).toISOString());

console.log("transition-cleanup checks passed");
