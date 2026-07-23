import assert from "node:assert/strict";
import {
  AT_HOME_TRAINER_RATE_BPS,
  FACILITY_TRAINER_RATE_BPS,
  detectServiceLocation,
  trainerRateBpsForPackage,
  trainerRatePercentForPackage
} from "../lib/staff/commission-ledger/location-rate";
import { calculatePercentCommissionCents } from "../lib/staff/commission-ledger/money";

assert.equal(detectServiceLocation("At-Home Training Package"), "at_home");
assert.equal(detectServiceLocation("At Home Private Session"), "at_home");
assert.equal(detectServiceLocation("In-Home Behavior Package"), "at_home");
assert.equal(detectServiceLocation("Refund: At-Home Package"), "at_home");
assert.equal(detectServiceLocation("1 HOME Private Session"), "at_home");
assert.equal(detectServiceLocation("@ Home - Core Pack"), "at_home");
assert.equal(detectServiceLocation("3 Pack @ Home"), "at_home");
assert.equal(detectServiceLocation("PUPPY JUMPSTART"), "at_home");
assert.equal(detectServiceLocation("3 Pack @ Facility"), "facility");
assert.equal(detectServiceLocation("At Facility Obedience Package"), "facility");
assert.equal(detectServiceLocation("Group Class — Facility"), "facility");
assert.equal(detectServiceLocation("Private Session"), "facility");
assert.equal(detectServiceLocation(""), "facility");

assert.equal(trainerRateBpsForPackage("At-Home Session"), AT_HOME_TRAINER_RATE_BPS);
assert.equal(trainerRateBpsForPackage("3 Pack @ Facility"), FACILITY_TRAINER_RATE_BPS);
assert.equal(trainerRatePercentForPackage("At Home Package"), 70);
assert.equal(trainerRatePercentForPackage("Daycare Package"), 50);

assert.equal(calculatePercentCommissionCents(10_000, AT_HOME_TRAINER_RATE_BPS), 7_000);
assert.equal(calculatePercentCommissionCents(10_000, FACILITY_TRAINER_RATE_BPS), 5_000);

console.log("commission location rate: ok");
