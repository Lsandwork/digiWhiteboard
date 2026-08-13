import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  accessFromLegacyRole,
  canAccessAdminTab
} from "../lib/admin/permissions";
import { buildAdminNav, buildStaffPanelNav } from "../lib/admin/nav-groups";
import { ADMIN_TABS } from "../lib/admin/types";
import { parseAddress, householdKey } from "../lib/route-generator/address";
import { capacityAllows, resolveLoadUnits, isServiceEligibleForVan } from "../lib/route-generator/capacity";
import { assertNeverVan4, FITDOG_VAN_KEYS, parseRouteGenerationMode } from "../lib/route-generator/flags";
import { formatStopDisplayName, groupHouseholds } from "../lib/route-generator/households";
import { groupHouseholdsWithFacilities } from "../lib/route-generator/facility";
import { lockDropoffGroupsToPickupVans, optimizeRoutes } from "../lib/route-generator/optimizer";
import {
  PRIMARY_CLUB_VAN,
  remapClubVanLocks,
  resolveClubVanFleet
} from "../lib/route-generator/club-vans";
import { DEFAULT_FITDOG_LOCATIONS, resolveRouteEndpoints } from "../lib/route-generator/locations";
import { serviceForAssignedVan } from "../lib/route-generator/fitdog-api";
import {
  mapGingrReservationToTaxiRow,
  manualTaxiToReportItems,
  reservationHasTaxi
} from "../lib/route-generator/gingr-taxi";
import { normalizeGingrReservationList } from "../lib/integrations/gingr/client";
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
  combinedExportFileName,
  escapeCsvCell,
  splitCombinedExportRows,
  ensureScheduleOnOperatingDate,
  formatSamsaraCoordinate,
  getCanonicalSamsaraTemplate,
  normalizeSamsaraVehicleName,
  sanitizeSamsaraNotes,
  SAMSARA_BULK_UPLOAD_HEADERS,
  SAMSARA_STOP_NOTES_MAX_CHARS,
  SAMSARA_UNSUPPORTED_HEADERS,
  dropoffStartTimeForVan,
  synthesizeStopSchedule,
  todayInLosAngeles,
  validateExport
} from "../lib/route-generator/samsara-csv";
import { buildCustomerStopNotes, formatPhoneForDriver, phoneDigitsE164 } from "../lib/route-generator/stop-notes";
import { normalizeSmsToE164 } from "../lib/integrations/sms/provider";
import { extractOwnerPhoneE164 } from "../lib/route-generator/owner-tracking";
import {
  detectSharedDogTimingConflicts,
  extractHhMmFromStored,
  hhMmOnOperatingDateToIso,
  orderStopsForTimeliness,
  sharedDogTimingClashPenalty,
  splitItemsByServiceAndWindow,
  windowBandKey,
  windowsOverlap
} from "../lib/route-generator/timing";

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
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), "route_generator", "team_leader", "staff"),
  false,
  "Team Leads must not open Route Generator"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "front_desk_coordinator"), "route_generator", "front_desk_coordinator", "staff"),
  false,
  "Front Desk Coordinators must not open Route Generator"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), "route_generator", "driver", "staff"),
  true,
  "Transportation Driver/Hiker can open Route Generator"
);
assert.equal(
  canAccessAdminTab(accessFromLegacyRole(null, null, "hiker"), "route_generator", "hiker", "staff"),
  true,
  "Transportation Driver/Hiker can open Route Generator"
);
{
  const transportationDept = accessFromLegacyRole(null, null, "team_leader");
  transportationDept.departments = ["transportation"];
  assert.equal(
    canAccessAdminTab(transportationDept, "route_generator", "team_leader", "staff"),
    true,
    "Transportation department assignment can open Route Generator"
  );
}

{
  const access = accessFromLegacyRole(null, null, "owner_admin");
  const visible = ADMIN_TABS.filter((tab) => canAccessAdminTab(access, tab, "owner_admin", "staff"));
  const nav = buildStaffPanelNav(visible, "staff", "owner_admin");
  assert.ok(visible.includes("route_generator"), "Super Admin can open Route Generator");
  assert.ok(
    nav.some((entry) => entry.type === "item" && entry.tab === "sa_apps_hub"),
    "Route Generator stays under the Apps hub for Super Admin"
  );

  const teamLeadNav = buildStaffPanelNav(
    ADMIN_TABS.filter((tab) => canAccessAdminTab(accessFromLegacyRole(null, null, "team_leader"), tab, "team_leader", "staff")),
    "staff",
    "team_leader"
  );
  assert.equal(
    teamLeadNav.some((entry) => entry.type === "item" && entry.tab === "route_generator"),
    false,
    "Team Lead sidebar must not list Route Generator"
  );

  const driverNavTabs = ADMIN_TABS.filter((tab) =>
    canAccessAdminTab(accessFromLegacyRole(null, null, "driver"), tab, "driver", "staff")
  );
  assert.ok(driverNavTabs.includes("route_generator"), "Driver/Hiker visible tabs include Route Generator");
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
  const clubGroup = facilityGroups.find((g) =>
    String(g.householdKey).startsWith("facility:club:adventure-hike")
  );
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
  const beachClub = mixedFacility.find((g) =>
    String(g.householdKey).startsWith("facility:club:beach-excursion")
  );
  const adventureClub = mixedFacility.find((g) =>
    String(g.householdKey).startsWith("facility:club:adventure-hike")
  );
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
assert.equal(mappings["Stop Notes"], "stop_notes");
assert.equal(mappings["Address Name"], null);
assert.equal(mappings["Assigned Vehicle Name"], "assigned_vehicle");
assert.equal(mappings["Stop Arrival Time"], "scheduled_arrival");
assert.equal(mappings["Stop Departure Time"], "scheduled_departure");
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
    scheduledArrival: "7/26/2026 7:00",
    scheduledDeparture: "7/26/2026 7:05",
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
    scheduledArrival: "7/26/2026 7:08",
    scheduledDeparture: "7/26/2026 7:13",
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
    scheduledArrival: "7/26/2026 7:16",
    scheduledDeparture: "7/26/2026 7:21",
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
assert.ok(built.csv.includes("\r\n"), "Samsara official samples use CRLF");
assert.ok(built.csv.includes("2026-07-26 AM Pickup - Van 01"));
assert.ok(built.csv.includes("Full Address"));
assert.ok(built.csv.includes("Stop Arrival Time"));
assert.ok(built.csv.includes("Stop Departure Time"));
assert.ok(built.csv.includes("Stop Notes"));
assert.ok(!built.csv.includes("Scheduled Arrival Time"));
assert.ok(!built.csv.includes("Route Date"));
assert.ok(!built.csv.includes("Stop Order"));
assert.ok(!built.csv.toLowerCase().includes("van 4"));
// Synthesized schedule stays in America/Los_Angeles civil time (unpadded m/d/yyyy H:mm).
const sched = synthesizeStopSchedule({
  operatingDate: "2026-07-27",
  direction: "pickup",
  stopIndex: 0,
  stopCount: 3
});
assert.equal(sched.arrival, "7/27/2026 7:00");
assert.equal(sched.departure, "7/27/2026 7:05");
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "pickup",
    stopIndex: 2,
    stopCount: 3
  }).departure,
  "7/27/2026 7:21",
  "final stop must still have a dwell so Samsara accepts departure"
);
assert.equal(normalizeSamsaraVehicleName("Van 1"), "Van 01");
assert.equal(normalizeSamsaraVehicleName("van_5"), "Van 05");
assert.equal(sanitizeSamsaraNotes("Dogs: Indy\nPhone: (310) 555-1212"), "Dogs: Indy | Phone: (310) 555-1212");
assert.ok(!/[^\x20-\x7E]/.test(sanitizeSamsaraNotes("Dogs: Indy\nPhone: (310) 555-1212")));
assert.ok(!sanitizeSamsaraNotes("Dogs: Indy\nPhone: (310) 555-1212").includes("·"));
assert.ok(sanitizeSamsaraNotes(`${"x".repeat(600)}`).length <= SAMSARA_STOP_NOTES_MAX_CHARS);
assert.ok(!sanitizeSamsaraNotes("Dogs\u0000Indy").includes("\u0000"));
assert.equal(formatSamsaraCoordinate("34.01950000000001"), "34.0195");
assert.equal(formatSamsaraCoordinate("-118.49120000000002"), "-118.4912");
assert.match(todayInLosAngeles(), /^\d{4}-\d{2}-\d{2}$/);

const wrongDay = ensureScheduleOnOperatingDate({
  operatingDate: "2026-08-11",
  arrival: "8/7/2026 7:00",
  departure: "8/7/2026 7:05",
  direction: "pickup",
  stopIndex: 0,
  stopCount: 3
});
assert.equal(wrongDay.realigned, true);
assert.equal(wrongDay.arrival, "8/11/2026 7:00");
assert.equal(wrongDay.departure, "8/11/2026 7:05");

const missingCoords = validateExport({
  template: getCanonicalSamsaraTemplate(),
  rows: [
    {
      ...rows[0]!,
      latitude: "",
      longitude: ""
    },
    rows[1]!
  ],
  csv: built.csv,
  operatingDate: "2026-07-26"
});
assert.equal(missingCoords.ok, false, "missing lat/lng must fail before Samsara upload");

const sameDayValidation = validateExport({
  template: getCanonicalSamsaraTemplate(),
  rows,
  csv: built.csv,
  operatingDate: "2026-07-26"
});
assert.equal(sameDayValidation.ok, true, JSON.stringify(sameDayValidation.report));

// Hard blocks that previously slipped through and caused Samsara Internal Server Error.
const badVehicle = validateExport({
  template: getCanonicalSamsaraTemplate(),
  rows: rows.map((row) => ({ ...row, vehicleName: "Club Shuttle" })),
  csv: buildCsv({
    template: getCanonicalSamsaraTemplate(),
    rows: rows.map((row) => ({ ...row, vehicleName: "Club Shuttle" }))
  }).csv,
  operatingDate: "2026-07-26"
});
assert.equal(badVehicle.ok, false, "non-roster vehicle must fail closed");

const equalDwell = validateExport({
  template: getCanonicalSamsaraTemplate(),
  rows: [
    { ...rows[0]!, scheduledArrival: "7/26/2026 7:00", scheduledDeparture: "7/26/2026 7:00" },
    rows[1]!,
    rows[2]!
  ],
  csv: built.csv,
  operatingDate: "2026-07-26"
});
assert.equal(equalDwell.ok, false, "arrival === departure must fail");

const nonMono = validateExport({
  template: getCanonicalSamsaraTemplate(),
  rows: [
    rows[0]!,
    {
      ...rows[1]!,
      scheduledArrival: "7/26/2026 7:04",
      scheduledDeparture: "7/26/2026 7:09"
    },
    rows[2]!
  ],
  csv: built.csv,
  operatingDate: "2026-07-26"
});
assert.equal(nonMono.ok, false, "arrival before previous departure must fail");

assert.ok(!sanitizeSamsaraNotes("Dogs\u200bIndy — “Buddy” 🐶").includes("\u200b"));
assert.ok(!/[^\x20-\x7E]/.test(sanitizeSamsaraNotes("Dogs\u200bIndy — “Buddy” 🐶")));
assert.ok(sanitizeSamsaraNotes(`${"x".repeat(600)}`).endsWith("..."));
assert.ok(!sanitizeSamsaraNotes(`${"x".repeat(600)}`).includes("…"));

// Multi-line customer notes must pass Digi fail-closed validation (no middle-dot ·).
{
  const noteRows = [
    {
      ...rows[0]!,
      stopNotes: sanitizeSamsaraNotes("1 dog(s): Indy\nPhone: (310) 555-1212\nPickup instructions: gate code 12")
    },
    rows[1]!,
    rows[2]!
  ];
  const noteCsv = buildCsv({ template: getCanonicalSamsaraTemplate(), rows: noteRows }).csv;
  const noteValidation = validateExport({
    template: getCanonicalSamsaraTemplate(),
    rows: noteRows,
    csv: noteCsv,
    operatingDate: "2026-07-26"
  });
  assert.equal(noteValidation.ok, true, JSON.stringify(noteValidation.report));
  assert.ok(noteRows[0]!.stopNotes.includes(" | "));
  assert.ok(!noteRows[0]!.stopNotes.includes("·"));
}

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
  "7/27/2026 10:30"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_3"
  }).arrival,
  "7/27/2026 10:30"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_5"
  }).arrival,
  "7/27/2026 12:00"
);
assert.equal(
  synthesizeStopSchedule({
    operatingDate: "2026-07-27",
    direction: "dropoff",
    stopIndex: 0,
    stopCount: 3,
    vanKey: "van_6"
  }).arrival,
  "7/27/2026 12:00"
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
assert.equal(normalizeSmsToE164("(310) 562-5520"), "+13105625520");
assert.equal(
  normalizeSmsToE164("Phone: (310) 562-5520 · Pickup instructions: front door code is 3647"),
  "+13105625520",
  "must not swallow gate-code digits into the phone number"
);
assert.equal(phoneDigitsE164("•••-•••-1001"), null);
assert.equal(
  extractOwnerPhoneE164(null, "1 dog(s): Annie · Phone: (310) 562-5520 · Pickup instructions: code 3647"),
  "+13105625520"
);
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

{
  const mapped = normalizeGingrReservationList({
    error: false,
    data: {
      "1001": {
        id: "1001",
        reservation_id: "1001",
        animal: { id: "55", name: "Oscar" },
        owner: {
          id: "9",
          first_name: "Sam",
          last_name: "Lee",
          address_1: "400 Main St",
          city: "Venice",
          postal: "90291",
          cell_phone: "3105551212"
        },
        reservation_type: { type: "Daycare" },
        services: [
          {
            name: "Taxi Service - Business Only",
            scheduled_at: "2026-08-10 07:30:00"
          }
        ],
        start_date: "2026-08-10",
        end_date: "2026-08-10"
      }
    }
  });
  assert.equal(mapped.length, 1);
  assert.equal(reservationHasTaxi(mapped[0]!), true);
  const row = mapGingrReservationToTaxiRow(mapped[0]!, {
    date: "2026-08-10",
    serviceRaw: "Taxi Service - Business Only"
  });
  assert.equal(row.dogName, "Oscar");
  assert.equal(row.ownerName, "Sam Lee");
  assert.equal(row.address, "400 Main St");
  assert.equal(row.city, "Venice");
  assert.equal(row.zip, "90291");
  assert.equal(row.serviceRaw, "Taxi Service - Business Only");
  assert.equal(reservationHasTaxi({ id: "2", reservation_type: { type: "Boarding" }, services: [] }), false);
}

{
  assert.equal(windowBandKey("07:00", "09:00"), "07:00-09:00");
  assert.equal(windowBandKey("07:15", "09:00"), "07:00-09:00");
  assert.equal(windowBandKey("10:30", "12:00"), "10:30-12:00");
  assert.equal(windowsOverlap("07:00", "09:00", "08:30", "10:00"), true);
  assert.equal(windowsOverlap("07:00", "09:00", "10:30", "12:00"), false);

  const homeBase = "123 ocean|santa monica|ca|90401";
  const mixed = splitItemsByServiceAndWindow([
    {
      direction: "pickup",
      reservationId: "r1",
      customerId: "c1",
      ownerFirstName: "Tony",
      ownerLastName: "Kalili",
      ownerFullName: "Tony Kalili",
      dogId: "d1",
      dogName: "Percy",
      serviceRaw: "Adventure Hikes",
      serviceCanonical: "Adventure Hike",
      addressRaw: "123 Ocean",
      addressStreet: "123 Ocean",
      addressUnit: null,
      addressCity: "Santa Monica",
      addressState: "CA",
      addressZip: "90401",
      ownerPhoneMasked: null,
      timeWindowStart: "07:00",
      timeWindowEnd: "09:00",
      dogSize: "Medium",
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: homeBase,
      validationStatus: "ok",
      validationReasons: [],
      raw: {}
    },
    {
      direction: "pickup",
      reservationId: "r2",
      customerId: "c1",
      ownerFirstName: "Tony",
      ownerLastName: "Kalili",
      ownerFullName: "Tony Kalili",
      dogId: "d1",
      dogName: "Percy",
      serviceRaw: "Group Class",
      serviceCanonical: "Group Class",
      addressRaw: "123 Ocean",
      addressStreet: "123 Ocean",
      addressUnit: null,
      addressCity: "Santa Monica",
      addressState: "CA",
      addressZip: "90401",
      ownerPhoneMasked: null,
      timeWindowStart: "10:30",
      timeWindowEnd: "12:00",
      dogSize: "Medium",
      specialNotes: null,
      driverNotes: null,
      reservationNotes: null,
      householdKey: homeBase,
      validationStatus: "ok",
      validationReasons: [],
      raw: {}
    }
  ]);
  assert.notEqual(mixed[0]?.householdKey, mixed[1]?.householdKey, "same home + different class windows must split");
  const groups = groupHouseholds(mixed);
  assert.equal(groups.length, 2, "two class windows → two stops");

  const conflicts = detectSharedDogTimingConflicts([
    {
      ...mixed[0]!,
      timeWindowStart: "11:00",
      timeWindowEnd: "12:00",
      direction: "pickup",
      reservationId: "class-b"
    },
    {
      ...mixed[0]!,
      dogId: "d1",
      direction: "dropoff",
      reservationId: "class-a",
      serviceCanonical: "Adventure Hike",
      timeWindowStart: "10:30",
      timeWindowEnd: "12:00"
    }
  ]);
  assert.ok(conflicts.length >= 1, "overlapping cross-class pickup/dropoff must warn");

  const late = {
    householdKey: "late",
    direction: "pickup" as const,
    address: "Late St",
    ownerName: "Late",
    dogCount: 1,
    items: [
      {
        ...mixed[0]!,
        householdKey: "late",
        timeWindowStart: "08:30",
        timeWindowEnd: "09:00",
        dogName: "LateDog"
      }
    ],
    coord: { lat: 34.02, lng: -118.5 }
  };
  const early = {
    householdKey: "early",
    direction: "pickup" as const,
    address: "Early St",
    ownerName: "Early",
    dogCount: 1,
    items: [
      {
        ...mixed[0]!,
        householdKey: "early",
        timeWindowStart: "07:00",
        timeWindowEnd: "07:30",
        dogName: "EarlyDog"
      }
    ],
    coord: { lat: 34.03, lng: -118.51 }
  };
  const ordered = orderStopsForTimeliness([late, early], { lat: 34.04, lng: -118.43 }, "pickup", () => 0.1);
  assert.equal(ordered[0]?.householdKey, "early", "earlier pickup deadline must come first");

  const iso = hhMmOnOperatingDateToIso("2026-08-08", "07:00");
  assert.ok(iso && iso.includes("T"), "window persists as timestamptz ISO");
  assert.equal(extractHhMmFromStored(iso), "07:00");
  assert.equal(extractHhMmFromStored("10:30"), "10:30");

  const clashStop = {
    householdKey: "b",
    direction: "pickup" as const,
    address: "B",
    ownerName: "B",
    dogCount: 1,
    items: [
      {
        ...mixed[0]!,
        dogId: "d1",
        timeWindowStart: "08:00",
        timeWindowEnd: "09:30"
      }
    ]
  };
  const existingStop = {
    householdKey: "a",
    direction: "pickup" as const,
    address: "A",
    ownerName: "A",
    dogCount: 1,
    items: [
      {
        ...mixed[0]!,
        dogId: "d1",
        timeWindowStart: "07:00",
        timeWindowEnd: "09:00"
      }
    ]
  };
  assert.ok(
    sharedDogTimingClashPenalty([existingStop], clashStop) >= 500,
    "overlapping same-dog windows must clash on one van"
  );
  assert.equal(
    sharedDogTimingClashPenalty(
      [existingStop],
      {
        ...clashStop,
        items: [
          {
            ...mixed[1]!,
            dogId: "d1",
            timeWindowStart: "10:30",
            timeWindowEnd: "12:00"
          }
        ]
      }
    ),
    0,
    "non-overlapping class windows for same dog may share a van"
  );
}

// Soft overflow: Adventure Hike HOME stops still land on a van when capacity is exhausted
{
  function hikeHousehold(name: string, street: string) {
    return {
      householdKey: `${street.toLowerCase()}|la|ca|90008::adventure-hike|07:00-09:00`,
      direction: "pickup" as const,
      address: `${street}, Los Angeles, CA 90008`,
      ownerName: name,
      dogCount: 1,
      items: [
        {
          direction: "pickup" as const,
          reservationId: `r-${name}`,
          customerId: "c",
          ownerFirstName: null,
          ownerLastName: null,
          ownerFullName: null,
          dogId: `d-${name}`,
          dogName: name,
          serviceRaw: "Adventure Hikes",
          serviceCanonical: "Adventure Hike" as const,
          addressRaw: `${street}, Los Angeles, CA 90008`,
          addressStreet: street,
          addressUnit: null,
          addressCity: "Los Angeles",
          addressState: "CA",
          addressZip: "90008",
          ownerPhoneMasked: null,
          timeWindowStart: "07:00",
          timeWindowEnd: "09:00",
          dogSize: "Medium",
          specialNotes: null,
          driverNotes: null,
          reservationNotes: null,
          householdKey: `${street.toLowerCase()}|la|ca|90008::adventure-hike|07:00-09:00`,
          validationStatus: "ok" as const,
          validationReasons: [],
          raw: { location_type: "HOME" }
        }
      ]
    };
  }

  const overflowVehicles = [
    {
      vanKey: "van_1",
      active: true,
      vehiclePool: "outing" as const,
      maxDogs: 1,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Adventure Hike"] as Array<"Adventure Hike">,
      capacityConfigured: true
    },
    {
      vanKey: "van_2",
      active: true,
      vehiclePool: "outing" as const,
      maxDogs: 1,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Adventure Hike"] as Array<"Adventure Hike">,
      capacityConfigured: true
    },
    {
      vanKey: "van_3",
      active: true,
      vehiclePool: "outing" as const,
      maxDogs: 1,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Adventure Hike", "Beach Excursion"] as Array<"Adventure Hike" | "Beach Excursion">,
      capacityConfigured: true
    },
    {
      vanKey: "van_5",
      active: true,
      vehiclePool: "club" as const,
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
        "Trainer-Led Hike" | "Group Class" | "Taxi Service"
      >,
      capacityConfigured: true
    },
    {
      vanKey: "van_6",
      active: true,
      vehiclePool: "club" as const,
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
        "Trainer-Led Hike" | "Group Class" | "Taxi Service"
      >,
      capacityConfigured: true
    }
  ];

  const overflowHouseholds = [
    hikeHousehold("FillerA", "1 Cap St"),
    hikeHousehold("FillerB", "2 Cap St"),
    hikeHousehold("FillerC", "3 Cap St"),
    hikeHousehold("Captain", "10 Trail St"),
    hikeHousehold("Luna", "11 Trail St"),
    hikeHousehold("Mattie", "12 Trail St")
  ];
  const overflowOpt = optimizeRoutes({
    direction: "pickup",
    households: overflowHouseholds,
    vehicles: overflowVehicles,
    depot: {
      name: "Hub",
      address: "2140 Westwood Blvd",
      latitude: 34.04,
      longitude: -118.43,
      timezone: "America/Los_Angeles",
      verified: true
    },
    sizeLoads: { Small: 1, Medium: 1, Large: 2, "Extra Large": 2.5, Unknown: 1, configured: true },
    seed: "overflow-hike",
    coordsByHousehold: Object.fromEntries(
      overflowHouseholds.map((h, i) => [h.householdKey, { lat: 34.01 + i * 0.01, lng: -118.4 - i * 0.01 }])
    ),
    operatingDate: "2026-08-11"
  });
  const overflowNames = overflowOpt.routes.flatMap((r) =>
    r.stops.filter((s) => s.stopKind === "customer").flatMap((s) => s.dogNames)
  );
  assert.ok(overflowNames.includes("Captain"), "Captain must land on an overflow van stop");
  assert.ok(overflowNames.includes("Luna"), "Luna must land on an overflow van stop");
  assert.ok(overflowNames.includes("Mattie"), "Mattie must land on an overflow van stop");
  assert.equal(overflowOpt.unassigned.length, 0, "capacity overflow must not leave hike dogs unassigned");
  assert.ok(
    overflowOpt.warnings.some((w) => /OVERFLOW/i.test(w)),
    "overflow placement must warn the coordinator"
  );
  assert.equal(overflowOpt.label, "needs_management_review");
}

// Locked taxi: club vans are either/or (Van 5 primary) — Van 6 must not run same day.
// When Van 5 is full, overflow stays on Van 5 (or management review) instead of spinning Van 6.
{
  const taxiStop = {
    householdKey: "5 taxi ave|santa monica|ca|90401::taxi-service|open",
    direction: "pickup" as const,
    address: "5 Taxi Ave, Santa Monica, CA 90401",
    ownerName: "Oscar",
    dogCount: 1,
    items: [
      {
        direction: "pickup" as const,
        reservationId: "taxi-oscar",
        customerId: null,
        ownerFirstName: null,
        ownerLastName: null,
        ownerFullName: null,
        dogId: null,
        dogName: "Oscar",
        serviceRaw: "Taxi",
        serviceCanonical: "Taxi Service" as const,
        addressRaw: "5 Taxi Ave, Santa Monica, CA 90401",
        addressStreet: "5 Taxi Ave",
        addressUnit: null,
        addressCity: "Santa Monica",
        addressState: "CA",
        addressZip: "90401",
        ownerPhoneMasked: null,
        timeWindowStart: null,
        timeWindowEnd: null,
        dogSize: "Unknown",
        specialNotes: null,
        driverNotes: null,
        reservationNotes: null,
        householdKey: "5 taxi ave|santa monica|ca|90401::taxi-service|open",
        validationStatus: "ok" as const,
        validationReasons: [],
        raw: { source: "manual_taxi", locked_van: "van_5", location_type: "HOME" }
      }
    ]
  };
  const filler = {
    ...taxiStop,
    householdKey: "9 other|santa monica|ca|90401::group-class|open",
    ownerName: "Osita",
    items: [
      {
        ...taxiStop.items[0]!,
        reservationId: "gc-osita",
        dogName: "Osita",
        serviceRaw: "Group Class",
        serviceCanonical: "Group Class" as const,
        householdKey: "9 other|santa monica|ca|90401::group-class|open",
        raw: { location_type: "HOME" }
      }
    ]
  };
  const lockedOpt = optimizeRoutes({
    direction: "pickup",
    households: [filler, taxiStop],
    vehicles: [
      {
        vanKey: "van_5",
        active: true,
        vehiclePool: "club" as const,
        maxDogs: 1,
        maxLoadUnits: 20,
        maxLargeDogs: 4,
        maxStops: 20,
        eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
          "Trainer-Led Hike" | "Group Class" | "Taxi Service"
        >,
        capacityConfigured: true
      },
      {
        vanKey: "van_6",
        active: true,
        vehiclePool: "club" as const,
        maxDogs: 8,
        maxLoadUnits: 20,
        maxLargeDogs: 4,
        maxStops: 20,
        eligibleServices: ["Trainer-Led Hike", "Group Class", "Taxi Service"] as Array<
          "Trainer-Led Hike" | "Group Class" | "Taxi Service"
        >,
        capacityConfigured: true
      },
      {
        vanKey: "van_1",
        active: true,
        vehiclePool: "outing" as const,
        maxDogs: 8,
        maxLoadUnits: 20,
        maxLargeDogs: 4,
        maxStops: 20,
        eligibleServices: ["Adventure Hike"] as Array<"Adventure Hike">,
        capacityConfigured: true
      }
    ],
    depot: {
      name: "Club",
      address: "1712 21st St",
      latitude: 34.02,
      longitude: -118.47,
      timezone: "America/Los_Angeles",
      verified: true
    },
    sizeLoads: { Unknown: 1, configured: true },
    seed: "locked-taxi-fallback",
    lockedVanByHousehold: {
      [taxiStop.householdKey]: "van_5"
    },
    coordsByHousehold: {
      [filler.householdKey]: { lat: 34.02, lng: -118.49 },
      [taxiStop.householdKey]: { lat: 34.03, lng: -118.48 }
    }
  });
  assert.ok(
    lockedOpt.warnings.some((w) => /mutually exclusive|Van 5 only/i.test(w)),
    "must warn that club vans are either/or"
  );
  assert.equal(
    lockedOpt.routes.some((r) => r.vanKey === "van_6"),
    false,
    "Van 6 must not receive routes when Van 5 is active"
  );
  const oscarRoute = lockedOpt.routes.find((r) =>
    r.stops.some((s) => s.stopKind === "customer" && s.dogNames.includes("Oscar"))
  );
  // Oscar may overflow onto Van 5 or remain unassigned for management review — never Van 6.
  if (oscarRoute) {
    assert.equal(oscarRoute.vanKey, "van_5");
  } else {
    assert.ok(lockedOpt.unassigned.some((u) => u.items.some((i) => i.dogName === "Oscar")));
  }
}

// Club van exclusivity: Group Class + Taxi with both vans active → only Van 5
{
  const fleet = resolveClubVanFleet([
    {
      vanKey: "van_5",
      active: true,
      vehiclePool: "club",
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Group Class", "Taxi Service"],
      capacityConfigured: true
    },
    {
      vanKey: "van_6",
      active: true,
      vehiclePool: "club",
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Group Class", "Taxi Service"],
      capacityConfigured: true
    },
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
  ]);
  assert.equal(fleet.primaryClubVan, PRIMARY_CLUB_VAN);
  assert.deepEqual(fleet.excludedClubVans, ["van_6"]);
  assert.equal(fleet.vehicles.some((v) => v.vanKey === "van_6"), false);
  assert.equal(fleet.vehicles.some((v) => v.vanKey === "van_5"), true);

  const remapped = remapClubVanLocks({
    lockedVanByHousehold: { "hh-a": "van_6", "hh-b": "van_5" },
    primaryClubVan: fleet.primaryClubVan,
    excludedClubVans: fleet.excludedClubVans
  });
  assert.equal(remapped.locks["hh-a"], "van_5");
  assert.equal(remapped.locks["hh-b"], "van_5");

  // Van 5 inactive → Van 6 becomes the day's club van
  const fallback = resolveClubVanFleet([
    {
      vanKey: "van_5",
      active: false,
      vehiclePool: "club",
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Group Class", "Taxi Service"],
      capacityConfigured: true
    },
    {
      vanKey: "van_6",
      active: true,
      vehiclePool: "club",
      maxDogs: 8,
      maxLoadUnits: 20,
      maxLargeDogs: 4,
      maxStops: 20,
      eligibleServices: ["Group Class", "Taxi Service"],
      capacityConfigured: true
    }
  ]);
  assert.equal(fallback.primaryClubVan, "van_6");
  assert.deepEqual(fallback.excludedClubVans, []);
}

assert.equal(parseRouteGenerationMode(undefined), "automatic_split");
assert.equal(parseRouteGenerationMode("automatic_split"), "automatic_split");
assert.equal(parseRouteGenerationMode("single_combined_route"), "single_combined_route");
assert.equal(parseRouteGenerationMode("nope"), "automatic_split");
assert.equal(
  buildRouteName({ date: "2026-08-11", direction: "pickup", vanDisplay: "Van 01" }),
  "2026-08-11 AM Pickup - Van 01"
);
assert.equal(
  buildRouteName({ date: "2026-08-11", direction: "pickup", vanDisplay: "Van 01", combined: true }),
  "2026-08-11 Combined AM Pickup"
);
assert.equal(
  buildRouteName({ date: "2026-08-11", direction: "dropoff", vanDisplay: "Van 05", combined: true }),
  "2026-08-11 Combined PM Drop-Off"
);

// One Big Route: same households as automatic_split, but one geographically ordered route and no capacity drop.
{
  const depot = {
    name: "Fitdog",
    address: "Depot",
    latitude: 34.01,
    longitude: -118.49,
    timezone: "America/Los_Angeles",
    verified: true
  };
  const sizeLoads = { Small: 1, Medium: 1.5, Large: 2, "Extra Large": 2.5, Unknown: 2, configured: true };
  const coords = Object.fromEntries(
    households.map((h, i) => [h.householdKey, { lat: 34.02 + i * 0.01, lng: -118.49 - i * 0.01 }])
  );
  const splitAgain = optimizeRoutes({
    direction: "pickup",
    households,
    vehicles,
    depot,
    sizeLoads,
    seed: "test-seed-1",
    coordsByHousehold: coords,
    routeGenerationMode: "automatic_split"
  });
  assert.equal(
    JSON.stringify(splitAgain.routes.map((r) => r.vanKey)),
    JSON.stringify(opt.routes.map((r) => r.vanKey)),
    "automatic_split must match default optimizer van assignment"
  );

  const combined = optimizeRoutes({
    direction: "pickup",
    households,
    vehicles,
    depot,
    sizeLoads,
    seed: "test-seed-1",
    coordsByHousehold: coords,
    routeGenerationMode: "single_combined_route"
  });
  assert.equal(combined.routes.length, 1, "combined mode must emit a single route");
  assert.equal(combined.unassigned.length, 0, "combined mode must not drop eligible households");
  assert.match(combined.routes[0]!.waveName, /ONE BIG ROUTE/);
  const combinedDogs = combined.routes[0]!.stops.flatMap((s) => s.dogNames);
  for (const group of households) {
    for (const item of group.items) {
      if (item.dogName) {
        assert.ok(combinedDogs.includes(item.dogName), `combined route missing ${item.dogName}`);
      }
    }
  }

  const tinyVan = [
    {
      vanKey: "van_1" as const,
      active: true,
      vehiclePool: "outing" as const,
      maxDogs: 1,
      maxLoadUnits: 1,
      maxLargeDogs: 1,
      maxStops: 1,
      eligibleServices: ["Adventure Hike"] as Array<"Adventure Hike">,
      capacityConfigured: true
    }
  ];
  const overCapacity = optimizeRoutes({
    direction: "pickup",
    households: households.slice(0, Math.min(3, households.length)),
    vehicles: tinyVan,
    depot,
    sizeLoads,
    seed: "combined-capacity",
    coordsByHousehold: coords,
    routeGenerationMode: "single_combined_route"
  });
  assert.equal(overCapacity.routes.length, 1);
  assert.equal(overCapacity.unassigned.length, 0, "combined mode must not omit dogs for van capacity");
  assert.equal(overCapacity.warnings.some((w) => /OVERFLOW/i.test(w)), false);

  function mixedItem(params: {
    name: string;
    service: "Adventure Hike" | "Beach Excursion" | "Trainer-Led Hike" | "Group Class" | "Taxi Service";
    street: string;
    lat: number;
    lng: number;
    facility?: boolean;
  }) {
    const householdKey = params.facility
      ? `facility:hub:${params.service.toLowerCase().replace(/\s+/g, "-")}`
      : `${params.street.toLowerCase()}|sm|ca|90401`;
    return {
      group: {
        householdKey,
        direction: "pickup" as const,
        address: params.facility ? "Fitdog Hub" : `${params.street}, Santa Monica, CA 90401`,
        ownerName: params.name,
        dogCount: 1,
        items: [
          {
            direction: "pickup" as const,
            reservationId: `r-${params.name}`,
            customerId: "c",
            ownerFirstName: null,
            ownerLastName: "Owner",
            ownerFullName: `${params.name} Owner`,
            dogId: `d-${params.name}`,
            dogName: params.name,
            serviceRaw: params.service,
            serviceCanonical: params.service,
            addressRaw: params.facility ? "Fitdog Hub" : `${params.street}, Santa Monica, CA 90401`,
            addressStreet: params.facility ? null : params.street,
            addressUnit: null,
            addressCity: "Santa Monica",
            addressState: "CA",
            addressZip: "90401",
            ownerPhoneMasked: "3105551001",
            timeWindowStart: "07:00",
            timeWindowEnd: "09:00",
            dogSize: "Medium",
            specialNotes: null,
            driverNotes: null,
            reservationNotes: null,
            householdKey,
            validationStatus: "ok" as const,
            validationReasons: [],
            raw: { phone: "3105551001", location_type: params.facility ? "FACILITY" : "HOME" }
          }
        ]
      },
      coord: { lat: params.lat, lng: params.lng }
    };
  }

  const near = mixedItem({
    name: "NearDog",
    service: "Group Class",
    street: "100 Ocean Ave",
    lat: 34.046,
    lng: -118.434
  });
  const far = mixedItem({
    name: "FarDog",
    service: "Adventure Hike",
    street: "9000 Sunset Blvd",
    lat: 33.72,
    lng: -117.84
  });
  const taxi = mixedItem({
    name: "TaxiDog",
    service: "Taxi Service",
    street: "200 Main St",
    lat: 34.05,
    lng: -118.45
  });
  const beach = mixedItem({
    name: "BeachDog",
    service: "Beach Excursion",
    street: "50 PCH",
    lat: 34.04,
    lng: -118.5
  });
  const hike = mixedItem({
    name: "HikeDog",
    service: "Trainer-Led Hike",
    street: "12 Palisades Dr",
    lat: 34.048,
    lng: -118.46
  });
  const facility = mixedItem({
    name: "HubDog",
    service: "Adventure Hike",
    street: "Fitdog Hub",
    lat: 34.0447,
    lng: -118.4323,
    facility: true
  });
  const mixedGroups = [far, near, taxi, beach, hike, facility];
  const mixedCombined = optimizeRoutes({
    direction: "pickup",
    households: mixedGroups.map((row) => row.group),
    vehicles,
    depot,
    sizeLoads,
    seed: "combined-geo",
    coordsByHousehold: Object.fromEntries(mixedGroups.map((row) => [row.group.householdKey, row.coord])),
    routeGenerationMode: "single_combined_route"
  });
  assert.equal(mixedCombined.routes.length, 1);
  assert.equal(mixedCombined.unassigned.length, 0);
  const customerOrder = mixedCombined.routes[0]!.stops
    .filter((s) => s.stopKind === "customer" && !String(s.householdKey || "").startsWith("facility:"))
    .map((s) => s.dogNames[0]);
  assert.ok(customerOrder.includes("NearDog") && customerOrder.includes("FarDog"));
  assert.ok(
    customerOrder.indexOf("NearDog") < customerOrder.indexOf("FarDog"),
    `combined geographic order should visit NearDog before FarDog, got ${customerOrder.join(" -> ")}`
  );
  assert.notEqual(customerOrder[0], "FarDog", "combined route must not start with the farthest stop");
  const hubStop = mixedCombined.routes[0]!.stops.find((s) => s.dogNames.includes("HubDog"));
  assert.ok(hubStop);
  assert.match(String(hubStop!.notes), /facility stop/i, "Fitdog-to-Fitdog must stay a facility stop, not a home stop");
  const homeStop = mixedCombined.routes[0]!.stops.find((s) => s.dogNames.includes("NearDog"));
  assert.ok(homeStop);
  assert.equal(/facility stop/i.test(String(homeStop!.notes)), false, "home pickup must not become a facility stop");
  assert.equal(
    mixedCombined.warnings.some((w) => /mutually exclusive/i.test(w)),
    false,
    "combined mode must not apply club van either/or splitting"
  );

  const combinedCsvRows = mixedCombined.routes[0]!.stops.map((stop, index) => ({
    routeName: buildRouteName({
      date: "2026-08-11",
      direction: "pickup" as const,
      vanDisplay: "Van 01",
      combined: true
    }),
    routeNotes: "ONE BIG ROUTE",
    vehicleName: "Van 01",
    driverName: "",
    stopName: stop.ownerName || stop.stopKind,
    stopNotes: sanitizeSamsaraNotes((stop.notes || "stop").replace(/\n/g, " | ")),
    stopAddress: stop.address || "123 Ocean Ave, Santa Monica, CA 90401",
    scheduledArrival: `8/11/2026 ${7 + index}:00`,
    scheduledDeparture: `8/11/2026 ${7 + index}:05`,
    routeDate: "2026-08-11",
    stopOrder: stop.sequence,
    latitude: String(stop.latitude ?? 34.01),
    longitude: String(stop.longitude ?? -118.49)
  }));
  const combinedBuilt = buildCsv({
    template: { headers: templateHeaders, delimiter: ",", encoding: "utf-8", mappings },
    rows: combinedCsvRows
  });
  const combinedValidation = validateExport({
    template: { headers: templateHeaders, delimiter: ",", encoding: "utf-8", mappings },
    rows: combinedCsvRows,
    csv: combinedBuilt.csv,
    operatingDate: "2026-08-11"
  });
  assert.equal(
    combinedValidation.ok,
    true,
    `combined Samsara CSV must validate: ${JSON.stringify(combinedValidation.report.errors)}`
  );
  assert.ok(combinedBuilt.csv.startsWith(SAMSARA_BULK_UPLOAD_HEADERS.join(",")));
  assert.ok(combinedBuilt.csv.includes("2026-08-11 Combined AM Pickup"));
  assert.equal(new Set(combinedCsvRows.map((row) => row.routeName)).size, 1);

  const dropoffCombined = optimizeRoutes({
    direction: "dropoff",
    households: mixedGroups.map((row) => ({ ...row.group, direction: "dropoff" as const })),
    vehicles,
    depot,
    sizeLoads,
    seed: "combined-dropoff",
    coordsByHousehold: Object.fromEntries(mixedGroups.map((row) => [row.group.householdKey, row.coord])),
    routeGenerationMode: "single_combined_route"
  });
  assert.equal(dropoffCombined.routes.length, 1);
  assert.match(dropoffCombined.routes[0]!.waveName, /ONE BIG ROUTE/);

  const amName = buildRouteName({
    date: "2026-08-11",
    direction: "pickup",
    vanDisplay: "Van 01",
    combined: true
  });
  const pmName = buildRouteName({
    date: "2026-08-11",
    direction: "dropoff",
    vanDisplay: "Van 01",
    combined: true
  });
  const twoWaveRows = [
    { ...combinedCsvRows[0]!, routeName: amName },
    {
      ...combinedCsvRows[0]!,
      routeName: pmName,
      stopName: "PM Depot"
    }
  ];
  const splitFiles = splitCombinedExportRows(twoWaveRows);
  assert.equal(splitFiles.pickup.length, 1);
  assert.equal(splitFiles.dropoff.length, 1);
  assert.equal(splitFiles.pickup[0]?.routeName, "2026-08-11 Combined AM Pickup");
  assert.equal(splitFiles.dropoff[0]?.routeName, "2026-08-11 Combined PM Drop-Off");
  assert.equal(
    combinedExportFileName({ operatingDate: "2026-08-11", direction: "pickup", stamp: "1809" }),
    "fitdog-big-route-am-pickup-2026-08-11-1809.csv"
  );
  assert.equal(
    combinedExportFileName({ operatingDate: "2026-08-11", direction: "dropoff", stamp: "1809" }),
    "fitdog-big-route-pm-dropoff-2026-08-11-1809.csv"
  );
}

console.log("route-generator tests: ok");
