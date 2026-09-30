/**
 * Gingr Route Generator — Samsara CSV export tests.
 * Validates Digi production schema reuse + transportation business rules.
 *
 * Run: npx tsx scripts/test-gingr-samsara-export.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import type { GeocodeResult } from "../lib/route-generator/geocode";
import {
  SAMSARA_BULK_UPLOAD_HEADERS,
  parseCsvLine
} from "../lib/route-generator/samsara-csv";
import { normalizeGingrRouteReservations } from "../lib/gingr-route-generator/normalize";
import {
  GINGR_SAMSARA_SCHEMA_SOURCE,
  buildGingrSamsaraCsvFromStops,
  gingrDepotPlan,
  isFacilityBookendRow,
  isFacilityStopName,
  vanKeyFromSamsaraVehicleName
} from "../lib/gingr-route-generator/samsara-export";
import {
  buildTransportationStops,
  type TransportationStop
} from "../lib/gingr-route-generator/transportation-stops";

const date = "2026-08-31";

function reservation(partial: Record<string, unknown>): GingrReservation {
  return partial as GingrReservation;
}

function geoFor(address: string, lat = 34.02, lng = -118.49): GeocodeResult {
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: address,
    confidence: 1,
    provider: "cache",
    cacheHit: true
  };
}

function makeStop(
  partial: Partial<TransportationStop> &
    Pick<TransportationStop, "dogId" | "dogName" | "kind">
): TransportationStop {
  const address = partial.homeAddress ?? "123 Main St, Santa Monica, CA 90401, USA";
  const locationType =
    partial.locationType ?? (partial.destination === "club" ? "FITDOG_CLUB" : "OWNER_HOME");
  return {
    key: `${partial.date || date}|${partial.dogId}|${partial.kind}|${address}`,
    date: partial.date || date,
    dogId: partial.dogId,
    animalId: partial.animalId ?? 1,
    dogName: partial.dogName,
    ownerName: partial.ownerName ?? "Owner",
    ownerFullName: partial.ownerFullName ?? "Owner Name",
    ownerPhone: partial.ownerPhone ?? null,
    kind: partial.kind,
    destination: partial.destination ?? "home",
    locationType,
    locationLabel: partial.locationLabel ?? (locationType === "FITDOG_CLUB" ? "Fitdog Club" : "Owner Home"),
    transportOption: partial.transportOption ?? null,
    routeVanKey: partial.routeVanKey,
    activityLabels: partial.activityLabels ?? ["Adventure Hike"],
    scheduledTime: partial.scheduledTime ?? null,
    notes: partial.notes ?? null,
    homeAddress: partial.homeAddress ?? address,
    homeStreet1: partial.homeStreet1 ?? "123 Main St",
    homeStreet2: partial.homeStreet2 ?? null,
    homeCity: partial.homeCity ?? "Santa Monica",
    homeState: partial.homeState ?? "CA",
    homePostalCode: partial.homePostalCode ?? "90401",
    addressStatus: partial.addressStatus ?? "ok"
  };
}

function customerRows(rows: Array<{ stopName: string; stopNotes?: string }>) {
  return rows.filter((r) => !isFacilityBookendRow(r));
}

function ownerWithAddress(extra?: Record<string, unknown>) {
  return {
    address_1: "123 Main St",
    city: "Santa Monica",
    state: "CA",
    postal: "90401",
    first_name: "Sarah",
    last_name: "Miller",
    ...extra
  };
}

// Exact Digi production headers (source of truth for FitDog Samsara upload)
assert.deepEqual([...SAMSARA_BULK_UPLOAD_HEADERS], [
  "Route Name",
  "Assigned Driver Username",
  "Assigned Vehicle Name",
  "Stop Name",
  "Stop Arrival Time",
  "Stop Departure Time",
  "Stop Notes",
  "Address Name",
  "Latitude",
  "Longitude",
  "Full Address"
]);
assert.ok(GINGR_SAMSARA_SCHEMA_SOURCE.includes("SAMSARA_BULK_UPLOAD_HEADERS"));

// 1) Pick Up only → one home transportation stop
{
  const stops = [makeStop({ dogId: "a", dogName: "Luna", kind: "PICK_UP" })];
  const geocoded = new Map([[stops[0]!.homeAddress!, geoFor(stops[0]!.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(built.validation.ok, true);
  const customer = customerRows(built.rows);
  assert.equal(customer.length, 1);
  assert.match(customer[0]!.stopName, /PICK UP FROM HOME/);
}

// 2) Drop Off only → one home transportation stop
{
  const stops = [makeStop({ dogId: "b", dogName: "Molly", kind: "DROP_OFF" })];
  const geocoded = new Map([[stops[0]!.homeAddress!, geoFor(stops[0]!.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(built.validation.ok, true);
  const customer = customerRows(built.rows);
  assert.equal(customer.length, 1);
  assert.match(customer[0]!.stopName, /DROP OFF TO HOME/);
}

// 3) Pick Up + Drop Off → two transportation stops
{
  const address = "123 Main St, Santa Monica, CA 90401, USA";
  const stops = [
    makeStop({ dogId: "c", dogName: "Charlie", kind: "PICK_UP", homeAddress: address }),
    makeStop({ dogId: "c", dogName: "Charlie", kind: "DROP_OFF", homeAddress: address })
  ];
  const geocoded = new Map([[address, geoFor(address)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(customerRows(built.rows).length, 2);
}

// 4) No Pick Up / No Drop Off → zero stops
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "5001",
        animal_id: 501,
        a_name: "Cooper",
        a_o_first_name: "Sam",
        a_o_last_name: "Taylor",
        type: "Adventure Hike",
        services: [{ name: "Adventure Hike" }],
        owner: ownerWithAddress({ first_name: "Sam", last_name: "Taylor" })
      })
    ],
    date
  ).dogs;
  const built = buildTransportationStops(dogs, date);
  assert.equal(built.stops.length, 0, "no travel addon means no van stop");
}

// 5) Multiple activities + one Pick Up → no duplicate Pick Up
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "6001",
        animal_id: 601,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Adventure Hike",
        services: [{ name: "Adventure Hike" }],
        owner: ownerWithAddress()
      }),
      reservation({
        id: "6002",
        animal_id: 601,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Beach Excursion",
        addons: [{ name: "Fitdog to Pick Up @ Home" }],
        services: [{ name: "Beach Excursion" }],
        owner: ownerWithAddress()
      })
    ],
    date
  ).dogs;
  const built = buildTransportationStops(dogs, date);
  assert.equal(built.pickupCount, 1);
  assert.equal(built.dropoffCount, 0);
}

// 6) Multiple activities + Pick Up + Drop Off → one each
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "7001",
        animal_id: 701,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Adventure Hike",
        addons: [{ name: "Fitdog to Pick Up @ Home" }],
        services: [{ name: "Adventure Hike" }],
        owner: ownerWithAddress()
      }),
      reservation({
        id: "7002",
        animal_id: 701,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Beach Excursion",
        addons: [{ name: "Fitdog to Drop Off @ Home" }],
        services: [{ name: "Beach Excursion" }],
        owner: ownerWithAddress()
      })
    ],
    date
  ).dogs;
  const built = buildTransportationStops(dogs, date);
  assert.equal(built.pickupCount, 1);
  assert.equal(built.dropoffCount, 1);
  assert.equal(built.exportable.length, 2);
}

// 7) Missing address → excluded and flagged
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "8001",
        animal_id: 801,
        a_name: "Molly",
        a_o_first_name: "Pat",
        a_o_last_name: "Nguyen",
        type: "Adventure Hike",
        addons: [{ name: "Fitdog to Drop Off @ Home" }],
        services: [{ name: "Adventure Hike" }],
        owner: { first_name: "Pat", last_name: "Nguyen" }
      })
    ],
    date
  ).dogs;
  const built = buildTransportationStops(dogs, date);
  assert.equal(built.exportable.filter((s) => s.destination === "home").length, 0);
  assert.ok(built.missingAddress.some((s) => s.destination === "home"));
  assert.equal(dogs[0]!.addressStatus, "missing");
}

// 8) Address containing commas → valid CSV escaping
{
  const address = '456 Oak, Unit 2, "Santa Monica", CA 90401, USA';
  const stops = [makeStop({ dogId: "d", dogName: "Rex", kind: "PICK_UP", homeAddress: address })];
  const geocoded = new Map([[address, geoFor(address)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(built.validation.ok, true);
  assert.match(built.csv, /""Santa Monica""/);
}

// 9) Owner name containing quotes → valid CSV escaping
{
  const stops = [
    makeStop({
      dogId: "e",
      dogName: "Biscuit",
      kind: "PICK_UP",
      ownerName: 'Jane "JJ" Smith'
    })
  ];
  const geocoded = new Map([[stops[0]!.homeAddress!, geoFor(stops[0]!.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(built.validation.ok, true);
  assert.match(built.csv, /Jane ""JJ"" Smith/);
}

// 10) Duplicate Gingr records → no duplicate Samsara stops
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "9001",
        animal_id: 901,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Adventure Hike",
        addons: [{ name: "Fitdog to Pick Up @ Home" }],
        services: [{ name: "Adventure Hike" }],
        owner: ownerWithAddress()
      }),
      reservation({
        id: "9002",
        animal_id: 901,
        a_name: "Charlie",
        a_o_first_name: "Sarah",
        a_o_last_name: "Miller",
        type: "Adventure Hike",
        addons: [{ name: "Fitdog to Pick Up @ Home" }],
        services: [{ name: "Adventure Hike" }],
        owner: ownerWithAddress()
      })
    ],
    date
  ).dogs;
  const built = buildTransportationStops(dogs, date);
  assert.equal(built.stops.length, 1);
  assert.equal(built.pickupCount, 1);
  assert.equal(built.dropoffCount, 0);
}

// 11 + 12) Exact header row + column ordering in generated CSV
{
  const stops = [makeStop({ dogId: "h", dogName: "HeaderDog", kind: "PICK_UP" })];
  const geocoded = new Map([[stops[0]!.homeAddress!, geoFor(stops[0]!.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  const header = built.csv.split("\r\n")[0];
  assert.equal(header, SAMSARA_BULK_UPLOAD_HEADERS.join(","));
}

// 13) CSV parser validation — generated CSV parses with exact column count
{
  const stops = [
    makeStop({
      dogId: "i",
      dogName: "ParseMe",
      kind: "PICK_UP",
      homeAddress: "1, Two Street, Santa Monica, CA 90401, USA",
      ownerName: 'Ann "A" Lee',
      notes: "Gate code 12|34"
    })
  ];
  const geocoded = new Map([[stops[0]!.homeAddress!, geoFor(stops[0]!.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded });
  assert.equal(built.validation.ok, true);
  const lines = built.csv.split("\r\n").filter(Boolean);
  for (const line of lines) {
    const cells = parseCsvLine(line);
    assert.equal(cells.length, SAMSARA_BULK_UPLOAD_HEADERS.length);
  }
  // Address Name must be blank (Digi raw lat/lng mode)
  const data = parseCsvLine(lines[1]!);
  assert.equal(data[7], "");
  // Driver username blank when assigning by vehicle
  assert.equal(data[1], "");
}


// --- Van depot bookends ---
assert.equal(vanKeyFromSamsaraVehicleName("Van 01"), "van_1");
assert.equal(vanKeyFromSamsaraVehicleName("Van 5"), "van_5");

// Van 1/2 pickups end at Kenneth Hahn; drop-offs end at Hub
assert.deepEqual(gingrDepotPlan("van_1", "pickup", date), { start: "hub", end: "kenneth_hahn" });
assert.deepEqual(gingrDepotPlan("van_1", "dropoff", date), { start: "kenneth_hahn", end: "hub" });
assert.deepEqual(gingrDepotPlan("van_2", "pickup", date), { start: "hub", end: "kenneth_hahn" });
assert.deepEqual(gingrDepotPlan("van_2", "dropoff", date), { start: "kenneth_hahn", end: "hub" });

// Van 3: Mon/Wed/Fri → Huntington; Tue/Thu → Kenneth Hahn
assert.deepEqual(gingrDepotPlan("van_3", "pickup", "2026-08-31"), {
  start: "hub",
  end: "huntington"
}); // Monday
assert.deepEqual(gingrDepotPlan("van_3", "pickup", "2026-09-02"), {
  start: "hub",
  end: "huntington"
}); // Wednesday
assert.deepEqual(gingrDepotPlan("van_3", "pickup", "2026-09-04"), {
  start: "hub",
  end: "huntington"
}); // Friday
assert.deepEqual(gingrDepotPlan("van_3", "pickup", "2026-09-01"), {
  start: "hub",
  end: "kenneth_hahn"
}); // Tuesday
assert.deepEqual(gingrDepotPlan("van_3", "dropoff", "2026-08-31"), {
  start: "huntington",
  end: "hub"
});

assert.deepEqual(gingrDepotPlan("van_5", "pickup"), { start: "club", end: "club" });
assert.deepEqual(gingrDepotPlan("van_5", "dropoff"), { start: "club", end: "club" });
assert.deepEqual(gingrDepotPlan("van_6", "pickup"), { start: "club", end: "club" });
assert.deepEqual(gingrDepotPlan("van_6", "dropoff"), { start: "club", end: "club" });

{
  const address = "123 Main St, Santa Monica, CA 90401, USA";
  const stops = [
    makeStop({ dogId: "v", dogName: "Charlie", kind: "PICK_UP", homeAddress: address }),
    makeStop({ dogId: "v", dogName: "Charlie", kind: "DROP_OFF", homeAddress: address })
  ];
  const geocoded = new Map([[address, geoFor(address)]]);

  // Van 1/2: pickup ends Kenneth Hahn; drop-off ends Hub
  for (const van of ["Van 01", "Van 02"] as const) {
    const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded, vehicleName: van });
    assert.equal(built.validation.ok, true, van + " validation");
    const pick = built.rows.filter((r) => /Pickup|Pick-Up|Pick Up/i.test(r.routeName));
    const drop = built.rows.filter((r) => /Drop/i.test(r.routeName));
    assert.match(pick[pick.length - 1]!.stopName, /Kenneth Hahn/i, van + " pickup ends Kenneth Hahn");
    assert.ok(!pick.some((r) => /Hub/i.test(r.stopName) && pick.indexOf(r) === pick.length - 1));
    assert.match(drop[drop.length - 1]!.stopName, /Hub/i, van + " dropoff ends at Hub");
    assert.ok(!drop.some((r) => /Fitdog Club/i.test(r.stopName)), van + " dropoff must not use Club");
  }

  // Van 3 Monday (2026-08-31): pickup ends Huntington; drop-off ends Hub
  {
    const built = buildGingrSamsaraCsvFromStops({
      date: "2026-08-31",
      stops,
      geocoded,
      vehicleName: "Van 03"
    });
    assert.equal(built.validation.ok, true);
    const pick = built.rows.filter((r) => /Pickup|Pick-Up|Pick Up/i.test(r.routeName));
    const drop = built.rows.filter((r) => /Drop/i.test(r.routeName));
    assert.match(pick[pick.length - 1]!.stopName, /Huntington/i, "Van 03 Mon pickup ends Huntington");
    assert.match(drop[drop.length - 1]!.stopName, /Hub/i, "Van 03 dropoff ends Hub");
  }

  // Van 3 Tuesday: pickup ends Kenneth Hahn
  {
    const tue = "2026-09-01";
    const built = buildGingrSamsaraCsvFromStops({
      date: tue,
      stops: stops.map((s) => ({ ...s, date: tue, key: s.key.replace(date, tue) })),
      geocoded,
      vehicleName: "Van 03"
    });
    assert.equal(built.validation.ok, true);
    const pick = built.rows.filter((r) => /Pickup|Pick-Up|Pick Up/i.test(r.routeName));
    assert.match(pick[pick.length - 1]!.stopName, /Kenneth Hahn/i, "Van 03 Tue pickup ends Kenneth Hahn");
  }

  // Van 5/6 always start and end at Club
  for (const van of ["Van 05", "Van 06"] as const) {
    const built = buildGingrSamsaraCsvFromStops({ date, stops, geocoded, vehicleName: van });
    assert.equal(built.validation.ok, true, van + " validation");
    const pick = built.rows.filter((r) => /Pickup|Pick-Up|Pick Up/i.test(r.routeName));
    const drop = built.rows.filter((r) => /Drop/i.test(r.routeName));
    assert.match(pick[0]!.stopName, /Fitdog Club/i, van + " pickup starts Club");
    assert.match(pick[pick.length - 1]!.stopName, /Fitdog Club/i, van + " pickup ends Club");
    assert.match(drop[0]!.stopName, /Fitdog Club/i, van + " dropoff starts Club");
    assert.match(drop[drop.length - 1]!.stopName, /Fitdog Club/i, van + " dropoff ends Club");
    assert.ok(!drop.some((r) => /Hub/i.test(r.stopName)), van + " must not visit Hub");
  }
}


{
  const pickup = makeStop({
    dogId: "dog-sms",
    dogName: "Jasper",
    ownerName: "Ada",
    ownerPhone: "3105550100",
    kind: "PICK_UP"
  });
  const dropoff = makeStop({
    dogId: "dog-sms",
    dogName: "Jasper",
    ownerName: "Ada",
    ownerPhone: "3105550100",
    kind: "DROP_OFF"
  });
  const geocoded = new Map([[pickup.homeAddress!, geoFor(pickup.homeAddress!)]]);
  const built = buildGingrSamsaraCsvFromStops({
    date,
    stops: [pickup, dropoff],
    geocoded,
    vehicleName: "Van 01"
  });
  assert.equal(built.pickupTrackingStops.length, 1);
  assert.equal(built.pickupTrackingStops[0]?.dogName, "Jasper");
  assert.equal(built.pickupTrackingStops[0]?.ownerPhone, "3105550100");
}

{
  const far = makeStop({
    dogId: "far",
    dogName: "FarDog",
    kind: "PICK_UP",
    homeAddress: "1000 E 1st St, Los Angeles, CA 90012, USA",
    homeStreet1: "1000 E 1st St",
    homeCity: "Los Angeles",
    homePostalCode: "90012"
  });
  const near = makeStop({
    dogId: "near",
    dogName: "NearDog",
    kind: "PICK_UP",
    homeAddress: "200 Main St, Santa Monica, CA 90401, USA",
    homeStreet1: "200 Main St",
    homeCity: "Santa Monica",
    homePostalCode: "90401"
  });
  const geocoded = new Map([
    [far.homeAddress!, geoFor(far.homeAddress!, 34.05, -118.24)],
    [near.homeAddress!, geoFor(near.homeAddress!, 34.02, -118.49)]
  ]);
  const built = buildGingrSamsaraCsvFromStops({
    date,
    stops: [far, near],
    geocoded,
    vehicleName: "Van 05"
  });
  const customers = built.rows.filter((r) => /Pickup/i.test(r.routeName) && !isFacilityStopName(r.stopName));
  assert.equal(customers[0]?.stopName.includes("NearDog"), true, "export orders closer Santa Monica stop first");
}

{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "club-return",
        animal_id: 880,
        a_name: "Cove",
        type: "Sport Sign Ups",
        addons: [{ name: "Owner Pick Up | Fitdog Club" }],
        services: [{ name: "Sport Sign Ups" }],
        owner: ownerWithAddress()
      })
    ],
    date
  ).dogs;
  const builtStops = buildTransportationStops(dogs, date);
  assert.equal(builtStops.stops.length, 0, "owner pick-up at club is not a Samsara van stop");
  assert.equal(dogs[0]!.ownerClubPickup, true);
  assert.equal(dogs[0]!.dropoff, false);
}

// Boarding @ Fitdog Club exports as a real Fitdog Club stop without needing a geocode.
{
  const dogs = normalizeGingrRouteReservations(
    [
      reservation({
        id: "club-boarding-hike",
        animal_id: 881,
        a_name: "Scout",
        reservation_type: { type: "Overnight: Petite Suite" },
        check_in_date: "2026-09-18T10:00:00-07:00",
        check_out_date: "2026-10-12T18:00:00-07:00",
        addons: [{ name: "Boarding @ Fitdog Club" }],
        services: [
          {
            name: "Activity | Adventure Hike",
            assigned_to: "Van 1",
            scheduled_at: `${date}T07:30:00-07:00`
          }
        ],
        owner: ownerWithAddress()
      })
    ],
    date
  ).dogs;
  const builtStops = buildTransportationStops(dogs, date);
  assert.equal(builtStops.stops.length, 2, "boarding dog on a hike gets Club pickup and Club drop-off");
  assert.equal(builtStops.missingAddress.length, 0);

  const built = buildGingrSamsaraCsvFromStops({
    date,
    stops: builtStops.stops,
    geocoded: new Map(),
    vehicleName: "Van 01"
  });
  assert.equal(built.skippedGeocode.length, 0, "Fitdog Club uses facility coordinates, not the geocoder");
  const clubRows = built.rows.filter((r) => /Fitdog Club/i.test(r.stopName) && !isFacilityBookendRow(r));
  assert.ok(clubRows.length >= 2, "both Club legs appear as customer stops");
  for (const row of clubRows) {
    assert.ok(/1712 21st St/i.test(row.stopAddress), "Club stop carries the Fitdog Club address");
    assert.equal(row.latitude, "34.02485");
    assert.equal(row.longitude, "-118.4738934");
  }
  assert.ok(
    clubRows.some((r) => /PICK UP AT FITDOG CLUB/i.test(r.stopNotes)),
    "Club pickup notes name the location"
  );
  assert.ok(
    clubRows.some((r) => /DROP OFF AT FITDOG CLUB/i.test(r.stopNotes)),
    "Club drop-off notes name the location"
  );
  assert.equal(built.pickupTrackingStops.length, 0, "no owner tracking SMS for a Club pickup");
}

console.log("test-gingr-samsara-export: all assertions passed");
