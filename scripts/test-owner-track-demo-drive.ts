import assert from "node:assert/strict";
import {
  getDemoDriveState,
  getDemoScenario,
  getOwnerTrackingDemo,
  isOwnerTrackingDemoToken
} from "../lib/route-generator/owner-tracking";

assert.equal(isOwnerTrackingDemoToken("jasper"), true);
assert.equal(isOwnerTrackingDemoToken("example"), true);

const t0 = 1_700_000_000_000;
const start = getDemoDriveState(t0, t0, "example");
assert.equal(start.speedFactor, 3);
assert.equal(start.etaMinutes, 12, `start eta ${start.etaMinutes}`);
assert.ok(start.routeProgress < 0.05, `start should be at beginning, got ${start.routeProgress}`);

// ~2 real minutes later at 3× ≈ 6 sim minutes into a 12-min trip
const mid = getDemoDriveState(t0 + 2 * 60 * 1000, t0, "example");
assert.ok(mid.routeProgress > start.routeProgress, "van should move closer over time");
assert.ok(mid.etaMinutes < start.etaMinutes, "ETA should drop as demo advances");

const late = getDemoDriveState(t0 + 3.8 * 60 * 1000, t0, "example");
assert.ok(late.routeProgress > 0.8 || late.arrived, "near end of demo trip");

const view = getOwnerTrackingDemo("example", { startedAtMs: t0, nowMs: t0 });
assert.equal(view.dogNames[0], "Indy");
assert.equal(view.etaMinutes, 12);
assert.ok(view.stop);
assert.ok(view.vehicle);
assert.equal(view.stopAddress, "Venice, Los Angeles, CA");

const jasperScenario = getDemoScenario("jasper");
assert.ok(jasperScenario);
assert.equal(jasperScenario!.dogNames[0], "Jasper");
assert.match(jasperScenario!.stopAddress, /7742 Redlands/i);

const jasperStart = getDemoDriveState(t0, t0, "jasper");
assert.equal(jasperStart.etaMinutes, 10);
// Start near Lincoln & Manchester
assert.ok(Math.abs(jasperStart.vehicle.lat - 33.96005) < 0.002);
assert.ok(Math.abs(jasperStart.vehicle.lng - -118.41815) < 0.002);

const jasperNear = getDemoDriveState(t0 + 3.1 * 60 * 1000, t0, "jasper");
const jasperView = getOwnerTrackingDemo("jasper", {
  startedAtMs: t0,
  nowMs: t0 + 3.1 * 60 * 1000
});
assert.ok(
  jasperNear.arrived ||
    jasperNear.etaMinutes <= 2 ||
    jasperNear.routeProgress >= 0.9 ||
    /pulling up/i.test(jasperView.headline),
  `expected pulling-up phase, got eta=${jasperNear.etaMinutes} progress=${jasperNear.routeProgress} headline=${jasperView.headline}`
);

const jasperArrived = getDemoDriveState(t0 + 4 * 60 * 1000, t0, "jasper");
assert.ok(jasperArrived.arrived, "jasper should arrive within ~4 real minutes at 3×");
assert.ok(Math.abs(jasperArrived.vehicle.lat - jasperScenario!.stop.lat) < 0.001);

console.log("owner-track-demo-drive: ok", {
  startEta: start.etaMinutes,
  midEta: mid.etaMinutes,
  jasperStartEta: jasperStart.etaMinutes,
  jasperNearEta: jasperNear.etaMinutes,
  jasperHeadline: jasperView.headline,
  lateProgress: Number(late.routeProgress.toFixed(3))
});
