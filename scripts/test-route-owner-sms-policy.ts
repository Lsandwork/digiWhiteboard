import assert from "node:assert/strict";
import {
  evaluateOwnerEtaSmsGate,
  isSamsaraGpsFreshForSms,
  isVehicleMovingForSms,
  isWithinRouteOwnerSmsServiceHours,
  isWithinStopSmsWindow,
  routeOwnerSmsQuietHoursMessage,
  zonedMinutesNow
} from "../lib/route-generator/sms-policy";

function atPacific(hour: number, minute = 0) {
  // Construct a UTC instant that is the given wall time in America/Los_Angeles.
  // Use a fixed winter date to avoid DST ambiguity in tests.
  const guess = new Date(Date.UTC(2026, 0, 15, hour + 8, minute, 0));
  const minutes = zonedMinutesNow(guess);
  const desired = hour * 60 + minute;
  const delta = desired - minutes;
  return new Date(guess.getTime() + delta * 60_000);
}

const noon = atPacific(12, 0);
const midnight = atPacific(0, 30);
const evening = atPacific(20, 15);

assert.equal(isWithinRouteOwnerSmsServiceHours(noon), true);
assert.equal(isWithinRouteOwnerSmsServiceHours(midnight), false);
assert.equal(isWithinRouteOwnerSmsServiceHours(evening), false);
assert.ok(routeOwnerSmsQuietHoursMessage(midnight));
assert.equal(routeOwnerSmsQuietHoursMessage(noon), null);

assert.equal(isVehicleMovingForSms(0), false);
assert.equal(isVehicleMovingForSms(2.9), false);
assert.equal(isVehicleMovingForSms(3), true);
assert.equal(isVehicleMovingForSms(null), false);

assert.equal(isSamsaraGpsFreshForSms(new Date().toISOString()), true);
assert.equal(isSamsaraGpsFreshForSms(new Date(Date.now() - 20 * 60_000).toISOString()), false);
assert.equal(isSamsaraGpsFreshForSms(null), false);

const arrival = new Date(noon.getTime() + 20 * 60_000).toISOString();
assert.equal(
  isWithinStopSmsWindow({ now: noon, plannedArrivalAt: arrival }),
  true
);
assert.equal(
  isWithinStopSmsWindow({
    now: new Date(noon.getTime() - 2 * 60 * 60_000),
    plannedArrivalAt: arrival
  }),
  false
);

const freshGps = noon.toISOString();

const blockedQuiet = evaluateOwnerEtaSmsGate({
  now: midnight,
  smsAlertsEnabled: true,
  ownerPhone: "+15551234567",
  speedMilesPerHour: 20,
  gpsTime: midnight.toISOString(),
  plannedArrivalAt: arrival
});
assert.equal(blockedQuiet.allowed, false);
assert.equal(blockedQuiet.reason, "quiet_hours");

const blockedParked = evaluateOwnerEtaSmsGate({
  now: noon,
  smsAlertsEnabled: true,
  ownerPhone: "+15551234567",
  speedMilesPerHour: 0,
  gpsTime: freshGps,
  plannedArrivalAt: arrival
});
assert.equal(blockedParked.allowed, false);
assert.equal(blockedParked.reason, "vehicle_not_moving");

const blockedDisabled = evaluateOwnerEtaSmsGate({
  now: noon,
  smsAlertsEnabled: false,
  ownerPhone: "+15551234567",
  speedMilesPerHour: 20,
  gpsTime: freshGps,
  plannedArrivalAt: arrival
});
assert.equal(blockedDisabled.allowed, false);
assert.equal(blockedDisabled.reason, "sms_disabled");

const allowed = evaluateOwnerEtaSmsGate({
  now: noon,
  smsAlertsEnabled: true,
  ownerPhone: "+15551234567",
  speedMilesPerHour: 18,
  gpsTime: freshGps,
  plannedArrivalAt: arrival
});
assert.equal(allowed.allowed, true);
assert.equal(allowed.reason, "ok");

console.log("test-route-owner-sms-policy: ok");
