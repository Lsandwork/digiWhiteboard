/**
 * Gingr Route Generator unit tests — activity matching, normalize, cache/inflight.
 * Run: npx tsx scripts/test-gingr-route-generator.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import {
  GINGR_ROUTE_ACTIVITIES,
  isDropOffService,
  isPickUpService,
  matchGingrRouteActivity
} from "../lib/gingr-route-generator/activities";
import { classifyTransportationText } from "../lib/gingr-route-generator/transportation";
import { buildTransportationStops } from "../lib/gingr-route-generator/transportation-stops";
import {
  invalidateGingrRouteCache,
  readGingrRouteCache,
  withGingrRouteInflight,
  writeGingrRouteCache
} from "../lib/gingr-route-generator/cache";
import { normalizeGingrRouteReservations } from "../lib/gingr-route-generator/normalize";
import { todayPacificDateKey } from "../lib/gingr-route-generator/service";
import {
  appendAuthenticatedGlobalRoutes,
  GINGR_ROUTE_GENERATOR_NAV_ROUTE
} from "../lib/admin/nav-groups";
import { SUPER_ADMIN_HUBS } from "../lib/admin/super-admin-nav";
import { filterHubDefinition } from "../lib/admin/role-hub-nav";

// --- Activity matching ---
assert.equal(matchGingrRouteActivity("Adventure Hike")?.id, "adventure_hike");
assert.equal(matchGingrRouteActivity("Beach Excursions")?.id, "beach_excursion");
assert.equal(matchGingrRouteActivity("Fun & Fit Agility")?.id, "fun_and_fit_agility");
assert.equal(matchGingrRouteActivity("Foundations and Focus")?.id, "foundations_and_focus");
assert.equal(matchGingrRouteActivity("Scent Work")?.id, "scent_works");
assert.equal(matchGingrRouteActivity("Daycare Full Day")?.id, "club");
assert.equal(matchGingrRouteActivity(""), null);

assert.equal(isPickUpService("Pick Up - Adventure Hike"), true);
assert.equal(isPickUpService("Door to Door Taxi"), true);
assert.equal(isPickUpService("Owner Pick Up"), false);
assert.equal(isPickUpService("Owner Drop Off"), false);
assert.equal(isDropOffService("Drop Off After Hike"), true);
assert.equal(isDropOffService("Owner Drop Off"), false);
assert.equal(isDropOffService("Pick Up"), false);
assert.equal(isDropOffService("Adventure Hike"), false);

assert.equal(matchGingrRouteActivity("Sport Sign Ups")?.id, "sport_sign_ups");
assert.equal(matchGingrRouteActivity("Foundational Obedience | Group Training")?.id, "foundational_obedience");
assert.equal(matchGingrRouteActivity("Trainer Led Hike | Group Training")?.id, "trainer_led_hike");
assert.equal(matchGingrRouteActivity("Urban Recall | Group Training")?.id, "urban_recall");
assert.equal(matchGingrRouteActivity("Trail Foundations | Group Training")?.id, "trail_foundations");
assert.equal(matchGingrRouteActivity("Daycare Full Day")?.id, "club");

assert.equal(GINGR_ROUTE_ACTIVITIES.length, 17);

// --- Normalize fixtures ---
function reservation(partial: Record<string, unknown>): GingrReservation {
  return partial as GingrReservation;
}

const date = "2026-08-31";

const hikeReservation = reservation({
  id: "1001",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Adventure Hike",
  start_date: `${date}T09:00:00`,
  services: [{ name: "Adventure Hike", scheduled_at: `${date}T09:00:00` }]
});

const pickupReservation = reservation({
  id: "1002",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Pick Up",
  services: [{ name: "Pick Up - Adventure Hike" }]
});

const beachReservation = reservation({
  id: "2001",
  animal_id: 77,
  a_name: "Mochi",
  a_o_first_name: "Alex",
  a_o_last_name: "Lee",
  type: "Beach Excursion",
  services: [{ name: "Beach Excursion", scheduled_at: `${date}T10:30:00` }]
});

const dropoffReservation = reservation({
  id: "2002",
  animal_id: 77,
  a_name: "Mochi",
  a_o_first_name: "Alex",
  a_o_last_name: "Lee",
  type: "Drop Off",
  services: [{ name: "Drop Off After Beach Excursion" }]
});

const daycareReservation = reservation({
  id: "3001",
  animal_id: 99,
  a_name: "Rex",
  a_o_first_name: "Sam",
  a_o_last_name: "Taylor",
  type: "Daycare Full Day",
  services: [{ name: "Daycare Full Day" }]
});

const duplicateHike = reservation({
  id: "1003",
  animal_id: 42,
  a_name: "Biscuit",
  a_o_first_name: "Jane",
  a_o_last_name: "Smith",
  type: "Adventure Hike",
  services: [{ name: "Adventure Hike" }]
});

const merged = normalizeGingrRouteReservations(
  [hikeReservation, pickupReservation, beachReservation, dropoffReservation, daycareReservation, duplicateHike],
  date
);

assert.equal(merged.dogs.length, 3, "eligible dogs — hike, beach, and club daycare; same animal merged");
const biscuit = merged.dogs.find((d) => d.name === "Biscuit");
const mochi = merged.dogs.find((d) => d.name === "Mochi");
const rex = merged.dogs.find((d) => d.name === "Rex");
assert.ok(biscuit, "Biscuit should be present");
assert.ok(mochi, "Mochi should be present");
assert.ok(rex, "daycare Club appointment is included");
assert.equal(rex!.pickup, false, "daycare without transport addon is not a Fitdog home pickup");
assert.equal(rex!.dropoff, false);
assert.ok(rex!.activities.includes("club"));
assert.equal(biscuit!.pickup, true, "pickup merges onto activity dog");
assert.equal(mochi!.dropoff, true, "dropoff merges onto activity dog");
assert.equal(biscuit!.activities.length, 1, "no duplicate activity ids");
assert.equal(biscuit!.activities[0], "adventure_hike");
assert.equal(mochi!.activities[0], "beach_excursion");

assert.equal(merged.stats.dogsScheduled, 3);
assert.equal(merged.stats.adventureHike, 1);
assert.equal(merged.stats.beachExcursion, 1);
assert.equal(merged.stats.transportationRequired, 2);

// Client-visible notes + booking comments → Pick Up Instructions
const notesReservation = reservation({
  id: "4001",
  animal_id: 55,
  a_name: "Pepper",
  a_o_first_name: "Kim",
  a_o_last_name: "Nguyen",
  type: "Canine Fitness",
  notes: { reservation_notes: "Client note: soft mouth" },
  r_comments: "Gate code 9988 — leave in side yard",
  services: [{ name: "Canine Fitness" }, { name: "Pick Up" }]
});
const notesMerged = normalizeGingrRouteReservations([notesReservation], date);
const pepper = notesMerged.dogs.find((d) => d.name === "Pepper");
assert.ok(pepper, "Pepper should be present");
assert.equal(pepper!.notes, "Client note: soft mouth");
assert.equal(pepper!.pickupInstructions, "Gate code 9988 — leave in side yard");
assert.ok(pepper!.activityLabels.includes("Canine Fitness"));

function ownerHome() {
  return {
    address_1: "123 Main St",
    city: "Santa Monica",
    state: "CA",
    postal: "90401",
    first_name: "Avery",
    last_name: "Stone"
  };
}

{
  assert.equal(classifyTransportationText("Fitdog Pickup"), "FITDOG_HOME_PICKUP");
  assert.equal(classifyTransportationText("Owner Drop Off"), "OWNER_CLUB_DROPOFF");
  assert.equal(classifyTransportationText("Owner Drop-Off"), "OWNER_CLUB_DROPOFF");
  assert.equal(classifyTransportationText("Fitdog Drop Off"), "FITDOG_HOME_DROPOFF");
  assert.equal(classifyTransportationText("Owner Pickup"), "OWNER_CLUB_PICKUP");
  assert.equal(classifyTransportationText("Door to Door Taxi"), "TAXI");
  assert.equal(classifyTransportationText(null), "UNKNOWN");
  assert.equal(classifyTransportationText(undefined), "UNKNOWN");
  assert.equal(classifyTransportationText(""), "UNKNOWN");
  assert.equal(classifyTransportationText("Unexpected Gingr Addon"), "UNKNOWN");
  assert.equal(classifyTransportationText({ weird: true }), "UNKNOWN");
  assert.equal(classifyTransportationText(["Owner Drop Off"]), "OWNER_CLUB_DROPOFF");
  assert.equal(classifyTransportationText({ name: "Owner Pick Up" }), "OWNER_CLUB_PICKUP");
}

{
  const juno = normalizeGingrRouteReservations(
    [
      reservation({
        id: "juno-1",
        animal_id: 901,
        a_name: "Juno",
        a_o_first_name: "Avery",
        a_o_last_name: "Stone",
        type: "Foundational Obedience | Group Training",
        addons: [{ name: "Owner Drop Off" }, { name: "Owner Pickup" }],
        services: [{ name: "Foundational Obedience | Group Training" }, { name: "Pick Up" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs.find((d) => d.name === "Juno");
  assert.ok(juno);
  assert.equal(juno!.pickup, false, "Juno owner drop-off is not a Fitdog home pickup");
  assert.equal(juno!.dropoff, false, "Juno owner pickup is not a Fitdog home drop-off");
  assert.equal(juno!.ownerClubDropoff, true);
  assert.equal(juno!.ownerClubPickup, true);
  assert.ok(juno!.transportationTypes.includes("OWNER_CLUB_DROPOFF"));
  assert.ok(!juno!.transportationTypes.includes("FITDOG_HOME_PICKUP"));
  const stops = buildTransportationStops([juno!], date);
  assert.equal(stops.stops.length, 0, "Juno home address must not enter the Fitdog pickup route");
}

{
  const modes: Array<[string, string, keyof typeof import("../lib/gingr-route-generator/normalize") | string]> = [
    ["Fitdog Pickup", "FITDOG_HOME_PICKUP", "pickup"],
    ["Owner Drop Off", "OWNER_CLUB_DROPOFF", "ownerClubDropoff"],
    ["Fitdog Drop Off", "FITDOG_HOME_DROPOFF", "dropoff"],
    ["Owner Pickup", "OWNER_CLUB_PICKUP", "ownerClubPickup"]
  ];
  for (const [addon, expected, flag] of modes) {
    const dog = normalizeGingrRouteReservations(
      [
        reservation({
          id: `sport-${addon}`,
          animal_id: 910,
          a_name: "Sporty",
          type: "Sport Sign Ups",
          addons: [{ name: addon }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.ok(dog, `Sport Sign Ups + ${addon}`);
    assert.ok(dog.activities.includes("sport_sign_ups"));
    assert.ok(dog.transportationTypes.includes(expected as "FITDOG_HOME_PICKUP"));
    if (flag === "pickup") {
      assert.equal(dog.pickup, true);
      assert.equal(dog.ownerClubDropoff, false);
    }
    if (flag === "ownerClubDropoff") {
      assert.equal(dog.pickup, false);
      assert.equal(dog.ownerClubDropoff, true);
    }
    if (flag === "dropoff") {
      assert.equal(dog.dropoff, true);
      assert.equal(dog.ownerClubPickup, false);
    }
    if (flag === "ownerClubPickup") {
      assert.equal(dog.dropoff, false);
      assert.equal(dog.ownerClubPickup, true);
    }
  }
}

{
  const classes = [
    "Cool Tricks | Group Training",
    "Foundational Obedience | Group Training",
    "Fun & Fit Agility | Group Training",
    "Leash Manners | Group Training",
    "Reliable Recall | Group Training",
    "Scent Work | Group Training",
    "Trail Foundations | Group Training",
    "Trainer Led Hike | Group Training",
    "Urban Recall | Group Training"
  ];
  for (const [index, className] of classes.entries()) {
    const dog = normalizeGingrRouteReservations(
      [
        reservation({
          id: `class-${index}`,
          animal_id: 1000 + index,
          a_name: `ClassDog${index}`,
          type: className,
          addons: [{ name: "Owner Drop Off" }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.ok(dog, className);
    assert.equal(dog.ownerClubDropoff, true, className);
    assert.equal(dog.pickup, false, className);
  }
}

{
  const taxi = normalizeGingrRouteReservations(
    [
      reservation({
        id: "taxi-1",
        animal_id: 777,
        a_name: "Cabo",
        type: "Taxi Service",
        services: [{ name: "Taxi" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(taxi);
  assert.equal(taxi.isTaxi, true);
  assert.equal(taxi.pickup, true);
  assert.equal(taxi.dropoff, true);
  const taxiStops = buildTransportationStops([taxi], date);
  assert.equal(taxiStops.pickupCount, 1);
  assert.equal(taxiStops.dropoffCount, 1);
}

{
  const messy = [
    reservation({ id: "m1", animal_id: 1, a_name: "NullAddon", type: "Cool Tricks | Group Training", addons: null }),
    reservation({ id: "m2", animal_id: 2, a_name: "UndefAddon", type: "Leash Manners | Group Training" }),
    reservation({ id: "m3", animal_id: 3, a_name: "EmptyAddon", type: "Scent Work | Group Training", addons: "" }),
    reservation({
      id: "m4",
      animal_id: 4,
      a_name: "WeirdAddon",
      type: "Urban Recall | Group Training",
      addons: { unexpected: "value" }
    }),
    reservation({
      id: "m5",
      animal_id: 5,
      a_name: "ArrayAddon",
      type: "Reliable Recall | Group Training",
      addons: [null, 12, { name: "Owner Drop Off" }]
    })
  ];
  const result = normalizeGingrRouteReservations(messy, date);
  assert.equal(result.dogs.length, 5);
  const arrayDog = result.dogs.find((d) => d.name === "ArrayAddon");
  assert.equal(arrayDog?.ownerClubDropoff, true);
  assert.equal(arrayDog?.pickup, false);
}

{
  const dup = normalizeGingrRouteReservations(
    [
      reservation({
        id: "dup-1",
        animal_id: 42,
        a_name: "Biscuit",
        type: "Adventure Hike",
        services: [{ name: "Pick Up - Adventure Hike" }, { name: "Pick Up" }],
        owner: ownerHome()
      })
    ],
    date
  );
  const stops = buildTransportationStops(dup.dogs, date);
  assert.equal(stops.pickupCount, 1, "duplicate pickup services still make one stop");
}

// --- todayPacificDateKey ---
assert.match(todayPacificDateKey(new Date("2026-08-31T12:00:00-07:00")), /^\d{4}-\d{2}-\d{2}$/);

// --- Cache / inflight ---
invalidateGingrRouteCache();
const cacheDate = "2026-09-01";
const samplePayload = {
  date: cacheDate,
  dogs: [],
  stats: {
    dogsScheduled: 0,
    adventureHike: 0,
    beachExcursion: 0,
    transportationRequired: 0
  },
  fetchedAt: new Date().toISOString(),
  cached: false
};

writeGingrRouteCache(cacheDate, samplePayload);
const cached = readGingrRouteCache(cacheDate);
assert.ok(cached, "cache read returns payload");
assert.equal(cached!.cached, true);
assert.equal(cached!.date, cacheDate);

let inflightCalls = 0;
void (async () => {
  const [first, second] = await Promise.all([
    withGingrRouteInflight("inflight-test", async () => {
      inflightCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { ...samplePayload, date: "inflight-test" };
    }),
    withGingrRouteInflight("inflight-test", async () => {
      inflightCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return { ...samplePayload, date: "inflight-test" };
    })
  ]);
  assert.equal(inflightCalls, 1, "concurrent inflight requests share one loader");
  assert.equal(first.date, second.date);

  // --- Navigation wiring ---
  {
    const apps = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["route_generator", "live_fleet"], {
      includeRouteGenerator: true
    });
    const labels = apps.sections.flatMap((s) => s.links.map((l) => l.label));
    assert.ok(labels.includes("Gingr Route Generator"), "Apps hub shows Gingr Route Generator with route access");
  }

  {
    const hidden = filterHubDefinition(SUPER_ADMIN_HUBS.sa_apps_hub, ["live_fleet"], {
      includeRouteGenerator: false
    });
    const labels = hidden.sections.flatMap((s) => s.links.map((l) => l.label));
    assert.ok(!labels.includes("Gingr Route Generator"), "hidden without route generator access");
  }

  const navWithRoute = appendAuthenticatedGlobalRoutes([], { includeRouteGenerator: true });
  assert.ok(
    navWithRoute.some((e) => e.type === "route" && e.id === "gingr-route-generator"),
    "sidebar Apps section includes Gingr Route Generator route leaf"
  );
  assert.equal(GINGR_ROUTE_GENERATOR_NAV_ROUTE.href, "/admin/gingr-route-generator");

  console.log("test-gingr-route-generator: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
