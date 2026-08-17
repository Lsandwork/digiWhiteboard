/**
 * Production regression: Fitdog drop-off stop labeling, class grouping,
 * Samsara starting-stop already-there flag, and route coverage validation.
 */
import assert from "node:assert/strict";

import { resolveDestinationFromFitdogDetail } from "@/lib/route-generator/destination";
import { annotateFacilityItems, groupHouseholdsWithFacilities } from "@/lib/route-generator/facility";
import {
  DEFAULT_FITDOG_LOCATIONS,
  FITDOG_CLUB_STOP_NAME,
  isClubFitdogLocation
} from "@/lib/route-generator/locations";
import { optimizeRoutes } from "@/lib/route-generator/optimizer";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import { reconcileTransportLegs, validateRouteCoverage } from "@/lib/route-generator/reconciliation";
import { validateRoutePlan } from "@/lib/route-generator/plan-validation";
import {
  buildCsv,
  enforceMonotonicRouteSchedule,
  getCanonicalSamsaraTemplate,
  validateExport,
  type ExportStopRow
} from "@/lib/route-generator/samsara-csv";
import { buildCustomerStopNotes } from "@/lib/route-generator/stop-notes";
import type { VehicleCapacityConfig } from "@/lib/route-generator/capacity";
import type { CanonicalService } from "@/lib/route-generator/flags";

function item(
  partial: Partial<NormalizedReportItem> & Pick<NormalizedReportItem, "direction" | "dogName">
): NormalizedReportItem {
  return {
    reservationId: partial.reservationId ?? `res-${partial.dogName}-${partial.direction}`,
    customerId: partial.customerId ?? "cust-1",
    ownerFirstName: partial.ownerFirstName ?? null,
    ownerLastName: partial.ownerLastName ?? null,
    ownerFullName: partial.ownerFullName ?? null,
    dogId: partial.dogId ?? `dog-${partial.dogName}`,
    dogName: partial.dogName,
    serviceRaw: partial.serviceRaw ?? "Adventure Hike",
    serviceCanonical: partial.serviceCanonical ?? "Adventure Hike",
    locationType: partial.locationType ?? null,
    addressRaw: partial.addressRaw ?? null,
    addressStreet: partial.addressStreet ?? null,
    addressUnit: partial.addressUnit ?? null,
    addressCity: partial.addressCity ?? null,
    addressState: partial.addressState ?? "CA",
    addressZip: partial.addressZip ?? null,
    ownerPhoneMasked: null,
    timeWindowStart: partial.timeWindowStart ?? "07:00",
    timeWindowEnd: partial.timeWindowEnd ?? "09:00",
    dogSize: partial.dogSize ?? "Medium",
    specialNotes: partial.specialNotes ?? null,
    driverNotes: partial.driverNotes ?? null,
    reservationNotes: null,
    householdKey: partial.householdKey ?? null,
    validationStatus: partial.validationStatus ?? "ok",
    validationReasons: partial.validationReasons ?? [],
    raw: (partial.raw ?? {
      location_type: partial.locationType ?? "",
      source: partial.raw?.source ?? "fitdog",
      locked_van: partial.raw?.locked_van
    }) as NormalizedReportItem["raw"],
    direction: partial.direction
  };
}

const outingVans = (maxDogs: number, extra?: Partial<VehicleCapacityConfig>[]): VehicleCapacityConfig[] => [
  {
    vanKey: "van_1",
    active: true,
    vehiclePool: "outing",
    maxDogs,
    maxLoadUnits: 40,
    maxLargeDogs: 10,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"] as CanonicalService[],
    capacityConfigured: true
  },
  {
    vanKey: "van_2",
    active: true,
    vehiclePool: "outing",
    maxDogs,
    maxLoadUnits: 40,
    maxLargeDogs: 10,
    maxStops: 20,
    eligibleServices: ["Adventure Hike", "Beach Excursion"] as CanonicalService[],
    capacityConfigured: true
  },
  ...(extra ?? [])
];

const depot = {
  name: "Fitdog Westwood Hub",
  address: DEFAULT_FITDOG_LOCATIONS.hub.address,
  latitude: DEFAULT_FITDOG_LOCATIONS.hub.latitude,
  longitude: DEFAULT_FITDOG_LOCATIONS.hub.longitude,
  timezone: "America/Los_Angeles",
  verified: true
};

const sizeLoads = {
  Small: 1,
  Medium: 1,
  Large: 1,
  "Extra Large": 1,
  Unknown: 1,
  configured: true
};

function householdFromItems(items: NormalizedReportItem[], lngOffset = 0) {
  const groups = groupHouseholdsWithFacilities(items, DEFAULT_FITDOG_LOCATIONS);
  const coords = Object.fromEntries(
    groups.map((group, index) => [
      group.householdKey,
      group.householdKey.startsWith("facility:club")
        ? { lat: DEFAULT_FITDOG_LOCATIONS.club.latitude!, lng: DEFAULT_FITDOG_LOCATIONS.club.longitude! }
        : { lat: 34.02 + index * 0.002, lng: -118.49 + lngOffset + index * 0.002 }
    ])
  );
  return { groups, coords };
}

function assignedRefsFromOpt(opt: ReturnType<typeof optimizeRoutes>) {
  return opt.routes.flatMap((route) =>
    route.stops
      .filter((stop) => stop.stopKind === "customer")
      .map((stop) => ({
        stopId: `${route.vanKey}:${route.direction}:${stop.sequence}:${stop.householdKey || stop.ownerName}`,
        routeVanKey: route.vanKey,
        routeName: `${route.waveName} ${route.vanKey}`,
        direction: route.direction,
        reservationIds: stop.reservationIds || [],
        dogIds: stop.dogIds || [],
        dogNames: stop.dogNames || [],
        householdKey: stop.householdKey,
        serviceCanonicals: stop.serviceTypes || []
      }))
  );
}

function samsaraStop(overrides: Partial<ExportStopRow> & { stopName: string; stopOrder: number }): ExportStopRow {
  return {
    routeName: "2026-08-17 AM Pickup - Van 01",
    routeNotes: "vehicleAlreadyAtFirstStop=true",
    vehicleName: "Van 01",
    driverName: "",
    stopNotes: "notes",
    stopAddress: DEFAULT_FITDOG_LOCATIONS.hub.address,
    scheduledArrival: "8/17/2026 7:00",
    scheduledDeparture: "8/17/2026 7:05",
    routeDate: "2026-08-17",
    latitude: "34.0447222",
    longitude: "-118.4323383",
    ...overrides
  };
}

// TEST 1 — Baxter Home pickup / Hike / Fitdog drop-off
{
  const pickupDest = resolveDestinationFromFitdogDetail({
    detail: { address1: "900 Oxford Ave", city: "Venice", state: "CA", zip_code: "90291", name: "Baxter Home" },
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  const dropDest = resolveDestinationFromFitdogDetail({
    detail: { name: "Fitdog Club" },
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  assert.equal(pickupDest.locationType, "HOME");
  assert.equal(dropDest.locationType, "FITDOG");

  const pickup = item({
    direction: "pickup",
    dogName: "Baxter",
    locationType: "HOME",
    addressRaw: pickupDest.formattedAddress,
    addressStreet: "900 Oxford Ave",
    addressCity: "Venice",
    addressZip: "90291",
    householdKey: "900 oxford ave|venice|ca|90291",
    raw: { location_type: "HOME" }
  });
  const dropoff = item({
    direction: "dropoff",
    dogName: "Baxter",
    locationType: "FITDOG",
    addressRaw: null,
    householdKey: null,
    raw: { location_type: "FITDOG", location_name: "Fitdog Club" }
  });

  const annotatedPickup = annotateFacilityItems([pickup], DEFAULT_FITDOG_LOCATIONS);
  const annotatedDrop = annotateFacilityItems([dropoff], DEFAULT_FITDOG_LOCATIONS);
  assert.equal(annotatedPickup[0]?.locationType, "HOME");
  assert.equal(annotatedPickup[0]?.atFacility, false);
  assert.ok(annotatedDrop[0]?.atFacility);
  assert.equal(annotatedDrop[0]?.locationType, "FITDOG");
  assert.ok(String(annotatedDrop[0]?.addressRaw).includes("1712"));

  const pickupPack = householdFromItems(annotatedPickup);
  const dropPack = householdFromItems(annotatedDrop);
  const pickupOpt = optimizeRoutes({
    direction: "pickup",
    households: pickupPack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t1-pickup",
    coordsByHousehold: pickupPack.coords,
    operatingDate: "2026-08-17"
  });
  const dropOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropPack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t1-drop",
    coordsByHousehold: dropPack.coords,
    operatingDate: "2026-08-17"
  });

  const homeStop = pickupOpt.routes.flatMap((r) => r.stops).find((s) => s.stopKind === "customer");
  assert.ok(homeStop?.ownerName?.includes("Baxter"));
  assert.ok(!/1712/.test(homeStop?.address || ""));
  const fitdogStop = dropOpt.routes.flatMap((r) => r.stops).find((s) => s.stopKind === "customer");
  assert.equal(fitdogStop?.ownerName, FITDOG_CLUB_STOP_NAME);
  assert.equal(fitdogStop?.address, DEFAULT_FITDOG_LOCATIONS.club.address);
  assert.ok(fitdogStop?.notes.includes("Baxter"));
  assert.ok(fitdogStop?.notes.includes("Dogs:"));
  assert.ok(fitdogStop?.reservationIds.includes("res-Baxter-dropoff"));
}

// TEST 2 — Atlas Fitdog → Fitdog must not be sent Home
{
  const pickup = item({
    direction: "pickup",
    dogName: "Atlas",
    locationType: "FITDOG",
    raw: { location_type: "FITDOG", location_name: "Fitdog" }
  });
  const dropoff = item({
    direction: "dropoff",
    dogName: "Atlas",
    locationType: "FITDOG",
    raw: { location_type: "FITDOG", location_name: "Fitdog Club" }
  });
  const annotated = annotateFacilityItems([pickup, dropoff], DEFAULT_FITDOG_LOCATIONS);
  assert.ok(annotated.every((row) => row.atFacility && row.locationType === "FITDOG"));
  assert.ok(annotated.every((row) => !/oxford|home/i.test(String(row.addressRaw))));
  const dropPack = householdFromItems(annotated.filter((row) => row.direction === "dropoff"));
  const dropOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropPack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t2-drop",
    coordsByHousehold: dropPack.coords,
    operatingDate: "2026-08-17"
  });
  const customer = dropOpt.routes.flatMap((r) => r.stops).find((s) => s.stopKind === "customer");
  assert.equal(customer?.ownerName, FITDOG_CLUB_STOP_NAME);
  assert.ok(customer?.dogNames.includes("Atlas"));
}

// TEST 3 — Baxter + Atlas both → Fitdog = one destination stop
{
  const dogs = ["Baxter", "Atlas"].map((name) =>
    item({
      direction: "dropoff",
      dogName: name,
      locationType: "FITDOG",
      serviceCanonical: name === "Baxter" ? "Adventure Hike" : "Beach Excursion",
      serviceRaw: name === "Baxter" ? "Adventure Hike" : "Beach Excursion",
      raw: { location_type: "FITDOG", location_name: "Fitdog Club" }
    })
  );
  const annotated = annotateFacilityItems(dogs, DEFAULT_FITDOG_LOCATIONS);
  const pack = householdFromItems(annotated);
  assert.ok(pack.groups.length >= 2, "grouping still splits by class before van assignment");
  const dropOpt = optimizeRoutes({
    direction: "dropoff",
    households: pack.groups,
    vehicles: outingVans(8).slice(0, 1),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t3-drop",
    coordsByHousehold: pack.coords,
    operatingDate: "2026-08-17"
  });
  const fitdogStops = dropOpt.routes
    .flatMap((route) => route.stops)
    .filter((stop) => stop.stopKind === "customer" && stop.ownerName === FITDOG_CLUB_STOP_NAME);
  assert.equal(fitdogStops.length, 1, "one Fitdog destination stop on the van");
  assert.ok(fitdogStops[0]?.dogNames.includes("Baxter"));
  assert.ok(fitdogStops[0]?.dogNames.includes("Atlas"));
  assert.ok(fitdogStops[0]?.notes.includes("- Baxter") || fitdogStops[0]?.notes.includes("Baxter"));
  assert.ok(fitdogStops[0]?.notes.includes("- Atlas") || fitdogStops[0]?.notes.includes("Atlas"));
}

// TEST 4 — Baxter → Fitdog, Charlie → Home must not consolidate Charlie
{
  const legs = [
    item({
      direction: "dropoff",
      dogName: "Baxter",
      locationType: "FITDOG",
      raw: { location_type: "FITDOG", location_name: "Fitdog Club" }
    }),
    item({
      direction: "dropoff",
      dogName: "Charlie",
      locationType: "HOME",
      addressRaw: "12 Trail St, Los Angeles, CA 90008",
      addressStreet: "12 Trail St",
      addressCity: "Los Angeles",
      addressZip: "90008",
      householdKey: "12 trail st|los angeles|ca|90008",
      raw: { location_type: "HOME" }
    })
  ];
  const annotated = annotateFacilityItems(legs, DEFAULT_FITDOG_LOCATIONS);
  assert.equal(annotated.find((row) => row.dogName === "Charlie")?.locationType, "HOME");
  assert.equal(annotated.find((row) => row.dogName === "Charlie")?.atFacility, false);
  const pack = householdFromItems(annotated);
  const dropOpt = optimizeRoutes({
    direction: "dropoff",
    households: pack.groups,
    vehicles: outingVans(8).slice(0, 1),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t4-drop",
    coordsByHousehold: pack.coords,
    operatingDate: "2026-08-17"
  });
  const customers = dropOpt.routes.flatMap((route) => route.stops).filter((stop) => stop.stopKind === "customer");
  const fitdog = customers.find((stop) => stop.ownerName === FITDOG_CLUB_STOP_NAME);
  const charlie = customers.find((stop) => stop.dogNames.includes("Charlie"));
  assert.ok(fitdog);
  assert.ok(fitdog?.dogNames.includes("Baxter"));
  assert.ok(!fitdog?.dogNames.includes("Charlie"));
  assert.ok(charlie);
  assert.notEqual(charlie?.ownerName, FITDOG_CLUB_STOP_NAME);
  assert.ok(!/1712/.test(charlie?.address || ""));
}

// TEST 5 — Class A vs Class B prefer staying together
{
  const classA = ["A1", "A2", "A3"].map((name, index) =>
    item({
      direction: "pickup",
      dogName: name,
      serviceCanonical: "Adventure Hike",
      serviceRaw: "Adventure Hike",
      locationType: "HOME",
      addressRaw: `${100 + index} East St, Los Angeles, CA 90008`,
      addressStreet: `${100 + index} East St`,
      addressCity: "Los Angeles",
      addressZip: "90008",
      householdKey: `${100 + index} east st|los angeles|ca|90008`,
      raw: { location_type: "HOME" }
    })
  );
  const classB = ["B1", "B2", "B3"].map((name, index) =>
    item({
      direction: "pickup",
      dogName: name,
      serviceCanonical: "Beach Excursion",
      serviceRaw: "Beach Excursion",
      locationType: "HOME",
      addressRaw: `${200 + index} West St, Santa Monica, CA 90404`,
      addressStreet: `${200 + index} West St`,
      addressCity: "Santa Monica",
      addressZip: "90404",
      householdKey: `${200 + index} west st|santa monica|ca|90404`,
      raw: { location_type: "HOME" }
    })
  );
  const pack = householdFromItems([...classA, ...classB]);
  const coords = Object.fromEntries(
    pack.groups.map((group) => {
      const beach = group.items[0]?.serviceCanonical === "Beach Excursion";
      return [group.householdKey, { lat: 34.02, lng: beach ? -118.5 : -118.38 }];
    })
  );
  const opt = optimizeRoutes({
    direction: "pickup",
    households: pack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t5-class",
    coordsByHousehold: coords,
    operatingDate: "2026-08-17"
  });
  const mixed = opt.routes.filter((route) => {
    const services = new Set(route.stops.flatMap((stop) => stop.serviceTypes));
    return services.has("Adventure Hike") && services.has("Beach Excursion");
  });
  assert.equal(mixed.length, 0, "classes should not mix onto the same van when capacity allows");
  const adventureRoute = opt.routes.find((route) => route.serviceTypes.includes("Adventure Hike"));
  const beachRoute = opt.routes.find((route) => route.serviceTypes.includes("Beach Excursion"));
  assert.ok(adventureRoute);
  assert.ok(beachRoute);
  assert.notEqual(adventureRoute?.vanKey, beachRoute?.vanKey);
}

// TEST 6 — Class A over capacity splits safely
{
  const classA = ["C1", "C2", "C3", "C4", "C5", "C6"].map((name, index) =>
    item({
      direction: "pickup",
      dogName: name,
      locationType: "HOME",
      addressRaw: `${10 + index} Cap St, Los Angeles, CA 90008`,
      addressStreet: `${10 + index} Cap St`,
      addressCity: "Los Angeles",
      addressZip: "90008",
      householdKey: `${10 + index} cap st|los angeles|ca|90008`,
      raw: { location_type: "HOME" }
    })
  );
  const pack = householdFromItems(classA);
  const opt = optimizeRoutes({
    direction: "pickup",
    households: pack.groups,
    vehicles: outingVans(3),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t6-split",
    coordsByHousehold: pack.coords,
    operatingDate: "2026-08-17"
  });
  const names = opt.routes.flatMap((route) =>
    route.stops.filter((stop) => stop.stopKind === "customer").flatMap((stop) => stop.dogNames)
  );
  assert.equal(opt.unassigned.length, 0);
  assert.equal(new Set(names).size, 6);
  assert.equal(names.length, 6, "no duplicate placements");
  assert.ok(opt.warnings.some((warning) => /CLASS SPLIT/i.test(warning)));
}

// TEST 7 — Manually-added Taxi dog is not dropped during class grouping
{
  const hikeDogs = ["H1", "H2"].map((name, index) =>
    item({
      direction: "pickup",
      dogName: name,
      locationType: "HOME",
      addressRaw: `${30 + index} Hike St, Los Angeles, CA 90008`,
      addressStreet: `${30 + index} Hike St`,
      addressCity: "Los Angeles",
      addressZip: "90008",
      householdKey: `${30 + index} hike st|los angeles|ca|90008`,
      raw: { location_type: "HOME" }
    })
  );
  const taxi = item({
    direction: "pickup",
    dogName: "Oscar",
    serviceRaw: "Taxi",
    serviceCanonical: "Taxi Service",
    locationType: "HOME",
    addressRaw: "5 Taxi Ave, Santa Monica, CA 90401",
    addressStreet: "5 Taxi Ave",
    addressCity: "Santa Monica",
    addressZip: "90401",
    householdKey: "5 taxi ave|santa monica|ca|90401",
    raw: { source: "manual", location_type: "HOME", locked_van: "van_5" }
  });
  const pack = householdFromItems([...hikeDogs, taxi]);
  const opt = optimizeRoutes({
    direction: "pickup",
    households: pack.groups,
    vehicles: [
      ...outingVans(8),
      {
        vanKey: "van_5",
        active: true,
        vehiclePool: "club",
        maxDogs: 8,
        maxLoadUnits: 20,
        maxLargeDogs: 4,
        maxStops: 20,
        eligibleServices: ["Taxi Service", "Group Class", "Trainer-Led Hike"],
        capacityConfigured: true
      }
    ],
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t7-taxi",
    coordsByHousehold: pack.coords,
    lockedVanByHousehold: { [taxi.householdKey!]: "van_5" },
    operatingDate: "2026-08-17"
  });
  const names = opt.routes.flatMap((route) =>
    route.stops.filter((stop) => stop.stopKind === "customer").flatMap((stop) => stop.dogNames)
  );
  assert.ok(names.includes("Oscar"), "manual taxi dog must remain after class grouping");
  assert.equal(opt.unassigned.length, 0);
}

// TEST 8 — Starting location omits arrival so Samsara treats the vehicle as already there
{
  const rows = [
    samsaraStop({
      stopName: "Fitdog Westwood Hub",
      stopOrder: 0,
      scheduledArrival: "",
      scheduledDeparture: "8/17/2026 7:00"
    }),
    samsaraStop({
      stopName: "Baxter",
      stopOrder: 1,
      stopAddress: "900 Oxford Ave, Venice, CA 90291",
      scheduledArrival: "8/17/2026 7:20",
      scheduledDeparture: "8/17/2026 7:25",
      latitude: "33.99",
      longitude: "-118.46"
    }),
    samsaraStop({
      stopName: "Kenneth Hahn Trail",
      stopOrder: 2,
      scheduledArrival: "8/17/2026 8:10",
      scheduledDeparture: "8/17/2026 8:15",
      latitude: "34.0122",
      longitude: "-118.3651"
    })
  ];
  const repaired = enforceMonotonicRouteSchedule(rows);
  assert.equal(rows[0]!.scheduledArrival, "", "starting stop arrival stays blank");
  assert.equal(rows[0]!.scheduledDeparture, "8/17/2026 7:00");
  assert.ok(rows[1]!.scheduledArrival.trim(), "later stops still track arrival");
  assert.equal(repaired.adjustedStops, 0);
  const template = getCanonicalSamsaraTemplate();
  const csv = buildCsv({ template, rows }).csv;
  const validation = validateExport({ template, rows, csv, operatingDate: "2026-08-17" });
  assert.equal(validation.ok, true, JSON.stringify(validation.report.errors));

  const laterBlank = [
    samsaraStop({ stopName: "Start", stopOrder: 0, scheduledArrival: "", scheduledDeparture: "8/17/2026 7:00" }),
    samsaraStop({ stopName: "Later", stopOrder: 1, scheduledArrival: "", scheduledDeparture: "8/17/2026 7:20" })
  ];
  const laterCsv = buildCsv({ template, rows: laterBlank }).csv;
  const laterValidation = validateExport({
    template,
    rows: laterBlank,
    csv: laterCsv,
    operatingDate: "2026-08-17"
  });
  assert.equal(laterValidation.ok, false);
}

// TEST 9 — All four pickup/drop-off combinations preserve destinations
{
  const combos: Array<{
    dog: string;
    pickup: "HOME" | "FITDOG";
    drop: "HOME" | "FITDOG";
  }> = [
    { dog: "HomeFitdog", pickup: "HOME", drop: "FITDOG" },
    { dog: "FitdogHome", pickup: "FITDOG", drop: "HOME" },
    { dog: "FitdogFitdog", pickup: "FITDOG", drop: "FITDOG" },
    { dog: "HomeHome", pickup: "HOME", drop: "HOME" }
  ];
  for (const combo of combos) {
    const pickup = item({
      direction: "pickup",
      dogName: combo.dog,
      locationType: combo.pickup,
      addressRaw: combo.pickup === "HOME" ? "1 Home St, Venice, CA 90291" : null,
      addressStreet: combo.pickup === "HOME" ? "1 Home St" : null,
      addressCity: combo.pickup === "HOME" ? "Venice" : null,
      addressZip: combo.pickup === "HOME" ? "90291" : null,
      householdKey: combo.pickup === "HOME" ? "1 home st|venice|ca|90291" : null,
      raw: {
        location_type: combo.pickup,
        location_name: combo.pickup === "FITDOG" ? "Fitdog Club" : "Home"
      }
    });
    const dropoff = item({
      direction: "dropoff",
      dogName: combo.dog,
      locationType: combo.drop,
      addressRaw: combo.drop === "HOME" ? "1 Home St, Venice, CA 90291" : null,
      addressStreet: combo.drop === "HOME" ? "1 Home St" : null,
      addressCity: combo.drop === "HOME" ? "Venice" : null,
      addressZip: combo.drop === "HOME" ? "90291" : null,
      householdKey: combo.drop === "HOME" ? "1 home st|venice|ca|90291" : null,
      raw: {
        location_type: combo.drop,
        location_name: combo.drop === "FITDOG" ? "Fitdog Club" : "Home"
      }
    });
    const annotated = annotateFacilityItems([pickup, dropoff], DEFAULT_FITDOG_LOCATIONS);
    const pickupRow = annotated.find((row) => row.direction === "pickup")!;
    const dropRow = annotated.find((row) => row.direction === "dropoff")!;
    assert.equal(pickupRow.locationType, combo.pickup, `${combo.dog} pickup type`);
    assert.equal(dropRow.locationType, combo.drop, `${combo.dog} drop type`);
    assert.equal(Boolean(pickupRow.atFacility), combo.pickup === "FITDOG", `${combo.dog} pickup facility`);
    assert.equal(Boolean(dropRow.atFacility), combo.drop === "FITDOG", `${combo.dog} drop facility`);
    if (combo.pickup === "HOME") assert.ok(!/1712/.test(String(pickupRow.addressRaw)));
    if (combo.drop === "HOME") assert.ok(!/1712/.test(String(dropRow.addressRaw)));
    if (combo.drop === "FITDOG") {
      assert.ok(isClubFitdogLocation({ locationType: dropRow.locationType, facilityKey: dropRow.facilityKey }));
    }
  }
}

// TEST 10 — eligible legs must equal represented legs; mismatch is a visible error
{
  const items = [
    item({
      direction: "pickup",
      dogName: "Baxter",
      locationType: "HOME",
      addressRaw: "900 Oxford Ave, Venice, CA 90291",
      reservationId: "bax-1"
    }),
    item({
      direction: "dropoff",
      dogName: "Baxter",
      locationType: "FITDOG",
      reservationId: "bax-1",
      raw: { location_type: "FITDOG", location_name: "Fitdog Club" }
    })
  ];
  const annotated = annotateFacilityItems(items, DEFAULT_FITDOG_LOCATIONS);
  const pickupPack = householdFromItems(annotated.filter((row) => row.direction === "pickup"));
  const dropPack = householdFromItems(annotated.filter((row) => row.direction === "dropoff"));
  const pickupOpt = optimizeRoutes({
    direction: "pickup",
    households: pickupPack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t10-pick",
    coordsByHousehold: pickupPack.coords,
    operatingDate: "2026-08-17"
  });
  const dropOpt = optimizeRoutes({
    direction: "dropoff",
    households: dropPack.groups,
    vehicles: outingVans(8),
    depot,
    locations: DEFAULT_FITDOG_LOCATIONS,
    sizeLoads,
    seed: "t10-drop",
    coordsByHousehold: dropPack.coords,
    operatingDate: "2026-08-17"
  });
  const assigned = [...assignedRefsFromOpt(pickupOpt), ...assignedRefsFromOpt(dropOpt)];
  const coverage = validateRouteCoverage({ items: annotated, assignedStops: assigned });
  assert.equal(coverage.ok, true);
  assert.equal(coverage.eligibleCount, coverage.representedCount);

  const missingCoverage = validateRouteCoverage({ items: annotated, assignedStops: assignedRefsFromOpt(pickupOpt) });
  assert.equal(missingCoverage.ok, false);
  assert.ok(missingCoverage.issues.some((issue) => issue.code === "eligible_dog_missing"));

  const pickupAssigned = assignedRefsFromOpt(pickupOpt);
  const duplicateCoverage = validateRouteCoverage({
    items: annotated.filter((row) => row.direction === "pickup"),
    assignedStops: [
      ...pickupAssigned,
      ...pickupAssigned.map((stop) => ({ ...stop, stopId: `${stop.stopId}:dup`, routeVanKey: "van_2" }))
    ]
  });
  assert.equal(duplicateCoverage.ok, false);
  assert.ok(duplicateCoverage.issues.some((issue) => issue.code === "duplicate_assignment"));

  const mutated = validateRouteCoverage({
    items: annotated.filter((row) => row.direction === "pickup"),
    assignedStops: assignedRefsFromOpt(pickupOpt).map((stop) => ({
      ...stop,
      serviceCanonicals: ["Taxi Service"]
    }))
  });
  assert.equal(mutated.ok, false);
  assert.ok(mutated.issues.some((issue) => issue.code === "service_mutated"));

  const reconciliation = reconcileTransportLegs({ items: annotated, assignedStops: assigned });
  const plan = validateRoutePlan({
    reconciliation,
    coverage: missingCoverage,
    stops: [
      {
        id: "s1",
        stopKind: "customer",
        ownerName: "Baxter",
        address: "900 Oxford Ave, Venice, CA 90291",
        latitude: 33.99,
        longitude: -118.46,
        locationType: "HOME"
      }
    ]
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.issues.some((issue) => issue.code === "eligible_dog_missing"));
}

{
  const notes = buildCustomerStopNotes({
    items: [
      item({ direction: "dropoff", dogName: "Baxter", locationType: "FITDOG" }),
      item({ direction: "dropoff", dogName: "Atlas", locationType: "FITDOG" })
    ],
    direction: "dropoff",
    isFacility: true,
    facilityLabel: DEFAULT_FITDOG_LOCATIONS.club.address
  });
  assert.ok(notes.startsWith("Dogs:"));
  assert.ok(notes.includes("- Baxter"));
  assert.ok(notes.includes("- Atlas"));
}

console.log("route-generator destination/class/samsara-start tests passed");
