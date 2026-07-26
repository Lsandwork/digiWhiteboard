import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  accessFromLegacyRole,
  canAccessAdminTab
} from "../lib/admin/permissions";
import { buildAdminNav } from "../lib/admin/nav-groups";
import { ADMIN_TABS } from "../lib/admin/types";
import { parseAddress, householdKey } from "../lib/route-generator/address";
import { capacityAllows, resolveLoadUnits, isServiceEligibleForVan } from "../lib/route-generator/capacity";
import { assertNeverVan4, FITDOG_VAN_KEYS } from "../lib/route-generator/flags";
import { formatStopDisplayName, groupHouseholds } from "../lib/route-generator/households";
import { groupHouseholdsWithFacilities } from "../lib/route-generator/facility";
import { optimizeRoutes } from "../lib/route-generator/optimizer";
import { DEFAULT_FITDOG_LOCATIONS, resolveRouteEndpoints } from "../lib/route-generator/locations";
import {
  autoMapHeaders,
  looksLikeLoginPage,
  normalizeReportRows,
  parseCsv,
  maskPhone
} from "../lib/route-generator/parser";
import { normalizeServiceName, classifyDirection } from "../lib/route-generator/services";
import {
  autoMapSamsaraHeaders,
  buildCsv,
  buildRouteName,
  escapeCsvCell,
  validateExport
} from "../lib/route-generator/samsara-csv";

// Permissions
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "route_generator", "owner_admin", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "owner_admin"), "route_generator", "owner_admin", "lobby"),
  false,
  "Route Generator must stay staff-board only even for Super Admin"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "assistant_manager"), "route_generator", "assistant_manager", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "daycare"), "route_generator", "daycare", "staff"),
  false,
  "handlers must not see Route Generator"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "trainer"), "route_generator", "trainer", "staff"),
  false
);

{
  const access = accessFromLegacyRole(null, null, "owner_admin");
  const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, "owner_admin", "staff"));
  const nav = buildAdminNav(visible, "staff");
  let section: string | null = null;
  let routeGeneratorSection: string | null = null;
  for (const entry of nav) {
    if (entry.type === "section") {
      section = entry.id;
      continue;
    }
    if (entry.type === "item" && entry.tab === "route_generator") {
      routeGeneratorSection = section;
      break;
    }
  }
  assert.equal(
    routeGeneratorSection,
    "staff_dashboard",
    "Route Generator must stay under Dashboard so the nav click is always reachable"
  );
}

// Never Van 4
assert.deepEqual(FITDOG_VAN_KEYS.includes("van_4" as never), false);
assert.throws(() => assertNeverVan4("van_4"));

// Service normalization
assert.equal(normalizeServiceName("Adventure Hikes"), "Adventure Hike");
assert.equal(normalizeServiceName("taxi services"), "Taxi Service");
assert.equal(normalizeServiceName("Unknown Thing"), null);
assert.equal(classifyDirection({ pickupRequested: "yes", dropoffRequested: "" }), "pickup");

// Address / household
const parsed = parseAddress("123 Ocean Ave Apt 2, Santa Monica, CA 90401");
assert.equal(parsed.unit, "2");
assert.equal(parsed.zip, "90401");
assert.ok(householdKey(parsed).includes("ocean"));

// Phone mask
assert.equal(maskPhone("3105551001"), "•••-•••-1001");

// CSV parser + fixtures
const pickupCsv = readFileSync(path.join("scripts/fixtures/route-generator/pickup-sample.csv"), "utf8");
const dropoffCsv = readFileSync(path.join("scripts/fixtures/route-generator/dropoff-sample.csv"), "utf8");
assert.equal(looksLikeLoginPage(pickupCsv), false);
assert.equal(looksLikeLoginPage('<form><input name="password" />Sign In</form>'), true);

const pickupParsed = parseCsv(pickupCsv);
const mapping = autoMapHeaders(pickupParsed.headers);
const normalized = normalizeReportRows({
  rows: pickupParsed.rows,
  mapping,
  defaultDirection: "pickup"
});
assert.ok(normalized.items.length >= 6);
assert.ok(
  normalized.items.some((i) => i.validationStatus === "error" || i.validationReasons.includes("Missing address")),
  "missing-address row must surface a validation issue"
);

const households = groupHouseholds(normalized.items.filter((i) => i.validationStatus !== "error"));
const mangoHouse = households.find((h) => h.items.some((i) => i.dogName === "Mango"));
assert.ok(mangoHouse);
assert.equal(mangoHouse!.dogCount >= 2, true, "same-address dogs stay grouped");

// Capacity / eligibility
const clubVan = {
  vanKey: "van_1",
  active: true,
  vehiclePool: "club" as const,
  maxDogs: 6,
  maxLoadUnits: 10,
  maxLargeDogs: 2,
  maxStops: 10,
  eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as const,
  capacityConfigured: true
};
assert.equal(isServiceEligibleForVan("Adventure Hike", { ...clubVan, eligibleServices: [...clubVan.eligibleServices] }), false);
assert.equal(isServiceEligibleForVan("Taxi Service", { ...clubVan, eligibleServices: [...clubVan.eligibleServices] }), true);
const load = resolveLoadUnits("Unknown", { Unknown: 2, configured: true });
assert.equal(load.units, 2);
assert.equal(load.unknown, true);
assert.equal(
  capacityAllows({
    vehicle: { ...clubVan, eligibleServices: [...clubVan.eligibleServices] },
    currentDogs: 5,
    currentLoad: 8,
    currentLarge: 1,
    currentStops: 3,
    addDogs: 2,
    addLoad: 2,
    addLarge: 0
  }).ok,
  false
);

// Optimizer
const vehicles = [
  {
    vanKey: "van_1",
    active: true,
    vehiclePool: "club" as const,
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
      "Trainer-Led Hike" | "Group Class" | "Taxi Service" | "Adventure Hike" | "Beach Excursion"
    >,
    capacityConfigured: true
  },
  {
    vanKey: "van_3",
    active: true,
    vehiclePool: "outing" as const,
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"] as Array<
      "Trainer-Led Hike" | "Group Class" | "Taxi Service" | "Adventure Hike" | "Beach Excursion"
    >,
    capacityConfigured: true
  },
  {
    vanKey: "van_2",
    active: true,
    vehiclePool: "club" as const,
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
      "Trainer-Led Hike" | "Group Class" | "Taxi Service" | "Adventure Hike" | "Beach Excursion"
    >,
    capacityConfigured: true
  },
  {
    vanKey: "van_5",
    active: true,
    vehiclePool: "outing" as const,
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"] as Array<
      "Trainer-Led Hike" | "Group Class" | "Taxi Service" | "Adventure Hike" | "Beach Excursion"
    >,
    capacityConfigured: true
  },
  {
    vanKey: "van_6",
    active: true,
    vehiclePool: "outing" as const,
    maxDogs: 8,
    maxLoadUnits: 20,
    maxLargeDogs: 4,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"] as Array<
      "Trainer-Led Hike" | "Group Class" | "Taxi Service" | "Adventure Hike" | "Beach Excursion"
    >,
    capacityConfigured: true
  }
];

const opt = optimizeRoutes({
  direction: "pickup",
  households,
  vehicles,
  depot: {
    name: "Fitdog",
    address: "Depot",
    latitude: 34.01,
    longitude: -118.49,
    timezone: "America/Los_Angeles",
    verified: true
  },
  sizeLoads: { Small: 1, Medium: 1.5, Large: 2, "Extra Large": 2.5, Unknown: 2, configured: true },
  seed: "test-seed-1",
  coordsByHousehold: Object.fromEntries(
    households.map((h, i) => [h.householdKey, { lat: 34.02 + i * 0.01, lng: -118.49 - i * 0.01 }])
  )
});

assert.ok(opt.routes.length > 0);
assert.ok(opt.routes.every((r) => r.vanKey !== ("van_4" as never)));
assert.ok(opt.routes.every((r) => r.stops[0]?.stopKind === "depot_start"));
assert.ok(opt.routes.every((r) => r.stops[r.stops.length - 1]?.stopKind === "depot_end"));
for (const route of opt.routes) {
  const start = route.stops[0];
  const end = route.stops[route.stops.length - 1];
  const endpoints = resolveRouteEndpoints({
    vanKey: route.vanKey,
    direction: "pickup",
    serviceTypes: route.serviceTypes
  });
  assert.equal(
    start?.ownerName,
    DEFAULT_FITDOG_LOCATIONS[endpoints.startKey].name,
    `${route.vanKey} should start at ${endpoints.startKey}`
  );
  assert.equal(
    end?.ownerName,
    DEFAULT_FITDOG_LOCATIONS[endpoints.endKey].name,
    `${route.vanKey} should end at ${endpoints.endKey}`
  );
  for (const service of route.serviceTypes) {
    const vehicle = vehicles.find((v) => v.vanKey === route.vanKey)!;
    assert.equal(vehicle.eligibleServices.includes(service), true, `${service} on ${route.vanKey}`);
  }
}

// Stop naming: dog (+ dog) + shared last name
assert.equal(
  formatStopDisplayName([
    {
      direction: "pickup",
      reservationId: "1",
      customerId: "c",
      ownerFirstName: "Rose",
      ownerLastName: "Reiss",
      ownerFullName: "Rose Reiss",
      dogId: "d1",
      dogName: "Emmie",
      serviceRaw: "Adventure Hikes",
      serviceCanonical: "Adventure Hike",
      addressRaw: "1 Main",
      addressStreet: "1 Main",
      addressUnit: null,
      addressCity: "Santa Monica",
      addressState: "CA",
      addressZip: "90402",
      ownerPhoneMasked: null,
      timeWindowStart: null,
      timeWindowEnd: null,
      dogSize: "Small",
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: "h1",
      validationStatus: "ok",
      validationReasons: [],
      raw: {}
    }
  ]),
  "Emmie Reiss"
);

// Facility dogs collapse to Fitdog Club stop (no home address stop)
{
  const facilityGroups = groupHouseholdsWithFacilities([
    {
      direction: "pickup",
      reservationId: "r-club",
      customerId: "c1",
      ownerFirstName: "Mark",
      ownerLastName: "Landecker",
      ownerFullName: "Mark Landecker",
      dogId: "3517",
      dogName: "Baxter",
      serviceRaw: "Adventure Hikes",
      serviceCanonical: "Adventure Hike",
      addressRaw: "1712 21st Street, Santa Monica, CA, 90404",
      addressStreet: "1712 21st Street",
      addressUnit: null,
      addressCity: "Santa Monica",
      addressState: "CA",
      addressZip: "90404",
      ownerPhoneMasked: null,
      timeWindowStart: null,
      timeWindowEnd: null,
      dogSize: "Medium",
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: "club-addr",
      validationStatus: "ok",
      validationReasons: [],
      raw: { location_name: "Fitdog HQ" }
    },
    {
      direction: "pickup",
      reservationId: "r-home",
      customerId: "c2",
      ownerFirstName: "Tina",
      ownerLastName: "Nguyen",
      ownerFullName: "Tina Nguyen",
      dogId: "9",
      dogName: "Teddy",
      serviceRaw: "Adventure Hikes",
      serviceCanonical: "Adventure Hike",
      addressRaw: "3219 Colorado Ave, Santa Monica, CA 90404",
      addressStreet: "3219 Colorado Ave",
      addressUnit: null,
      addressCity: "Santa Monica",
      addressState: "CA",
      addressZip: "90404",
      ownerPhoneMasked: null,
      timeWindowStart: null,
      timeWindowEnd: null,
      dogSize: "Small",
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: "home-addr",
      validationStatus: "ok",
      validationReasons: [],
      raw: {}
    }
  ]);
  const clubGroup = facilityGroups.find((g) => g.householdKey === "facility:club");
  const homeGroup = facilityGroups.find((g) => g.dogCount === 1 && g.items[0]?.dogName === "Teddy");
  assert.ok(clubGroup, "club facility group expected");
  assert.equal(clubGroup?.ownerName, "Fitdog Club");
  assert.equal(homeGroup?.ownerName, "Teddy Nguyen");
}

assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_1", direction: "pickup" }), {
  startKey: "hub",
  endKey: "kenneth_hahn"
});
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_1", direction: "dropoff" }), {
  startKey: "kenneth_hahn",
  endKey: "hub"
});
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_3", direction: "pickup" }), {
  startKey: "hub",
  endKey: "huntington"
});
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_3", direction: "dropoff" }), {
  startKey: "huntington",
  endKey: "hub"
});
const again = optimizeRoutes({
  direction: "pickup",
  households,
  vehicles,
  depot: {
    name: "Fitdog",
    address: "Depot",
    latitude: 34.01,
    longitude: -118.49,
    timezone: "America/Los_Angeles",
    verified: true
  },
  sizeLoads: { Small: 1, Medium: 1.5, Large: 2, "Extra Large": 2.5, Unknown: 2, configured: true },
  seed: "test-seed-1",
  coordsByHousehold: Object.fromEntries(
    households.map((h, i) => [h.householdKey, { lat: 34.02 + i * 0.01, lng: -118.49 - i * 0.01 }])
  )
});
assert.equal(JSON.stringify(opt.routes.map((r) => r.vanKey)), JSON.stringify(again.routes.map((r) => r.vanKey)));

// Samsara CSV
assert.equal(escapeCsvCell("=1+1"), "'=1+1");
const templateHeaders = readFileSync(path.join("scripts/fixtures/route-generator/samsara-template.csv"), "utf8")
  .trim()
  .split("\n")[0]!
  .split(",");
const mappings = autoMapSamsaraHeaders(templateHeaders);
const rows = [
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 1" }),
    routeNotes: "AM",
    vehicleName: "Van 1",
    driverName: "",
    stopName: "Depot",
    stopNotes: "start",
    stopAddress: "Depot, Santa Monica, CA 90401",
    scheduledArrival: "",
    scheduledDeparture: "",
    routeDate: "2026-07-26",
    stopOrder: 0,
    latitude: "34.01",
    longitude: "-118.49"
  },
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 1" }),
    routeNotes: "AM",
    vehicleName: "Van 1",
    driverName: "",
    stopName: "Alex Rivera",
    stopNotes: "2 dogs",
    stopAddress: "123 Ocean Ave, Santa Monica, CA 90401",
    scheduledArrival: "",
    scheduledDeparture: "",
    routeDate: "2026-07-26",
    stopOrder: 1,
    latitude: "34.02",
    longitude: "-118.50"
  },
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 1" }),
    routeNotes: "AM",
    vehicleName: "Van 1",
    driverName: "",
    stopName: "Depot",
    stopNotes: "end",
    stopAddress: "Depot, Santa Monica, CA 90401",
    scheduledArrival: "",
    scheduledDeparture: "",
    routeDate: "2026-07-26",
    stopOrder: 2,
    latitude: "34.01",
    longitude: "-118.49"
  }
];
const built = buildCsv({
  template: { headers: templateHeaders, delimiter: ",", encoding: "utf-8", mappings },
  rows
});
const validation = validateExport({
  template: { headers: templateHeaders, delimiter: ",", encoding: "utf-8", mappings },
  rows,
  csv: built.csv
});
assert.equal(validation.ok, true, JSON.stringify(validation.report));
assert.ok(built.csv.includes("2026-07-26 AM Pickup - Van 1"));
assert.ok(!built.csv.toLowerCase().includes("van 4"));

// Dropoff fixture parses
const dropParsed = parseCsv(dropoffCsv);
assert.ok(dropParsed.rows.length >= 5);

console.log("route-generator tests: ok");
