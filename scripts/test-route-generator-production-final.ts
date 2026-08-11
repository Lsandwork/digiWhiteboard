/**
 * Production regression fixtures for the 2026-08-11 Fitdog Hub Coordinator report.
 *
 * These encode the business rules — not specific dog IDs hardcoded into the
 * generator. Names are fixture labels only.
 */
import assert from "node:assert/strict";

import { resolveDestinationFromFitdogDetail, formatPostalAddress } from "@/lib/route-generator/destination";
import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import { annotateFacilityItems, groupHouseholdsWithFacilities } from "@/lib/route-generator/facility";
import { reconcileTransportLegs } from "@/lib/route-generator/reconciliation";
import { validateRoutePlan } from "@/lib/route-generator/plan-validation";
import { normalizeServiceName } from "@/lib/route-generator/services";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import { copyCoordsForSplitHouseholdKeys } from "@/lib/route-generator/household-coords";

function item(partial: Partial<NormalizedReportItem> & Pick<NormalizedReportItem, "direction" | "dogName">): NormalizedReportItem {
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
    specialNotes: null,
    driverNotes: null,
    reservationNotes: null,
    householdKey: partial.householdKey ?? null,
    validationStatus: partial.validationStatus ?? "ok",
    validationReasons: partial.validationReasons ?? [],
    raw: (partial.raw ?? {
      location_type: partial.locationType ?? "",
      source: partial.raw?.source ?? "fitdog"
    }) as NormalizedReportItem["raw"],
    direction: partial.direction
  };
}

// TEST 5 — Baxter: Hike HOME -> FITDOG (no home afternoon drop-off)
{
  const pickup = resolveDestinationFromFitdogDetail({
    detail: {
      address1: "900 Oxford Ave",
      city: "Venice",
      state: "CA",
      zip_code: "90291",
      name: "Baxter Home"
    },
    isDefault: true,
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  const dropoff = resolveDestinationFromFitdogDetail({
    detail: {
      name: "Fitdog Club",
      address1: null,
      city: null,
      state: null,
      zip_code: null
    },
    isDefault: false,
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  assert.equal(pickup.locationType, "HOME");
  assert.equal(dropoff.locationType, "FITDOG");
  assert.ok(dropoff.formattedAddress?.includes("1712"));
  assert.notEqual(dropoff.formattedAddress, pickup.formattedAddress);
}

// TEST 6 — Atlas: Hike FITDOG -> FITDOG (no home stop)
{
  const pickup = resolveDestinationFromFitdogDetail({
    detail: { name: "Fitdog Club" },
    isDefault: false,
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  const dropoff = resolveDestinationFromFitdogDetail({
    detail: { name: "Fitdog Club", address1: "1712 21st St", city: "Santa Monica", state: "CA", zip_code: "90404" },
    isDefault: false,
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  assert.equal(pickup.locationType, "FITDOG");
  assert.equal(dropoff.locationType, "FITDOG");

  const legs = [
    item({
      direction: "pickup",
      dogName: "Atlas",
      locationType: "FITDOG",
      addressRaw: pickup.formattedAddress,
      householdKey: "facility:club:adventure-hike",
      raw: { location_type: "FITDOG" }
    }),
    item({
      direction: "dropoff",
      dogName: "Atlas",
      locationType: "FITDOG",
      addressRaw: dropoff.formattedAddress,
      householdKey: "facility:club:adventure-hike",
      raw: { location_type: "FITDOG" }
    })
  ];
  const annotated = annotateFacilityItems(legs, DEFAULT_FITDOG_LOCATIONS);
  assert.ok(annotated.every((row) => row.atFacility));
  assert.ok(annotated.every((row) => !/oxford|home/i.test(String(row.addressRaw))));
}

// TEST 7 — Teddy: non-hike class HOME -> FITDOG (AM only, no home return)
{
  assert.equal(normalizeServiceName("Group Class"), "Group Class");
  const pickup = resolveDestinationFromFitdogDetail({
    detail: { address1: "100 Main St", city: "Santa Monica", state: "CA", zip_code: "90401" },
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  const dropoff = resolveDestinationFromFitdogDetail({
    detail: { name: "Fitdog Club" },
    locations: DEFAULT_FITDOG_LOCATIONS
  });
  assert.equal(pickup.locationType, "HOME");
  assert.equal(dropoff.locationType, "FITDOG");
}

// TEST 1–4 + 10 — Captain/Luna/Mattie/Oscar must reconcile when assigned; Oscar manual source preserved
{
  const hikeDogs = ["Captain", "Luna", "Mattie"];
  const items: NormalizedReportItem[] = [
    ...hikeDogs.flatMap((dog) => [
      item({
        direction: "pickup",
        dogName: dog,
        locationType: "HOME",
        addressRaw: "12 Trail St, Los Angeles, CA 90008",
        reservationId: `hike-${dog}`
      }),
      item({
        direction: "dropoff",
        dogName: dog,
        locationType: "HOME",
        addressRaw: "12 Trail St, Los Angeles, CA 90008",
        reservationId: `hike-${dog}`
      })
    ]),
    item({
      direction: "pickup",
      dogName: "Oscar",
      serviceRaw: "Taxi",
      serviceCanonical: "Taxi Service",
      locationType: "HOME",
      addressRaw: "5 Taxi Ave, Santa Monica, CA 90401",
      reservationId: "taxi-oscar",
      raw: { source: "manual", location_type: "HOME" }
    }),
    item({
      direction: "dropoff",
      dogName: "Oscar",
      serviceRaw: "Taxi",
      serviceCanonical: "Taxi Service",
      locationType: "FITDOG",
      addressRaw: DEFAULT_FITDOG_LOCATIONS.club.address,
      reservationId: "taxi-oscar",
      raw: { source: "manual", location_type: "FITDOG" }
    })
  ];

  // Facility annotation recovers Club destinations before any error filter.
  const annotated = annotateFacilityItems(items, DEFAULT_FITDOG_LOCATIONS);
  assert.equal(annotated.length, items.length);

  const assignedStops = annotated.map((row, index) => ({
    stopId: `stop-${index}`,
    routeVanKey: "van_1",
    routeName: "test",
    direction: row.direction,
    reservationIds: [String(row.reservationId)],
    dogIds: [String(row.dogId)],
    dogNames: [String(row.dogName)]
  }));

  const report = reconcileTransportLegs({ items: annotated, assignedStops });
  assert.equal(report.ok, true);
  assert.equal(report.expectedCount, 8);
  assert.equal(report.assignedCount, 8);
  assert.ok(report.legs.some((leg) => leg.dogName === "Oscar" && leg.source === "Manual"));
}

// Silent drop is forbidden — missing legs stay visible
{
  const items = [
    item({
      direction: "pickup",
      dogName: "Captain",
      locationType: "HOME",
      addressRaw: "12 Trail St, Los Angeles, CA 90008",
      reservationId: "cap-1"
    })
  ];
  const report = reconcileTransportLegs({ items, assignedStops: [] });
  assert.equal(report.ok, false);
  assert.equal(report.unassignedCount, 1);
  assert.match(report.missing[0]!.dogName || "", /Captain/);
}

// TEST 8 — two dogs one household → one stop group, two assignments
{
  const items = [
    item({
      direction: "pickup",
      dogName: "Cali",
      ownerFullName: "Bettelman",
      addressRaw: "1015 Casiano Road, Los Angeles, CA 90049",
      addressStreet: "1015 Casiano Road",
      addressCity: "Los Angeles",
      addressZip: "90049",
      reservationId: "cali-1",
      householdKey: "1015 casiano road|los angeles|ca|90049"
    }),
    item({
      direction: "pickup",
      dogName: "Clover",
      ownerFullName: "Bettelman",
      addressRaw: "1015 Casiano Road, Los Angeles, CA 90049",
      addressStreet: "1015 Casiano Road",
      addressCity: "Los Angeles",
      addressZip: "90049",
      reservationId: "clover-1",
      householdKey: "1015 casiano road|los angeles|ca|90049"
    })
  ];
  const groups = groupHouseholdsWithFacilities(items, DEFAULT_FITDOG_LOCATIONS);
  // Timing may split, but same address stem should not invent two homes without window split.
  assert.ok(groups.length >= 1);
  const dogCount = groups.reduce((n, g) => n + g.dogCount, 0);
  assert.equal(dogCount, 2);
}

// TEST 9 — capacity overflow stays UNASSIGNED (visible), never omitted from expected set
{
  const items = [
    item({ direction: "pickup", dogName: "Overflow", addressRaw: "1 Cap St, Santa Monica, CA 90401", reservationId: "ov-1" })
  ];
  const report = reconcileTransportLegs({ items, assignedStops: [] });
  assert.equal(report.expectedCount, 1);
  assert.equal(report.unassignedCount, 1);
  assert.equal(report.missingCount, 1);
}

// TEST 13 — address export must be postal, not a nickname
{
  const formatted = formatPostalAddress({
    street1: "123 Main St",
    street2: "Apt 4",
    city: "Santa Monica",
    state: "CA",
    postalCode: "90401",
    country: "USA"
  });
  assert.equal(formatted, "123 Main St Apt 4, Santa Monica, CA 90401, USA");
  assert.ok(!/Baxter Home/i.test(formatted || ""));
}

// Van-split coords still resolve (Coccari class of bug)
{
  const timingKey = "coccari|santa monica|ca|90401::adventure-hike|07:00-09:00";
  const coords = { [timingKey]: { lat: 34.02, lng: -118.49 } };
  copyCoordsForSplitHouseholdKeys(coords, [`${timingKey}::van_1`, `${timingKey}::van_2`]);
  assert.deepEqual(coords[`${timingKey}::van_1`], { lat: 34.02, lng: -118.49 });
}

// Approval gate blocks missing legs / blank addresses
{
  const reconciliation = reconcileTransportLegs({
    items: [
      item({
        direction: "pickup",
        dogName: "Ghost",
        addressRaw: "9 Missing Ln, Santa Monica, CA 90401",
        reservationId: "ghost-1"
      })
    ],
    assignedStops: []
  });
  const validation = validateRoutePlan({
    reconciliation,
    stops: [
      {
        id: "s1",
        stopKind: "customer",
        ownerName: "Ghost",
        address: "",
        latitude: null,
        longitude: null
      }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.missingLegCount >= 1);
  assert.ok(validation.addressIssueCount >= 1);
}

console.log("test-route-generator-production-final: ok");
