import assert from "node:assert/strict";
import {
  coordKey,
  defaultDepartureTimeIso,
  heuristicDriveMinutes,
  matrixLookup,
  pacificLocalToUtcIso,
  type TravelTimeMatrix
} from "../lib/route-generator/google-maps";
import { optimizeRoutes, type DepotConfig } from "../lib/route-generator/optimizer";
import type { HouseholdStopGroup } from "../lib/route-generator/households";
import type { VehicleCapacityConfig } from "../lib/route-generator/capacity";
import type { NormalizedReportItem } from "../lib/route-generator/parser";
import type { FitdogLocationsConfig } from "../lib/route-generator/locations";

assert.match(pacificLocalToUtcIso("2026-07-15", 7, 0), /2026-07-15T14:00:00\.000Z|2026-07-15T15:00:00\.000Z/);
assert.match(defaultDepartureTimeIso("pickup", "2026-07-15"), /T1[45]:00:00/);
assert.equal(coordKey({ lat: 34.0195, lng: -118.4912 }), "34.01950,-118.49120");
assert.ok(heuristicDriveMinutes({ lat: 34.02, lng: -118.49 }, { lat: 34.04, lng: -118.45 }) >= 1);

const a = { lat: 34.01, lng: -118.5 };
const b = { lat: 34.02, lng: -118.48 };
const c = { lat: 34.03, lng: -118.46 };
const matrix: TravelTimeMatrix = {
  provider: "google_routes",
  departureTime: new Date().toISOString(),
  warnings: [],
  minutes: new Map([
    [`${coordKey(a)}>${coordKey(b)}`, 5],
    [`${coordKey(b)}>${coordKey(a)}`, 5],
    [`${coordKey(a)}>${coordKey(c)}`, 40],
    [`${coordKey(c)}>${coordKey(a)}`, 40],
    [`${coordKey(b)}>${coordKey(c)}`, 6],
    [`${coordKey(c)}>${coordKey(b)}`, 6]
  ]),
  meters: new Map()
};

assert.equal(matrixLookup(matrix, a, b)?.minutes, 5);

const depot: DepotConfig = {
  name: "Hub",
  address: "Hub",
  latitude: a.lat,
  longitude: a.lng,
  timezone: "America/Los_Angeles",
  verified: true
};

function item(key: string, address: string): NormalizedReportItem {
  return {
    direction: "pickup",
    dogName: key,
    ownerFullName: "Owner Test",
    ownerFirstName: "Owner",
    ownerLastName: "Test",
    customerId: null,
    dogId: null,
    addressRaw: address,
    addressStreet: address,
    addressUnit: null,
    addressCity: "Santa Monica",
    addressState: "CA",
    addressZip: "90401",
    ownerPhoneMasked: null,
    serviceCanonical: "Adventure Hike",
    serviceRaw: "Adventure Hike",
    dogSize: "Medium",
    reservationId: key,
    householdKey: key,
    validationStatus: "ok",
    validationReasons: [],
    specialNotes: null,
    driverNotes: null,
    reservationNotes: null,
    timeWindowStart: null,
    timeWindowEnd: null,
    raw: {}
  };
}

function household(key: string, address: string): HouseholdStopGroup {
  return {
    householdKey: key,
    direction: "pickup",
    address,
    ownerName: "Owner",
    dogCount: 1,
    items: [item(key, address)]
  };
}

const vehicles: VehicleCapacityConfig[] = [
  {
    vanKey: "van_3",
    vehiclePool: "outing",
    active: true,
    maxDogs: 12,
    maxLoadUnits: 20,
    maxLargeDogs: 8,
    maxStops: 20,
    homeBaseKey: "hub",
    eligibleServices: ["Adventure Hike", "Beach Excursion"],
    capacityConfigured: true
  }
];

const far = household("far", "Far St");
const near = household("near", "Near St");
const result = optimizeRoutes({
  direction: "pickup",
  households: [far, near],
  vehicles,
  depot,
  locations: {
    hub: {
      key: "hub",
      name: "Hub",
      address: "Hub",
      latitude: a.lat,
      longitude: a.lng,
      timezone: "America/Los_Angeles",
      verified: true
    },
    club: {
      key: "club",
      name: "Club",
      address: "Club",
      latitude: a.lat,
      longitude: a.lng,
      timezone: "America/Los_Angeles",
      verified: true
    },
    kenneth_hahn: {
      key: "kenneth_hahn",
      name: "Hahn",
      address: "Hahn",
      latitude: a.lat,
      longitude: a.lng,
      timezone: "America/Los_Angeles",
      verified: true
    },
    huntington: {
      key: "huntington",
      name: "Huntington",
      address: "Huntington",
      latitude: a.lat,
      longitude: a.lng,
      timezone: "America/Los_Angeles",
      verified: true
    }
  } satisfies FitdogLocationsConfig,
  sizeLoads: { Small: 1, Medium: 1, Large: 2, "Extra Large": 2, Unknown: 1 },
  coordsByHousehold: { far: c, near: b },
  travelMatrix: matrix,
  seed: "traffic-test"
});

const route = result.routes[0];
assert.ok(route, "expected a route");
const customerKeys = route!.stops.filter((s) => s.stopKind === "customer").map((s) => s.householdKey);
// Nearest traffic path from depot A should visit B (5 min) before C (40 min direct).
assert.deepEqual(customerKeys, ["near", "far"]);
// A→B (5) + B→C (6) + C→A (40) = 51 traffic minutes
assert.equal(route!.estimatedDriveMinutes, 51);
assert.ok(result.warnings.some((w) => /traffic/i.test(w)));

console.log("traffic routing tests passed");
