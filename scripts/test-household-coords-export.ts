/**
 * Regression: van-split drop-off household keys must still resolve coords.
 *
 * Real incident (2026-08-12): Daisy Coccari (Van 01) and Zuma Friendly Coccari
 * (Van 02) were the same household split across vans. Timing already suffixes
 * keys with `::service|band`, then lockDropoffGroupsToPickupVans adds `::van_N`.
 * The old copy used `split("::")[0]` which never matched the timing-keyed coords
 * map, so drop-off stops exported with blank lat/lng and Samsara rejected the CSV.
 */
import assert from "node:assert/strict";

import {
  copyCoordsForSplitHouseholdKeys,
  hasFiniteCoords,
  householdKeyPrefixes,
  householdKeysShareStem,
  lookupCoordsByHouseholdKey
} from "@/lib/route-generator/household-coords";
import { resolveExportStopLocation } from "@/lib/route-generator/service";

{
  const key = "123 main|a|santa monica|ca|90401::adventure-hike|07:00-09:00::van_1";
  assert.deepEqual(householdKeyPrefixes(key), [
    key,
    "123 main|a|santa monica|ca|90401::adventure-hike|07:00-09:00",
    "123 main|a|santa monica|ca|90401"
  ]);
}

{
  const timingKey = "123 main|a|santa monica|ca|90401::adventure-hike|07:00-09:00";
  const vanKey = `${timingKey}::van_1`;
  const coords = {
    [timingKey]: { lat: 34.02, lng: -118.49 }
  };
  // Old buggy lookup — first segment only — misses.
  assert.equal(coords[vanKey.split("::")[0]!], undefined);
  // Fixed lookup walks every prefix.
  assert.deepEqual(lookupCoordsByHouseholdKey(coords, vanKey), { lat: 34.02, lng: -118.49 });

  const copied = copyCoordsForSplitHouseholdKeys(coords, [vanKey, `${timingKey}::van_2`]);
  assert.equal(copied, 2);
  assert.deepEqual(coords[vanKey], { lat: 34.02, lng: -118.49 });
  assert.deepEqual(coords[`${timingKey}::van_2`], { lat: 34.02, lng: -118.49 });
}

{
  assert.equal(
    householdKeysShareStem(
      "123 main|a|santa monica|ca|90401::adventure-hike|07:00-09:00::van_1",
      "123 main|a|santa monica|ca|90401::adventure-hike|07:00-09:00::van_2"
    ),
    true
  );
  assert.equal(householdKeysShareStem("aaa", "bbb"), false);
  assert.equal(hasFiniteCoords(34.02, -118.49), true);
  assert.equal(hasFiniteCoords(null, null), false);
  assert.equal(hasFiniteCoords(0, 0), false);
}

// Export safety net: Daisy-shaped drop-off with null coords borrows the AM pickup.
{
  const timingKey = "coccari|santa monica|ca|90401::adventure-hike|07:00-09:00";
  const result = resolveExportStopLocation({
    stop: {
      id: "drop-daisy",
      stop_kind: "customer",
      household_key: `${timingKey}::van_1`,
      owner_name: "Daisy Coccari",
      address: "123 Coccari Ave, Santa Monica, CA 90401",
      latitude: null,
      longitude: null
    },
    allStops: [
      {
        id: "pick-daisy",
        stop_kind: "customer",
        household_key: timingKey,
        owner_name: "Daisy Coccari",
        address: "123 Coccari Ave, Santa Monica, CA 90401",
        latitude: 34.025,
        longitude: -118.48
      },
      {
        id: "drop-daisy",
        stop_kind: "customer",
        household_key: `${timingKey}::van_1`,
        owner_name: "Daisy Coccari",
        address: "123 Coccari Ave, Santa Monica, CA 90401",
        latitude: null,
        longitude: null
      }
    ],
    stopItemsByStop: new Map(),
    reportByReservation: new Map(),
    index: 0
  });
  assert.equal(result.repaired, true);
  assert.equal(result.source, "plan_donor_coords");
  assert.equal(result.latitude, 34.025);
  assert.equal(result.longitude, -118.48);
  assert.ok(result.address.includes("Coccari"));
}

// Zuma-shaped: same household stem, different owner label, still shares stem.
{
  const timingKey = "coccari|santa monica|ca|90401::adventure-hike|07:00-09:00";
  const result = resolveExportStopLocation({
    stop: {
      id: "drop-zuma",
      owner_name: "Zuma Friendly Coccari",
      household_key: `${timingKey}::van_2`,
      address: "123 Coccari Ave, Santa Monica, CA 90401",
      latitude: null,
      longitude: null
    },
    allStops: [
      {
        id: "pick-zuma",
        owner_name: "Zuma Friendly Coccari",
        household_key: timingKey,
        address: "123 Coccari Ave, Santa Monica, CA 90401",
        latitude: 34.025,
        longitude: -118.48
      }
    ],
    stopItemsByStop: new Map(),
    reportByReservation: new Map(),
    index: 1
  });
  assert.equal(result.latitude, 34.025);
  assert.equal(result.source, "plan_donor_coords");
}

// No donor at all — still emits finite coords so Digi never blocks the download.
{
  const result = resolveExportStopLocation({
    stop: {
      id: "orphan",
      owner_name: "Orphan Dog",
      household_key: "unknown|ca|90000",
      address: "1 Unknown St, Los Angeles, CA 90000",
      latitude: null,
      longitude: null
    },
    allStops: [],
    stopItemsByStop: new Map(),
    reportByReservation: new Map(),
    index: 3
  });
  assert.equal(result.repaired, true);
  assert.equal(result.source, "synthetic");
  assert.ok(hasFiniteCoords(result.latitude, result.longitude));
}

console.log("test-household-coords-export: ok");
