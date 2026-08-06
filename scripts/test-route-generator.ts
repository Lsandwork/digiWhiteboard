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
import { lockDropoffGroupsToPickupVans, optimizeRoutes } from "../lib/route-generator/optimizer";
import { DEFAULT_FITDOG_LOCATIONS, resolveRouteEndpoints } from "../lib/route-generator/locations";
import { serviceForAssignedVan } from "../lib/route-generator/fitdog-api";
import { manualTaxiToReportItems } from "../lib/route-generator/gingr-taxi";
import { filterItemsByWave } from "../lib/route-generator/apply-to-plan";
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
  getCanonicalSamsaraTemplate,
  SAMSARA_BULK_UPLOAD_HEADERS,
  SAMSARA_UNSUPPORTED_HEADERS,
  dropoffStartTimeForVan,
  synthesizeStopSchedule,
  validateExport
} from "../lib/route-generator/samsara-csv";
import { buildCustomerStopNotes, formatPhoneForDriver } from "../lib/route-generator/stop-notes";

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
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "route_generator", "front_desk_coordinator", "staff"),
  true
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "route_generator", "team_leader", "staff"),
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
  const clubGroup = facilityGroups.find((g) => g.householdKey === "facility:club:adventure-hike");
  const homeGroup = facilityGroups.find((g) => g.dogCount === 1 && g.items[0]?.dogName === "Teddy");
  assert.ok(clubGroup, "club facility group expected");
  assert.equal(clubGroup?.ownerName, "Fitdog Club");
  assert.equal(homeGroup?.ownerName, "Teddy Nguyen");

  // Beach + Adventure club dropoffs must not share one stop group (keeps Emmie off Van 3).
  const mixedFacility = groupHouseholdsWithFacilities([
    {
      direction: "dropoff",
      reservationId: "beach-1",
      customerId: "c-b",
      ownerFirstName: "Karen",
      ownerLastName: "Sears",
      ownerFullName: "Karen Sears",
      dogId: "luci",
      dogName: "Luci",
      serviceRaw: "Beach Excursion",
      serviceCanonical: "Beach Excursion",
      addressRaw: "1712 21st Street, Santa Monica, CA 90404",
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
      householdKey: "club",
      validationStatus: "ok",
      validationReasons: [],
      raw: { location_name: "Fitdog HQ" }
    },
    {
      direction: "dropoff",
      reservationId: "adv-1",
      customerId: "c-a",
      ownerFirstName: "Rose",
      ownerLastName: "Reiss",
      ownerFullName: "Rose Reiss",
      dogId: "emmie",
      dogName: "Emmie",
      serviceRaw: "Adventure Hikes",
      serviceCanonical: "Adventure Hike",
      addressRaw: "1712 21st Street, Santa Monica, CA 90404",
      addressStreet: "1712 21st Street",
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
      householdKey: "club",
      validationStatus: "ok",
      validationReasons: [],
      raw: { location_name: "Fitdog HQ" }
    }
  ]);
  const beachClub = mixedFacility.find((g) => g.householdKey === "facility:club:beach-excursion");
  const adventureClub = mixedFacility.find((g) => g.householdKey === "facility:club:adventure-hike");
  assert.ok(beachClub, "beach club group expected");
  assert.ok(adventureClub, "adventure club group expected");
  assert.deepEqual(
    beachClub?.items.map((i) => i.dogName),
    ["Luci"]
  );
  assert.deepEqual(
    adventureClub?.items.map((i) => i.dogName),
    ["Emmie"]
  );
}

assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_1", direction: "pickup" }), {
  startKey: "hub",
  endKey: "kenneth_hahn"
});
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_1", direction: "dropoff" }), {
  startKey: "kenneth_hahn",
  endKey: "hub"
});
// Van 3 Mon/Wed/Fri → Huntington; Tue/Thu → Kenneth Hahn (2026-07-27 is Monday).
assert.deepEqual(
  resolveRouteEndpoints({ vanKey: "van_3", direction: "pickup", operatingDate: "2026-07-27" }),
  { startKey: "hub", endKey: "huntington" }
);
assert.deepEqual(
  resolveRouteEndpoints({ vanKey: "van_3", direction: "dropoff", operatingDate: "2026-07-27" }),
  { startKey: "huntington", endKey: "hub" }
);
assert.deepEqual(
  resolveRouteEndpoints({ vanKey: "van_3", direction: "pickup", operatingDate: "2026-07-28" }),
  { startKey: "hub", endKey: "kenneth_hahn" }
);
assert.deepEqual(
  resolveRouteEndpoints({ vanKey: "van_3", direction: "dropoff", operatingDate: "2026-07-30" }),
  { startKey: "kenneth_hahn", endKey: "hub" }
);
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_5", direction: "pickup" }), {
  startKey: "club",
  endKey: "club"
});
assert.deepEqual(resolveRouteEndpoints({ vanKey: "van_6", direction: "dropoff" }), {
  startKey: "club",
  endKey: "club"
});
assert.equal(serviceForAssignedVan("van_5"), "Group Class");
assert.equal(serviceForAssignedVan("van_6"), "Group Class");
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
assert.equal(escapeCsvCell("-118.4323383"), "-118.4323383", "negative longitude must stay numeric for Samsara");
assert.equal(escapeCsvCell("34.0447222"), "34.0447222");
assert.equal(escapeCsvCell("-total dogs"), "'-total dogs");
const templateHeaders = readFileSync(path.join("scripts/fixtures/route-generator/samsara-template.csv"), "utf8")
  .trim()
  .split("\n")[0]!
  .split(",");
const mappings = autoMapSamsaraHeaders(templateHeaders);
assert.deepEqual(templateHeaders, [...SAMSARA_BULK_UPLOAD_HEADERS]);
assert.deepEqual(getCanonicalSamsaraTemplate().headers, [...SAMSARA_BULK_UPLOAD_HEADERS]);
assert.equal(mappings["Full Address"], "full_address");
assert.equal(mappings["Notes"], "stop_notes");
assert.equal(mappings["Address Name"], null);
assert.equal(mappings["Assigned Vehicle Name"], "assigned_vehicle");
assert.equal(mappings["Scheduled Arrival Time"], "scheduled_arrival");
for (const bad of SAMSARA_UNSUPPORTED_HEADERS) {
  assert.equal(
    (templateHeaders as string[]).includes(bad),
    false,
    `fixture must not include unsupported header ${bad}`
  );
}
const rows = [
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 01" }),
    routeNotes: "AM",
    vehicleName: "Van 01",
    driverName: "",
    stopName: "Depot",
    stopNotes: "start",
    stopAddress: "Depot, Santa Monica, CA 90401",
    scheduledArrival: "07/26/2026 07:00",
    scheduledDeparture: "07/26/2026 07:05",
    routeDate: "2026-07-26",
    stopOrder: 0,
    latitude: "34.01",
    longitude: "-118.49"
  },
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 01" }),
    routeNotes: "AM",
    vehicleName: "Van 01",
    driverName: "",
    stopName: "Alex Rivera",
    stopNotes: "2 dogs",
    stopAddress: "123 Ocean Ave, Santa Monica, CA 90401",
    scheduledArrival: "07/26/2026 07:08",
    scheduledDeparture: "07/26/2026 07:13",
    routeDate: "2026-07-26",
    stopOrder: 1,
    latitude: "34.02",
    longitude: "-118.50"
  },
  {
    routeName: buildRouteName({ date: "2026-07-26", direction: "pickup", vanDisplay: "Van 01" }),
    routeNotes: "AM",
    vehicleName: "Van 01",
    driverName: "",
    stopName: "Depot",
    stopNotes: "end",
    stopAddress: "Depot, Santa Monica, CA 90401",
    scheduledArrival: "07/26/2026 07:16",
    scheduledDeparture: "07/26/2026 07:16",
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
assert.ok(built.csv.includes("2026-07-26 AM Pickup - Van 01"));
assert.ok(built.csv.includes("Full Address"));
assert.ok(built.csv.includes("Scheduled Arrival Time"));
assert.ok(!built.csv.includes("Route Date"));
assert.ok(!built.csv.includes("Stop Order"));
assert.ok(!built.csv.toLowerCase().includes("van 4"));
// Synthesized schedule stays in America/Los_Angeles civil time.
const sched = synthesizeStopSchedule({
  operatingDate: "2026-07-27",
  direction: "pickup",
  stopIndex: 0,
  stopCount: 3
});
assert.equal(sched.arrival, "07/27/2026 07:00");

// Drop-off start: Van 1/2/3 at 10:30; Van 5/6 (club / group class) at 12:00.
assert.deepEqual(dropoffStartTimeForVan("van_1"), { hour: 10, minute: 30 });
assert.deepEqual(dropoffStartTimeForVan("van_2"), { hour: 10, minute: 30 });
assert.deepEqual(dropoffStartTimeForVan("van_3"), { hour: 10, minute: 30 });
assert.deepEqual(dropoffStartTimeForVan("van_5"), { hour: 12, minute: 0 });
assert.deepEqual(dropoffStartTimeForVan("van_6"), { hour: 12, minute: 0 });
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_1"
  }).arrival,
  "07/27/2026 10:30"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_3"
  }).arrival,
  "07/27/2026 10:30"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_5"
  }).arrival,
  "07/27/2026 12:00"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_6"
  }).arrival,
  "07/27/2026 12:00"
);

// Dropoff fixture parses
const dropParsed = parseCsv(dropoffCsv);
assert.ok(dropParsed.rows.length >= 5);

assert.equal(serviceForAssignedVan("van_1"), "Adventure Hike");
assert.equal(serviceForAssignedVan("van_3"), "Beach Excursion");

// Drop-off vans must match pickup vans (Van 3 never drops dogs it did not pick up).
{
  const dropoffLock = lockDropoffGroupsToPickupVans({
    pickupRoutes: [
      {
        vanKey: "van_3",
        vehiclePool: "outing",
        direction: "pickup",
        waveName: "Morning Pickup",
        stops: [
          {
            sequence: 1,
            stopKind: "customer",
            householdKey: "beach-home",
            ownerName: "Remy",
            address: "1 Beach",
            latitude: 34,
            longitude: -118,
            dogCount: 1,
            loadUnits: 1,
            largeDogs: 0,
            serviceTypes: ["Beach Excursion"],
            dogNames: ["Remy"],
            reservationIds: ["res-beach"],
            locked: false,
            notes: "Remy"
          }
        ],
        totalDogs: 1,
        loadUnitsUsed: 1,
        largeDogs: 0,
        serviceTypes: ["Beach Excursion"],
        warnings: [],
        estimatedDistanceMiles: 1,
        estimatedDriveMinutes: 5
      },
      {
        vanKey: "van_1",
        vehiclePool: "outing",
        direction: "pickup",
        waveName: "Morning Pickup",
        stops: [
          {
            sequence: 1,
            stopKind: "customer",
            householdKey: "adv-home",
            ownerName: "Emmie",
            address: "2 Adv",
            latitude: 34.1,
            longitude: -118.1,
            dogCount: 1,
            loadUnits: 1,
            largeDogs: 0,
            serviceTypes: ["Adventure Hike"],
            dogNames: ["Emmie"],
            reservationIds: ["res-adv"],
            locked: false,
            notes: "Emmie"
          }
        ],
        totalDogs: 1,
        loadUnitsUsed: 1,
        largeDogs: 0,
        serviceTypes: ["Adventure Hike"],
        warnings: [],
        estimatedDistanceMiles: 1,
        estimatedDriveMinutes: 5
      }
    ],
    dropoffGroups: [
      {
        householdKey: "beach-home",
        direction: "dropoff",
        address: "1 Beach",
        ownerName: "Remy",
        dogCount: 1,
        items: [
          {
            direction: "dropoff",
            reservationId: "res-beach",
            customerId: "c1",
            ownerFirstName: "A",
            ownerLastName: "B",
            ownerFullName: "A B",
            dogId: "d1",
            dogName: "Remy",
            serviceRaw: "Beach Excursion",
            serviceCanonical: "Beach Excursion",
            addressRaw: "1 Beach",
            addressStreet: "1 Beach",
            addressUnit: null,
            addressCity: "LA",
            addressState: "CA",
            addressZip: "90000",
            ownerPhoneMasked: null,
            timeWindowStart: null,
            timeWindowEnd: null,
            dogSize: "Medium",
            specialNotes: null,
            driverNotes: null,
            reservationNotes: null,
            householdKey: "beach-home",
            validationStatus: "ok",
            validationReasons: [],
            raw: {}
          }
        ]
      },
      {
        householdKey: "adv-home",
        direction: "dropoff",
        address: "2 Adv",
        ownerName: "Emmie",
        dogCount: 1,
        items: [
          {
            direction: "dropoff",
            reservationId: "res-adv",
            customerId: "c2",
            ownerFirstName: "C",
            ownerLastName: "D",
            ownerFullName: "C D",
            dogId: "d2",
            dogName: "Emmie",
            serviceRaw: "Adventure Hikes",
            serviceCanonical: "Adventure Hike",
            addressRaw: "2 Adv",
            addressStreet: "2 Adv",
            addressUnit: null,
            addressCity: "LA",
            addressState: "CA",
            addressZip: "90000",
            ownerPhoneMasked: null,
            timeWindowStart: null,
            timeWindowEnd: null,
            dogSize: "Small",
            specialNotes: null,
            driverNotes: null,
            reservationNotes: null,
            householdKey: "adv-home",
            validationStatus: "ok",
            validationReasons: [],
            raw: {}
          }
        ]
      }
    ]
  });
  assert.equal(dropoffLock.lockedVanByHousehold["beach-home"], "van_3");
  assert.equal(dropoffLock.lockedVanByHousehold["adv-home"], "van_1");
  assert.notEqual(dropoffLock.lockedVanByHousehold["adv-home"], "van_3");

  const dropoffOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropoffLock.dropoffGroups,
    vehicles: [
      {
        vanKey: "van_1",
        active: true,
        vehiclePool: "outing",
        maxDogs: 10,
        maxLoadUnits: 20,
        maxLargeDogs: 5,
        maxStops: 20,
        eligibleServices: ["Adventure Hike", "Beach Excursion"],
        capacityConfigured: true
      },
      {
        vanKey: "van_3",
        active: true,
        vehiclePool: "outing",
        maxDogs: 10,
        maxLoadUnits: 20,
        maxLargeDogs: 5,
        maxStops: 20,
        eligibleServices: ["Adventure Hike", "Beach Excursion"],
        capacityConfigured: true
      }
    ],
    depot: {
      name: "Hub",
      address: "Hub",
      latitude: 34.04,
      longitude: -118.43,
      timezone: "America/Los_Angeles",
      verified: true
    },
    sizeLoads: { Small: 1, Medium: 1, Large: 2, "Extra Large": 2, Unknown: 1, configured: true },
    seed: "dropoff-lock-test",
    lockedVanByHousehold: dropoffLock.lockedVanByHousehold,
    coordsByHousehold: {
      "beach-home": { lat: 34.02, lng: -118.5 },
      "adv-home": { lat: 34.03, lng: -118.4 }
    }
  });
  const van3 = dropoffOpt.routes.find((r) => r.vanKey === "van_3");
  const van1 = dropoffOpt.routes.find((r) => r.vanKey === "van_1");
  assert.ok(van3, "Van 3 drop-off route expected");
  assert.ok(van1, "Van 1 drop-off route expected");
  assert.deepEqual(
    van3!.stops.filter((s) => s.stopKind === "customer").flatMap((s) => s.dogNames),
    ["Remy"]
  );
  assert.ok(
    !van3!.stops.some((s) => s.dogNames.includes("Emmie")),
    "Van 3 drop-off must not include Adventure dogs picked up by Van 1"
  );
  assert.deepEqual(
    van1!.stops.filter((s) => s.stopKind === "customer").flatMap((s) => s.dogNames),
    ["Emmie"]
  );
}

assert.equal(formatPhoneForDriver("4132187041"), "(413) 218-7041");
{
  const indyNotes = buildCustomerStopNotes({
    direction: "pickup",
    items: [
      {
        direction: "pickup",
        reservationId: "1",
        customerId: "c",
        ownerFirstName: "Mark",
        ownerLastName: "DiRuzza",
        ownerFullName: "Mark DiRuzza",
        dogId: "d1",
        dogName: "Indy",
        serviceRaw: "Recall at the Beach",
        serviceCanonical: null,
        addressRaw: "1505 9th Street Apt 207, Santa Monica, CA 90401",
        addressStreet: "1505 9th Street",
        addressUnit: "207",
        addressCity: "Santa Monica",
        addressState: "CA",
        addressZip: "90401",
        ownerPhoneMasked: "•••-•••-7041",
        timeWindowStart: null,
        timeWindowEnd: null,
        dogSize: "Medium",
        specialNotes:
          "Entrance is #1986, 2nd floor door code 9102 (push n pull door), key is in potted tree",
        driverNotes:
          "Entrance is #1986, 2nd floor door code 9102 (push n pull door), key is in potted tree",
        reservationNotes: null,
        householdKey: "h-indy",
        validationStatus: "ok",
        validationReasons: [],
        raw: { phone: "4132187041", location_notes: "Entrance is #1986" }
      }
    ]
  });
  assert.ok(indyNotes.includes("Indy"));
  assert.ok(indyNotes.includes("Phone: (413) 218-7041"));
  assert.ok(indyNotes.includes("Pickup instructions:"));
  assert.ok(indyNotes.includes("door code 9102"));
  const noteRow = {
    routeName: "test",
    routeNotes: "",
    vehicleName: "Van 1",
    driverName: "",
    stopName: "Indy DiRuzza",
    stopNotes: indyNotes,
    stopAddress: "1505 9th Street",
    scheduledArrival: "",
    scheduledDeparture: "",
    routeDate: "2026-07-27",
    stopOrder: 1,
    latitude: "34.01",
    longitude: "-118.49"
  };
  const noteCsv = buildCsv({
    template: { headers: templateHeaders, delimiter: ",", encoding: "utf-8", mappings },
    rows: [noteRow]
  });
  assert.ok(noteCsv.csv.includes("Phone: (413) 218-7041"));
  assert.ok(noteCsv.csv.includes("door code 9102"));
}

{
  // Optimized customer stops must carry Fitdog instructions + phone into notes.
  const withNotes = optimizeRoutes({
    direction: "pickup",
    households: groupHouseholds([
      {
        direction: "pickup",
        reservationId: "99",
        customerId: "c",
        ownerFirstName: "Mark",
        ownerLastName: "DiRuzza",
        ownerFullName: "Mark DiRuzza",
        dogId: "d1",
        dogName: "Indy",
        serviceRaw: "Adventure Hikes",
        serviceCanonical: "Adventure Hike",
        addressRaw: "1505 9th Street Apt 207, Santa Monica, CA 90401",
        addressStreet: "1505 9th Street",
        addressUnit: "207",
        addressCity: "Santa Monica",
        addressState: "CA",
        addressZip: "90401",
        ownerPhoneMasked: "•••-•••-7041",
        timeWindowStart: null,
        timeWindowEnd: null,
        dogSize: "Medium",
        specialNotes: "Key is in potted tree",
        driverNotes: "Key is in potted tree",
        reservationNotes: null,
        householdKey: "1505 9th",
        validationStatus: "ok",
        validationReasons: [],
        raw: { phone: "(413) 218-7041" }
      }
    ]),
    vehicles: [
      {
        vanKey: "van_1",
        active: true,
        vehiclePool: "outing",
        maxDogs: 8,
        maxLoadUnits: 20,
        maxLargeDogs: 4,
        maxStops: 20,
        eligibleServices: ["Adventure Hike"],
        capacityConfigured: true
      }
    ],
    depot: {
      name: "Fitdog",
      address: "Depot",
      latitude: 34.01,
      longitude: -118.49,
      timezone: "America/Los_Angeles",
      verified: true
    },
    sizeLoads: { Small: 1, Medium: 1.5, Large: 2, "Extra Large": 2.5, Unknown: 2, configured: true },
    seed: "indy-notes",
    coordsByHousehold: { "1505 9th": { lat: 34.02, lng: -118.49 } }
  });
  const customer = withNotes.routes[0]?.stops.find((s) => s.stopKind === "customer");
  assert.ok(customer?.notes.includes("Phone: (413) 218-7041"));
  assert.ok(customer?.notes.includes("Key is in potted tree"));
  assert.equal(customer?.ownerPhoneDisplay, "(413) 218-7041");
}

{
  const taxiItems = manualTaxiToReportItems({
    dogName: "Mochi",
    ownerName: "Alex Rivera",
    address: "123 Ocean Ave",
    city: "Santa Monica",
    zip: "90401",
    vanKey: "van_5"
  });
  assert.equal(taxiItems.length, 2);
  assert.equal(taxiItems[0]?.serviceCanonical, "Taxi Service");
  assert.equal(taxiItems[0]?.serviceRaw, "Taxi");
  assert.equal(taxiItems[0]?.raw.locked_van, "van_5");
  assert.equal(taxiItems[0]?.direction, "pickup");
  assert.equal(taxiItems[1]?.direction, "dropoff");

  const pickupOnly = manualTaxiToReportItems({
    dogName: "Indy",
    address: "1505 9th",
    vanKey: "van_5",
    wave: "pickup"
  });
  assert.equal(pickupOnly.length, 1);
  assert.equal(pickupOnly[0]?.direction, "pickup");
  const dropOnly = manualTaxiToReportItems({
    dogName: "Indy",
    address: "1505 9th",
    vanKey: "van_5",
    wave: "dropoff"
  });
  assert.equal(dropOnly.length, 1);
  assert.equal(dropOnly[0]?.direction, "dropoff");
  assert.equal(filterItemsByWave(taxiItems, "pickup").length, 1);
  assert.equal(filterItemsByWave(taxiItems, "dropoff").length, 1);
  assert.equal(filterItemsByWave(taxiItems, "both").length, 2);
}

console.log("route-generator tests: ok");
