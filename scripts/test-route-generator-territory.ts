import assert from "node:assert/strict";
import type { HouseholdStopGroup } from "../lib/route-generator/households";
import type { NormalizedReportItem } from "../lib/route-generator/parser";
import type { VehicleCapacityConfig } from "../lib/route-generator/capacity";
import { assignGeographicVanLocks, clusterHouseholdsByProximity } from "../lib/route-generator/geo-cluster";
import { lockDropoffGroupsToPickupVans, optimizeRoutes, type OptimizedRoute } from "../lib/route-generator/optimizer";
import { buildDailyDogItineraries } from "../lib/route-generator/itinerary";
import { validateRoutePlan } from "../lib/route-generator/plan-validation";
import { reconcileTransportLegs } from "../lib/route-generator/reconciliation";
import { looksLikePostalAddress } from "../lib/route-generator/address";
import { DEFAULT_FITDOG_LOCATIONS } from "../lib/route-generator/locations";
import { pickPreferredRoutePlan } from "../lib/route-generator/route-health";
import { formatPostalAddress } from "../lib/route-generator/destination";

function item(partial: Partial<NormalizedReportItem> & Pick<NormalizedReportItem, "direction" | "dogName">): NormalizedReportItem {
  return {
    reservationId: partial.reservationId ?? `res-${partial.dogName}`,
    customerId: "cust-1",
    ownerFirstName: null,
    ownerLastName: null,
    ownerFullName: null,
    dogId: partial.dogId ?? `dog-${partial.dogName}`,
    dogName: partial.dogName,
    serviceRaw: partial.serviceRaw ?? "Adventure Hike",
    serviceCanonical: partial.serviceCanonical ?? "Adventure Hike",
    locationType: partial.locationType ?? "HOME",
    addressRaw: partial.addressRaw ?? "123 Main St, Santa Monica, CA 90405",
    addressStreet: partial.addressStreet ?? "123 Main St",
    addressUnit: null,
    addressCity: partial.addressCity ?? "Santa Monica",
    addressState: "CA",
    addressZip: partial.addressZip ?? "90405",
    ownerPhoneMasked: null,
    timeWindowStart: "07:00",
    timeWindowEnd: "09:00",
    dogSize: "Medium",
    specialNotes: null,
    driverNotes: null,
    reservationNotes: null,
    householdKey: partial.householdKey ?? `${partial.dogName}|home`,
    validationStatus: "ok",
    validationReasons: [],
    raw: { location_type: partial.locationType ?? "HOME" } as NormalizedReportItem["raw"],
    direction: partial.direction
  };
}

function group(dogName: string, address: string, householdKey: string, extra?: Partial<NormalizedReportItem>): HouseholdStopGroup {
  const row = item({
    direction: "pickup",
    dogName,
    addressRaw: address,
    householdKey,
    ...extra
  });
  return {
    householdKey,
    direction: "pickup",
    address,
    ownerName: dogName,
    items: [row],
    dogCount: 1
  };
}

const outingVans: VehicleCapacityConfig[] = [
  {
    vanKey: "van_1",
    active: true,
    vehiclePool: "outing",
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"],
    capacityConfigured: true
  },
  {
    vanKey: "van_2",
    active: true,
    vehiclePool: "outing",
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"],
    capacityConfigured: true
  }
];

const depot = {
  name: "Hub",
  address: DEFAULT_FITDOG_LOCATIONS.hub.address,
  latitude: DEFAULT_FITDOG_LOCATIONS.hub.latitude,
  longitude: DEFAULT_FITDOG_LOCATIONS.hub.longitude,
  timezone: "America/Los_Angeles",
  verified: true
};

function emptyRecon(expectedCount = 0) {
  return {
    expectedCount,
    assignedCount: 0,
    notRequiredCount: 0,
    blockedCount: 0,
    unassignedCount: 0,
    missingCount: 0,
    ok: true,
    legs: [],
    missing: [],
    blocked: [],
    unassigned: []
  };
}

// TEST 5 — two geographic areas, two vans, no alternating.
{
  const west = [
    group("A", "100 Ocean Ave, Santa Monica, CA 90401", "west-a"),
    group("B", "120 Ocean Ave, Santa Monica, CA 90401", "west-b"),
    group("C", "140 Ocean Ave, Santa Monica, CA 90401", "west-c")
  ];
  const east = [
    group("D", "3800 Overland Ave, Culver City, CA 90232", "east-d"),
    group("E", "3820 Overland Ave, Culver City, CA 90232", "east-e"),
    group("F", "3840 Overland Ave, Culver City, CA 90232", "east-f")
  ];
  const coords = {
    "west-a": { lat: 34.0194, lng: -118.4912 },
    "west-b": { lat: 34.0198, lng: -118.4908 },
    "west-c": { lat: 34.0201, lng: -118.4916 },
    "east-d": { lat: 34.0078, lng: -118.4068 },
    "east-e": { lat: 34.0082, lng: -118.4074 },
    "east-f": { lat: 34.0074, lng: -118.4062 }
  };
  const clusters = clusterHouseholdsByProximity({
    households: [...west, ...east],
    coordsByHousehold: coords
  });
  assert.equal(clusters.length, 2, "two geographic areas should form two clusters");
  const geo = assignGeographicVanLocks({
    households: [...west, ...east],
    vehicles: outingVans,
    coordsByHousehold: coords
  });
  const westVans = new Set(west.map((g) => geo.lockedVanByHousehold[g.householdKey]));
  const eastVans = new Set(east.map((g) => geo.lockedVanByHousehold[g.householdKey]));
  assert.equal(westVans.size, 1, "A/B/C must share one van");
  assert.equal(eastVans.size, 1, "D/E/F must share one van");
  assert.notEqual([...westVans][0], [...eastVans][0], "the two areas must use different vans");

  const pickup = optimizeRoutes({
    direction: "pickup",
    households: [...west, ...east],
    vehicles: outingVans,
    depot,
    sizeLoads: { Medium: 1, Unknown: 1, configured: true },
    seed: "territory-test-5",
    coordsByHousehold: coords,
    lockedVanByHousehold: geo.lockedVanByHousehold,
    operatingDate: "2026-08-18"
  });
  const vanOf = (name: string) =>
    pickup.routes.find((route) => route.stops.some((stop) => stop.dogNames.includes(name)))?.vanKey;
  assert.equal(vanOf("A"), vanOf("B"));
  assert.equal(vanOf("B"), vanOf("C"));
  assert.equal(vanOf("D"), vanOf("E"));
  assert.equal(vanOf("E"), vanOf("F"));
  assert.notEqual(vanOf("A"), vanOf("D"));
}

// TEST 6 — three nearby + one far: do not split the nearby cluster across vans.
{
  const nearby = [
    group("Near1", "100 Main St, Santa Monica, CA 90405", "n1"),
    group("Near2", "110 Main St, Santa Monica, CA 90405", "n2"),
    group("Near3", "120 Main St, Santa Monica, CA 90405", "n3")
  ];
  const far = group("Far", "10000 National Blvd, Los Angeles, CA 90034", "far");
  const coords = {
    n1: { lat: 34.02, lng: -118.49 },
    n2: { lat: 34.021, lng: -118.491 },
    n3: { lat: 34.019, lng: -118.489 },
    far: { lat: 34.03, lng: -118.4 }
  };
  const geo = assignGeographicVanLocks({
    households: [...nearby, far],
    vehicles: outingVans,
    coordsByHousehold: coords
  });
  const nearbyVans = new Set(nearby.map((g) => geo.lockedVanByHousehold[g.householdKey]));
  assert.equal(nearbyVans.size, 1, "nearby dogs stay on one van");
}

// TEST 7 — Baxter HOME PU → FITDOG DO stays Fitdog through generate/optimize.
{
  const pickupGroup = group("Baxter", "123 Main St, Santa Monica, CA 90405", "baxter-home", {
    locationType: "HOME",
    reservationId: "res-baxter"
  });
  const dropoffGroup: HouseholdStopGroup = {
    householdKey: "facility:club:adventure-hike|open",
    direction: "dropoff",
    address: DEFAULT_FITDOG_LOCATIONS.club.address,
    ownerName: "Fitdog Club",
    dogCount: 1,
    items: [
      item({
        direction: "dropoff",
        dogName: "Baxter",
        reservationId: "res-baxter",
        locationType: "FITDOG",
        addressRaw: DEFAULT_FITDOG_LOCATIONS.club.address,
        householdKey: "facility:club:adventure-hike|open"
      })
    ]
  };
  const pickup = optimizeRoutes({
    direction: "pickup",
    households: [pickupGroup],
    vehicles: outingVans,
    depot,
    sizeLoads: { Medium: 1, Unknown: 1, configured: true },
    seed: "baxter-home-fitdog",
    coordsByHousehold: { "baxter-home": { lat: 34.019, lng: -118.491 } },
    lockedVanByHousehold: { "baxter-home": "van_1" },
    operatingDate: "2026-08-18"
  });
  const dropLock = lockDropoffGroupsToPickupVans({
    pickupRoutes: pickup.routes,
    dropoffGroups: [dropoffGroup]
  });
  const dropoff = optimizeRoutes({
    direction: "dropoff",
    households: dropLock.dropoffGroups,
    vehicles: outingVans,
    depot,
    sizeLoads: { Medium: 1, Unknown: 1, configured: true },
    seed: "baxter-home-fitdog-do",
    coordsByHousehold: {
      "facility:club:adventure-hike|open": {
        lat: DEFAULT_FITDOG_LOCATIONS.club.latitude!,
        lng: DEFAULT_FITDOG_LOCATIONS.club.longitude!
      }
    },
    lockedVanByHousehold: dropLock.lockedVanByHousehold,
    operatingDate: "2026-08-18"
  });
  const dropStop = dropoff.routes.flatMap((route) => route.stops).find((stop) => stop.dogNames.includes("Baxter"));
  assert.ok(dropStop);
  assert.equal(dropStop!.locationType, "FITDOG");
  assert.match(String(dropStop!.formattedAddress || dropStop!.address), /1712\s+21st/i);
  assert.doesNotMatch(String(dropStop!.address), /123 Main St/i);

  const itineraries = buildDailyDogItineraries({
    items: [...pickupGroup.items, ...dropoffGroup.items],
    assignedStops: [...pickup.routes, ...dropoff.routes].flatMap((route) =>
      route.stops
        .filter((stop) => stop.stopKind === "customer")
        .map((stop) => ({
          direction: route.direction,
          vanKey: route.vanKey,
          reservationIds: stop.reservationIds,
          dogIds: stop.dogIds,
          dogNames: stop.dogNames
        }))
    )
  });
  assert.equal(itineraries[0]?.dropoff.locationType, "FITDOG");
  const exportAddress =
    formatPostalAddress({
      street1: "1712 21st St",
      city: "Santa Monica",
      state: "CA",
      postalCode: "90404",
      country: "USA"
    }) || "";
  assert.equal(looksLikePostalAddress(exportAddress), true);
  assert.doesNotMatch(exportAddress, /Baxter/i);
}

// TEST 8 — Atlas Van 2 pickup stays Van 2 on drop-off.
{
  const pickupGroup = group("Atlas", "200 Main St, Santa Monica, CA 90405", "atlas-home", {
    reservationId: "res-atlas",
    dogId: "dog-atlas"
  });
  const dropoffGroup: HouseholdStopGroup = {
    ...pickupGroup,
    direction: "dropoff",
    householdKey: "atlas-home-do",
    items: pickupGroup.items.map((row) => ({ ...row, direction: "dropoff" as const, householdKey: "atlas-home-do" }))
  };
  const pickup = optimizeRoutes({
    direction: "pickup",
    households: [pickupGroup],
    vehicles: outingVans,
    depot,
    sizeLoads: { Medium: 1, Unknown: 1, configured: true },
    seed: "atlas-van2",
    coordsByHousehold: { "atlas-home": { lat: 34.02, lng: -118.49 } },
    lockedVanByHousehold: { "atlas-home": "van_2" },
    operatingDate: "2026-08-18"
  });
  const atlasPickup = pickup.routes.find((route) => route.stops.some((stop) => stop.dogNames.includes("Atlas")));
  assert.equal(atlasPickup?.vanKey, "van_2");
  const dropLock = lockDropoffGroupsToPickupVans({
    pickupRoutes: pickup.routes,
    dropoffGroups: [dropoffGroup]
  });
  assert.equal(dropLock.lockedVanByHousehold["atlas-home-do"], "van_2");
  const dropoff = optimizeRoutes({
    direction: "dropoff",
    households: dropLock.dropoffGroups,
    vehicles: outingVans,
    depot,
    sizeLoads: { Medium: 1, Unknown: 1, configured: true },
    seed: "atlas-van2-do",
    coordsByHousehold: { "atlas-home-do": { lat: 34.02, lng: -118.49 } },
    lockedVanByHousehold: dropLock.lockedVanByHousehold,
    operatingDate: "2026-08-18"
  });
  const atlasDrop = dropoff.routes.find((route) => route.stops.some((stop) => stop.dogNames.includes("Atlas")));
  assert.equal(atlasDrop?.vanKey, "van_2");
}

// TEST 9 — missing dog blocks approval.
{
  const reconciliation = reconcileTransportLegs({
    items: [
      item({ direction: "pickup", dogName: "Captain", reservationId: "res-captain", serviceCanonical: "Adventure Hike" })
    ],
    assignedStops: []
  });
  const validation = validateRoutePlan({
    reconciliation,
    stops: [],
    expectedDogKeys: ["res-captain|pickup"]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.missingDogs.some((row) => /Captain|res-captain/i.test(row)));
}

// TEST 10 — duplicate dog blocks approval.
{
  const validation = validateRoutePlan({
    reconciliation: emptyRecon(1),
    stops: [
      {
        id: "s1",
        stopKind: "customer",
        ownerName: "Luna",
        address: "123 Main St, Santa Monica, CA 90405",
        formattedAddress: "123 Main St, Santa Monica, CA 90405",
        latitude: 34.02,
        longitude: -118.49,
        dogNames: ["Luna"],
        reservationIds: ["res-luna"],
        direction: "pickup",
        vanKey: "van_1"
      },
      {
        id: "s2",
        stopKind: "customer",
        ownerName: "Luna",
        address: "125 Main St, Santa Monica, CA 90405",
        formattedAddress: "125 Main St, Santa Monica, CA 90405",
        latitude: 34.021,
        longitude: -118.491,
        dogNames: ["Luna"],
        reservationIds: ["res-luna"],
        direction: "pickup",
        vanKey: "van_2"
      }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.duplicateDogs.length > 0);
}

// TEST 11 — two vans in the same cluster without capacity need is penalized / consolidated.
{
  const sameArea = [
    group("One", "100 Ocean Ave, Santa Monica, CA 90401", "sm-1"),
    group("Two", "110 Ocean Ave, Santa Monica, CA 90401", "sm-2"),
    group("Three", "120 Ocean Ave, Santa Monica, CA 90401", "sm-3")
  ];
  const coords = {
    "sm-1": { lat: 34.0194, lng: -118.4912 },
    "sm-2": { lat: 34.0196, lng: -118.491 },
    "sm-3": { lat: 34.0198, lng: -118.4908 }
  };
  const geo = assignGeographicVanLocks({
    households: sameArea,
    vehicles: outingVans,
    coordsByHousehold: coords
  });
  const vans = new Set(sameArea.map((g) => geo.lockedVanByHousehold[g.householdKey]));
  assert.equal(vans.size, 1, "one cluster that fits a van must not be split across vans");
}

// TEST 12 — invalid address blocks approval/export.
{
  assert.equal(looksLikePostalAddress("Baxter Drop Off"), false);
  assert.equal(looksLikePostalAddress("123 Main St, Santa Monica, CA 90405"), true);
  const validation = validateRoutePlan({
    reconciliation: emptyRecon(1),
    stops: [
      {
        id: "bad",
        stopKind: "customer",
        ownerName: "Baxter",
        address: "Baxter Drop Off",
        formattedAddress: "Baxter Drop Off",
        latitude: 34.02,
        longitude: -118.49,
        dogNames: ["Baxter"],
        direction: "pickup",
        vanKey: "van_1"
      }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.code === "address_looks_like_name"));
}

// TEST 13 — Fitdog → Fitdog never becomes the home street.
{
  const validation = validateRoutePlan({
    reconciliation: emptyRecon(1),
    stops: [
      {
        id: "fitdog",
        stopKind: "customer",
        ownerName: "Stay Pup",
        address: "400 Home Ave, Santa Monica, CA 90405",
        formattedAddress: "400 Home Ave, Santa Monica, CA 90405",
        latitude: 34.02,
        longitude: -118.49,
        householdKey: "home-street",
        locationType: "FITDOG",
        dogNames: ["Stay Pup"],
        direction: "dropoff",
        vanKey: "van_1"
      }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((issue) => issue.code === "fitdog_replaced_with_home"));
}

// TEST 14 — approved plan is preferred over a newer draft after refresh.
{
  const chosen = pickPreferredRoutePlan([
    { status: "needs_review", created_at: "2026-08-18T18:00:00.000Z", id: "draft" },
    { status: "approved", created_at: "2026-08-18T16:00:00.000Z", id: "approved" }
  ]);
  assert.equal(chosen?.id, "approved");
}

function routeHasDog(routes: OptimizedRoute[], name: string) {
  return routes.some((route) => route.stops.some((stop) => stop.dogNames.includes(name)));
}
assert.equal(typeof routeHasDog, "function");

console.log("test-route-generator-territory: ok");
