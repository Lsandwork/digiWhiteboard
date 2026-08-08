import assert from "node:assert/strict";
import { getDemoDriveState, getOwnerTrackingDemo } from "../lib/route-generator/owner-tracking";

const t0 = 1_700_000_000_000;
const start = getDemoDriveState(t0, t0);
assert.equal(start.speedFactor, 3);
assert.equal(start.etaMinutes, 12, `start eta ${start.etaMinutes}`);
assert.ok(start.routeProgress < 0.05, `start should be at beginning, got ${start.routeProgress}`);

// ~2 real minutes later at 3× ≈ 6 sim minutes into a 12-min trip
const mid = getDemoDriveState(t0 + 2 * 60 * 1000, t0);
assert.ok(mid.routeProgress > start.routeProgress, "van should move closer over time");
assert.ok(mid.etaMinutes < start.etaMinutes, "ETA should drop as demo advances");

const late = getDemoDriveState(t0 + 3.8 * 60 * 1000, t0);
assert.ok(late.routeProgress > 0.8 || late.arrived, "near end of demo trip");

const view = getOwnerTrackingDemo("example", { startedAtMs: t0, nowMs: t0 });
assert.equal(view.dogNames[0], "Indy");
assert.equal(view.etaMinutes, 12);
assert.ok(view.stop);
assert.ok(view.vehicle);
assert.equal(view.stopAddress, "Venice, Los Angeles, CA");

console.log("owner-track-demo-drive: ok", {
  startEta: start.etaMinutes,
  midEta: mid.etaMinutes,
  midProgress: Number(mid.routeProgress.toFixed(3)),
  lateProgress: Number(late.routeProgress.toFixed(3))
});

