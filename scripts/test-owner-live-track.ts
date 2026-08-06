/**
 * Owner live-track threshold helpers (no DB / network).
 */
import assert from "node:assert/strict";
import {
  formatArriveAtLabel,
  OWNER_ETA_ALERT_MINUTES,
  OWNER_LIVE_MAP_MINUTES,
  ownerTrackHeadline,
  ownerTrackPhase,
  ownerTrackProgressStep,
  shouldSendEtaAlert,
  shouldShowLiveVehicle
} from "../lib/route-generator/owner-track-thresholds";

assert.equal(OWNER_ETA_ALERT_MINUTES, 15);
assert.equal(OWNER_LIVE_MAP_MINUTES, 10);

assert.equal(ownerTrackPhase({ status: "pending", etaMinutes: null }), "waiting");
assert.equal(ownerTrackPhase({ status: "en_route", etaMinutes: 40 }), "en_route");
assert.equal(ownerTrackPhase({ status: "en_route", etaMinutes: 15 }), "nearby");
assert.equal(ownerTrackPhase({ status: "arriving_15", etaMinutes: 12 }), "nearby");
assert.equal(ownerTrackPhase({ status: "arriving_15", etaMinutes: 10 }), "live");
assert.equal(ownerTrackPhase({ status: "arriving_15", etaMinutes: 4 }), "live");
assert.equal(ownerTrackPhase({ status: "arrived", etaMinutes: 0 }), "arrived");

assert.equal(shouldShowLiveVehicle(11, "en_route"), false);
assert.equal(shouldShowLiveVehicle(10, "en_route"), true);
assert.equal(shouldShowLiveVehicle(3, "arriving_15"), true);
assert.equal(shouldShowLiveVehicle(null, "arrived"), true);

assert.equal(shouldSendEtaAlert(16, false), false);
assert.equal(shouldSendEtaAlert(15, false), true);
assert.equal(shouldSendEtaAlert(8, true), false);

assert.equal(ownerTrackProgressStep("waiting"), 0);
assert.equal(ownerTrackProgressStep("en_route"), 1);
assert.equal(ownerTrackProgressStep("nearby"), 2);
assert.equal(ownerTrackProgressStep("live"), 3);
assert.equal(ownerTrackProgressStep("arrived"), 4);

assert.match(
  ownerTrackHeadline({ phase: "live", direction: "pickup", etaMinutes: 8 }),
  /almost there/i
);
assert.match(
  ownerTrackHeadline({ phase: "nearby", direction: "dropoff", etaMinutes: 14 }),
  /nearby/i
);

const label = formatArriveAtLabel(15, new Date("2026-07-27T20:00:00Z"), "America/Los_Angeles");
assert.ok(label && /\d/.test(label));

console.log("owner-live-track thresholds: ok");
