/**
 * Gingr Route Generator unit tests — activity matching, normalize, cache/inflight.
 * Run: npx tsx scripts/test-gingr-route-generator.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import {
  GINGR_ROUTE_ACTIVITIES,
  dogHasClassActivity,
  isDropOffService,
  isPickUpService,
  matchGingrRouteActivity,
  primarySubjectGroup,
  sortGingrRouteActivities
} from "../lib/gingr-route-generator/activities";
import {
  classifyTransportationText,
  isInternalBoardingTaxiMarker
} from "../lib/gingr-route-generator/transportation";
import { gingrTransportDisplays } from "../lib/gingr-route-generator/transportation-display";
import { buildTransportationStops, stopDisplayName } from "../lib/gingr-route-generator/transportation-stops";
import {
  dogMatchesActivityFilter,
  groupDogsBySubject
} from "../lib/gingr-route-generator/subject-groups";
import {
  invalidateGingrRouteCache,
  readGingrRouteCache,
  withGingrRouteInflight,
  writeGingrRouteCache
} from "../lib/gingr-route-generator/cache";
import { normalizeGingrRouteReservations } from "../lib/gingr-route-generator/normalize";
import { parseGingrSendOwnerSmsParam } from "../lib/gingr-route-generator/sms-opt-in";
import { todayPacificDateKey } from "../lib/gingr-route-generator/service";
import { parseGingrUploadText } from "../lib/gingr-route-generator/import-file";
import { orderStopsByShortestPath } from "../lib/gingr-route-generator/shortest-route";
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
assert.equal(isPickUpService("Fitdog to Pick Up @ Home"), true);
assert.equal(isPickUpService("Door to Door Taxi"), true);
assert.equal(isPickUpService("Owner Pick Up"), false);
assert.equal(isPickUpService("Owner Drop Off"), false);
assert.equal(isPickUpService("Owner Drop Off | Fitdog Club"), false);
assert.equal(isPickUpService("Boarding @ Fitdog Club"), false);
assert.equal(isDropOffService("Drop Off After Hike"), true);
assert.equal(isDropOffService("Fitdog to Drop Off @ Home"), true);
assert.equal(isDropOffService("Owner Drop Off"), false);
assert.equal(isDropOffService("Owner Pick Up | Fitdog Club"), false);
assert.equal(isDropOffService("Pick Up"), false);
assert.equal(isDropOffService("Adventure Hike"), false);

assert.equal(matchGingrRouteActivity("Sport Sign Ups")?.id, "sport_sign_ups");
assert.equal(matchGingrRouteActivity("Activity with Trainer")?.id, "trainer_activity");
assert.equal(matchGingrRouteActivity("Boarding @ Fitdog Club")?.id, "club");
assert.equal(matchGingrRouteActivity("Foundational Obedience | Group Training")?.id, "foundational_obedience");
assert.equal(matchGingrRouteActivity("Trainer Led Hike | Group Training")?.id, "trainer_led_hike");
assert.equal(matchGingrRouteActivity("Urban Recall | Group Training")?.id, "urban_recall");
assert.equal(matchGingrRouteActivity("Trail Foundations | Group Training")?.id, "trail_foundations");
assert.equal(matchGingrRouteActivity("Daycare Full Day")?.id, "club");

assert.equal(GINGR_ROUTE_ACTIVITIES.length, 18);
assert.equal(matchGingrRouteActivity("Activity | Leash Manners")?.id, "leash_manners");
assert.equal(matchGingrRouteActivity("Cool Tricks | Group Training")?.id, "cool_tricks");
assert.equal(matchGingrRouteActivity("Scent Work | Group Training")?.id, "scent_works");
assert.equal(matchGingrRouteActivity("Fun & Fit Agility | Group Training")?.id, "fun_and_fit_agility");
assert.equal(primarySubjectGroup(["club", "leash_manners"]).id, "leash_manners");
assert.equal(primarySubjectGroup(["club", "leash_manners"]).label, "Leash Manners");
assert.equal(primarySubjectGroup(["club"]).id, "club");
assert.equal(sortGingrRouteActivities(["club", "leash_manners", "taxi"])[0], "leash_manners");
assert.equal(dogHasClassActivity(["club", "cool_tricks"]), true);
assert.equal(dogHasClassActivity(["club"]), false);
for (const activity of GINGR_ROUTE_ACTIVITIES) {
  if (activity.category === "class") {
    assert.equal(primarySubjectGroup(["club", activity.id]).id, activity.id, activity.id);
  }
}

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
  services: [{ name: "Adventure Hike", scheduled_at: `${date}T09:00:00` }],
  addons: [{ name: "Fitdog to Pick Up @ Home" }]
});

const beachReservation = reservation({
  id: "2001",
  animal_id: 77,
  a_name: "Mochi",
  a_o_first_name: "Alex",
  a_o_last_name: "Lee",
  type: "Beach Excursion",
  services: [{ name: "Beach Excursion", scheduled_at: `${date}T10:30:00` }],
  addons: [{ name: "Fitdog to Drop Off @ Home" }]
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
  [hikeReservation, beachReservation, daycareReservation, duplicateHike],
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
  addons: [{ name: "Fitdog to Pick Up @ Home" }],
  services: [{ name: "Canine Fitness" }]
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
  assert.equal(classifyTransportationText("Fitdog to Pick Up @ Home"), "FITDOG_HOME_PICKUP");
  assert.equal(classifyTransportationText("Fitdog to Drop Off @ Home"), "FITDOG_HOME_DROPOFF");
  assert.equal(classifyTransportationText("Owner Drop Off | Fitdog Club"), "OWNER_CLUB_DROPOFF");
  assert.equal(classifyTransportationText("Owner Pick Up | Fitdog Club"), "OWNER_CLUB_PICKUP");
  assert.equal(classifyTransportationText("Boarding @ Fitdog Club"), "BOARDING_CLUB");
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
  assert.equal(juno!.pickupDestination, "club", "Juno owner drop-off is not a Fitdog home pickup");
  assert.equal(juno!.dropoffDestination, "club", "Juno owner pickup is not a Fitdog home drop-off");
  assert.equal(juno!.ownerClubDropoff, true);
  assert.equal(juno!.ownerClubPickup, true);
  assert.ok(juno!.transportationTypes.includes("OWNER_CLUB_DROPOFF"));
  assert.ok(!juno!.transportationTypes.includes("FITDOG_HOME_PICKUP"));
  const stops = buildTransportationStops([juno!], date);
  assert.equal(juno!.returnToClub, true);
  assert.equal(stops.stops.length, 2, "Owner club dogs get Fitdog Club pickup and drop-off");
  assert.ok(stops.stops.every((s) => s.destination === "club"));
  assert.match(stops.stops[0]!.homeAddress || "", /1712 21st/);
}

{
  const modes: Array<[string, string, keyof typeof import("../lib/gingr-route-generator/normalize") | string]> = [
    ["Fitdog to Pick Up @ Home", "FITDOG_HOME_PICKUP", "pickup"],
    ["Owner Drop Off | Fitdog Club", "OWNER_CLUB_DROPOFF", "ownerClubDropoff"],
    ["Fitdog to Drop Off @ Home", "FITDOG_HOME_DROPOFF", "dropoff"],
    ["Owner Pick Up | Fitdog Club", "OWNER_CLUB_PICKUP", "ownerClubPickup"]
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
      assert.equal(dog.dropoff, false);
      assert.equal(dog.pickupDestination, "home");
      assert.equal(dog.ownerClubDropoff, false);
    }
    if (flag === "ownerClubDropoff") {
      assert.equal(dog.pickup, true);
      assert.equal(dog.dropoff, false);
      assert.equal(dog.pickupDestination, "club");
      assert.equal(dog.ownerClubDropoff, true);
    }
    if (flag === "dropoff") {
      assert.equal(dog.pickup, false);
      assert.equal(dog.dropoff, true);
      assert.equal(dog.dropoffDestination, "home");
      assert.equal(dog.ownerClubPickup, false);
    }
    if (flag === "ownerClubPickup") {
      assert.equal(dog.pickup, false);
      assert.equal(dog.dropoff, true);
      assert.equal(dog.dropoffDestination, "club");
      assert.equal(dog.ownerClubPickup, true);
      assert.equal(dog.returnToClub, true);
      const clubStops = buildTransportationStops([dog], date);
      assert.equal(clubStops.stops.length, 1);
      assert.equal(clubStops.stops[0]!.kind, "DROP_OFF");
      assert.equal(clubStops.stops[0]!.destination, "club");
    }
  }
}

{
  const home = normalizeGingrRouteReservations(
    [
      reservation({
        id: "home-1",
        animal_id: 920,
        a_name: "River",
        type: "Activity | Leash Manners",
        addons: [{ name: "Fitdog to Pick Up @ Home" }, { name: "Fitdog to Drop Off @ Home" }],
        services: [{ name: "Activity | Leash Manners" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(home);
  assert.ok(home.activities.includes("leash_manners"));
  assert.equal(home.pickup, true);
  assert.equal(home.dropoff, true);
  assert.equal(home.ownerClubDropoff, false);
  const homeStops = buildTransportationStops([home], date);
  assert.equal(homeStops.pickupCount, 1);
  assert.equal(homeStops.dropoffCount, 1);

  const club = normalizeGingrRouteReservations(
    [
      reservation({
        id: "club-1",
        animal_id: 921,
        a_name: "Cove",
        type: "Sport Sign Ups",
        addons: [
          { name: "Owner Drop Off | Fitdog Club" },
          { name: "Owner Pick Up | Fitdog Club" },
          { name: "Boarding @ Fitdog Club" }
        ],
        services: [{ name: "Sport Sign Ups" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(club);
  assert.ok(club.activities.includes("sport_sign_ups"));
  assert.equal(club.pickupDestination, "club");
  assert.equal(club.dropoffDestination, "club");
  assert.equal(club.ownerClubDropoff, true);
  assert.equal(club.ownerClubPickup, true);
  assert.equal(club.returnToClub, true);
  assert.equal(club.alreadyOnProperty, true);
  const clubStops = buildTransportationStops([club], date);
  assert.equal(clubStops.stops.length, 2);
  assert.ok(clubStops.stops.every((s) => s.destination === "club"));

  const taxi = normalizeGingrRouteReservations(
    [
      reservation({
        id: "taxi-1",
        animal_id: 922,
        a_name: "Cab",
        type: "Taxi Service",
        addons: [{ name: "Door to Door Taxi" }],
        services: [{ name: "Taxi Service" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(taxi);
  assert.ok(taxi.activities.includes("taxi"));
  assert.equal(taxi.isTaxi, true);
  assert.equal(taxi.pickup, true);
}

{
  const home = normalizeGingrRouteReservations(
    [
      reservation({
        id: "home-1",
        animal_id: 920,
        a_name: "River",
        type: "Activity | Leash Manners",
        addons: [{ name: "Fitdog to Pick Up @ Home" }, { name: "Fitdog to Drop Off @ Home" }],
        services: [{ name: "Activity | Leash Manners" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(home);
  assert.ok(home.activities.includes("leash_manners"));
  assert.equal(home.pickup, true);
  assert.equal(home.dropoff, true);
  assert.equal(home.ownerClubDropoff, false);
  const homeStops = buildTransportationStops([home], date);
  assert.equal(homeStops.pickupCount, 1);
  assert.equal(homeStops.dropoffCount, 1);

  const club = normalizeGingrRouteReservations(
    [
      reservation({
        id: "club-1",
        animal_id: 921,
        a_name: "Cove",
        type: "Sport Sign Ups",
        addons: [
          { name: "Owner Drop Off | Fitdog Club" },
          { name: "Owner Pick Up | Fitdog Club" },
          { name: "Boarding @ Fitdog Club" }
        ],
        services: [{ name: "Sport Sign Ups" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(club);
  assert.ok(club.activities.includes("sport_sign_ups"));
  assert.equal(club.pickupDestination, "club");
  assert.equal(club.dropoffDestination, "club");
  assert.equal(club.ownerClubDropoff, true);
  assert.equal(club.ownerClubPickup, true);
  assert.equal(club.returnToClub, true);
  assert.equal(club.alreadyOnProperty, true);
  const clubStops = buildTransportationStops([club], date);
  assert.equal(clubStops.stops.length, 2);
  assert.ok(clubStops.stops.every((s) => s.destination === "club"));

  const taxi = normalizeGingrRouteReservations(
    [
      reservation({
        id: "taxi-1",
        animal_id: 922,
        a_name: "Cab",
        type: "Taxi Service",
        addons: [{ name: "Door to Door Taxi" }],
        services: [{ name: "Taxi Service" }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(taxi);
  assert.ok(taxi.activities.includes("taxi"));
  assert.equal(taxi.isTaxi, true);
  assert.equal(taxi.pickup, true);
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
    assert.equal(dog.pickup, true, className);
    assert.equal(dog.pickupDestination, "club", className);
    assert.equal(dog.dropoff, false, className);
    assert.equal(buildTransportationStops([dog], date).stops.length, 1, className);
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
  assert.equal(taxi.dropoffDestination, "home", "taxi dogs get pickup and drop-off routes");
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
  assert.equal(arrayDog?.pickupDestination, "club");
}

{
  const dup = normalizeGingrRouteReservations(
    [
      reservation({
        id: "dup-1",
        animal_id: 42,
        a_name: "Biscuit",
        type: "Adventure Hike",
        addons: [{ name: "Fitdog to Pick Up @ Home" }, { name: "Fitdog to Pick Up @ Home" }],
        services: [{ name: "Adventure Hike" }],
        owner: ownerHome()
      })
    ],
    date
  );
  const stops = buildTransportationStops(dup.dogs, date);
  assert.equal(stops.pickupCount, 1, "duplicate pickup services still make one stop");
}

{
  const routeDate = "2026-09-29";
  const junoShaped = normalizeGingrRouteReservations(
    [
      reservation({
        reservation_id: "208564",
        animal_id: 6648,
        a_name: "Juno",
        a_o_first_name: "Avery",
        a_o_last_name: "Stone",
        reservation_type: { id: "12", type: "Overnight: Petite Suite" },
        start_date: "2026-09-18T07:00:00-07:00",
        end_date: "2026-10-12T18:00:00-07:00",
        check_in_date: "2026-09-18T10:31:00-07:00",
        check_out_date: null,
        owner: ownerHome(),
        services: [
          {
            id: "167597",
            name: "Taxi Service - Business Only",
            scheduled_at: "2026-09-18T07:00:00-07:00",
            scheduled_until: "2026-09-18T08:00:00-07:00",
            cost: 0,
            assigned_to: null
          },
          {
            id: "169355",
            name: "Activity | Leash Manners",
            scheduled_at: "2026-09-29T00:00:00-07:00",
            scheduled_until: "2026-09-29T00:30:00-07:00",
            cost: 0,
            assigned_to: "Ivonne Campuzano"
          },
          {
            id: "167598",
            name: "Taxi Service - Business Only",
            scheduled_at: "2026-10-12T18:00:00-07:00",
            scheduled_until: "2026-10-12T19:00:00-07:00",
            cost: 0,
            assigned_to: null
          }
        ]
      })
    ],
    routeDate
  ).dogs.find((d) => d.name === "Juno");
  assert.ok(junoShaped, "live-shaped overnight boarding dog remains eligible via Leash Manners");
  assert.ok(junoShaped!.activities.includes("leash_manners"));
  assert.equal(junoShaped!.activities[0], "leash_manners");
  assert.equal(primarySubjectGroup(junoShaped!.activities).id, "leash_manners");
  assert.equal(dogMatchesActivityFilter(junoShaped!, "class"), true);
  assert.equal(dogMatchesActivityFilter(junoShaped!, "club"), false, "boarding class dogs are not in Club");
  const junoGroups = groupDogsBySubject([junoShaped!]);
  assert.equal(junoGroups[0]?.id, "leash_manners");
  assert.ok(junoGroups[0]?.dogs.some((d) => d.name === "Juno"));
  assert.ok(!junoGroups.some((g) => g.id === "club"));
  assert.equal(junoShaped!.pickupDestination, "club", "other-day Business Only taxi is not a home pickup");
  assert.equal(junoShaped!.dropoffDestination, "club", "other-day Business Only taxi is not a home drop-off");
  assert.equal(junoShaped!.isTaxi, false);
  assert.equal(junoShaped!.ownerClubDropoff, true, "boarding pickup is at Fitdog Club");
  assert.equal(junoShaped!.ownerClubPickup, true, "boarding drop-off is at Fitdog Club");
  assert.equal(junoShaped!.alreadyOnProperty, true);
  const junoStops = buildTransportationStops([junoShaped!], routeDate);
  assert.equal(junoStops.stops.length, 2);
  assert.ok(junoStops.stops.every((s) => s.destination === "club"));
  const junoDisplays = gingrTransportDisplays(junoShaped!);
  assert.ok(!junoDisplays.some((d) => d.em === "From Home" || d.em === "To Home"));
  assert.ok(junoDisplays.some((d) => d.em === "Fitdog Club"));
}

{
  const routeDate = "2026-09-29";
  const jojoRes = reservation({
    reservation_id: "209764",
    animal_id: 501,
    a_name: "JoJo",
    a_o_first_name: "Jeffrey",
    a_o_last_name: "Thomashow",
    reservation_type: { type: "Overnight: Suite" },
    start_date: "2026-09-17T07:00:00-07:00",
    end_date: "2026-10-01T20:00:00-07:00",
    check_in_date: "2026-09-17T16:52:00-07:00",
    check_out_date: null,
    owner: ownerHome(),
    services: [
      { name: "Free Daily Walk", scheduled_at: "2026-09-28T07:00:00-07:00" },
      { name: "Activity | Leash Manners", scheduled_at: "2026-09-29T00:00:00-07:00" },
      { name: "Free Daily Walk", scheduled_at: "2026-09-29T07:00:00-07:00" }
    ]
  });
  const yukiRes = reservation({
    reservation_id: "210722",
    animal_id: 502,
    a_name: "Yuki Goff",
    a_o_first_name: "Jane",
    a_o_last_name: "Goff",
    reservation_type: { type: "Leash Manners | Group Training" },
    start_date: "2026-09-29T00:00:00-07:00",
    end_date: "2026-09-29T00:30:00-07:00",
    services: [{ name: "Activity | Leash Manners", scheduled_at: "2026-09-29T00:00:00-07:00" }]
  });

  const tomorrow = normalizeGingrRouteReservations([jojoRes, yukiRes], routeDate);
  const jojo = tomorrow.dogs.find((d) => d.name === "JoJo");
  const yuki = tomorrow.dogs.find((d) => d.name === "Yuki Goff");
  assert.ok(jojo);
  assert.ok(yuki);
  assert.ok(jojo!.activities.includes("leash_manners"));
  assert.ok(yuki!.activities.includes("leash_manners"));
  const leashGroup = groupDogsBySubject(tomorrow.dogs).find((g) => g.id === "leash_manners");
  assert.ok(leashGroup);
  assert.deepEqual(
    leashGroup!.dogs.map((d) => d.name).sort(),
    ["JoJo", "Yuki Goff"]
  );
  assert.ok(!groupDogsBySubject(tomorrow.dogs).some((g) => g.id === "club"));

  const priorDay = normalizeGingrRouteReservations([jojoRes], "2026-09-28").dogs.find((d) => d.name === "JoJo");
  assert.ok(priorDay);
  assert.ok(!priorDay!.activities.includes("leash_manners"), "other-day class must not leak");
  assert.ok(priorDay!.activities.includes("club"));
}

{
  const routeDate = "2026-09-29";
  const boardingHomePickup = normalizeGingrRouteReservations(
    [
      reservation({
        id: "board-pu",
        animal_id: 8801,
        a_name: "Maple",
        reservation_type: { type: "Overnight: Petite Suite" },
        check_in_date: "2026-09-18T10:00:00-07:00",
        check_out_date: null,
        owner: ownerHome(),
        addons: [{ name: "Fitdog to Pick Up @ Home" }],
        services: [
          { name: "Activity | Leash Manners", scheduled_at: `${routeDate}T00:00:00-07:00` }
        ]
      })
    ],
    routeDate
  ).dogs[0];
  assert.equal(boardingHomePickup.alreadyOnProperty, true);
  assert.equal(boardingHomePickup.pickupDestination, "club");
  assert.equal(boardingHomePickup.dropoffDestination, "club");
  assert.equal(buildTransportationStops([boardingHomePickup], routeDate).stops.length, 2);
}

{
  const routeDate = "2026-09-29";
  const boardingHomeDropoff = normalizeGingrRouteReservations(
    [
      reservation({
        id: "board-do",
        animal_id: 8802,
        a_name: "Cedar",
        reservation_type: { type: "Overnight: Petite Suite" },
        check_in_date: "2026-09-18T10:00:00-07:00",
        check_out_date: null,
        owner: ownerHome(),
        addons: [{ name: "Fitdog to Drop Off @ Home" }],
        services: [
          { name: "Activity | Leash Manners", scheduled_at: `${routeDate}T00:00:00-07:00` }
        ]
      })
    ],
    routeDate
  ).dogs[0];
  assert.equal(boardingHomeDropoff.alreadyOnProperty, true);
  assert.equal(boardingHomeDropoff.pickupDestination, "club");
  assert.equal(boardingHomeDropoff.dropoffDestination, "club");
  assert.equal(buildTransportationStops([boardingHomeDropoff], routeDate).stops.length, 2);
}

{
  const datedTaxi = normalizeGingrRouteReservations(
    [
      reservation({
        id: "taxi-dated",
        animal_id: 8803,
        a_name: "CaboDated",
        type: "Adventure Hike",
        services: [
          { name: "Adventure Hike", scheduled_at: `${date}T09:00:00-07:00` },
          { name: "Door to Door Taxi", scheduled_at: `${date}T07:00:00-07:00` }
        ],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.equal(datedTaxi.isTaxi, true);
  assert.equal(datedTaxi.pickup, true);
  assert.equal(datedTaxi.dropoff, true);
  const datedTaxiStops = buildTransportationStops([datedTaxi], date);
  assert.equal(datedTaxiStops.pickupCount, 1);
  assert.equal(datedTaxiStops.dropoffCount, 1);
}

{
  assert.equal(
    isInternalBoardingTaxiMarker({
      text: "Taxi Service - Business Only",
      cost: 0,
      assignedTo: null
    }),
    true
  );
  assert.equal(
    isInternalBoardingTaxiMarker({ text: "Door to Door Taxi", cost: 0, assignedTo: null }),
    false
  );
}

{
  const club = gingrTransportDisplays({
    pickup: true,
    dropoff: true,
    pickupDestination: "club",
    dropoffDestination: "club",
    ownerClubDropoff: true,
    ownerClubPickup: true,
    isTaxi: false,
    alreadyOnProperty: false
  });
  assert.ok(club.every((d) => d.em !== "From Home" && d.em !== "To Home"));
  assert.ok(club.every((d) => !d.homeVan));
}

{
  const routeDate = "2026-09-29";
  const boardingWithClubAddon = normalizeGingrRouteReservations(
    [
      reservation({
        id: "board-club",
        animal_id: 8804,
        a_name: "Willow",
        reservation_type: { type: "Overnight: Petite Suite" },
        check_in_date: "2026-09-18T10:00:00-07:00",
        check_out_date: null,
        addons: [{ name: "Owner Drop Off" }, { name: "Owner Pickup" }],
        services: [{ name: "Activity | Leash Manners", scheduled_at: `${routeDate}T00:00:00-07:00` }],
        owner: ownerHome()
      })
    ],
    routeDate
  ).dogs[0];
  assert.equal(boardingWithClubAddon.alreadyOnProperty, true);
  assert.equal(boardingWithClubAddon.pickupDestination, "club");
  assert.equal(boardingWithClubAddon.dropoffDestination, "club");
  assert.equal(boardingWithClubAddon.ownerClubDropoff, true);
  assert.equal(boardingWithClubAddon.ownerClubPickup, true);
  assert.equal(boardingWithClubAddon.returnToClub, true);
  const willowStops = buildTransportationStops([boardingWithClubAddon], routeDate);
  assert.equal(willowStops.stops.length, 2);
  assert.ok(willowStops.stops.every((s) => s.destination === "club"));
  const clubOnProperty = gingrTransportDisplays(boardingWithClubAddon);
  assert.ok(clubOnProperty.some((d) => d.kind === "owner_club_dropoff"));
  assert.ok(clubOnProperty.some((d) => d.kind === "owner_club_pickup" && d.em === "Fitdog Club"));
  assert.ok(!clubOnProperty.some((d) => d.homeVan));
}

{
  const oscar = normalizeGingrRouteReservations(
    [
      reservation({
        id: "oscar-am",
        animal_id: 930,
        a_name: "Oscar",
        type: "Taxi",
        services: [{ name: "AM Taxi", scheduled_at: `${date}T08:00:00-07:00` }],
        owner: ownerHome()
      })
    ],
    date
  ).dogs[0];
  assert.ok(oscar);
  assert.ok(oscar.activities.includes("taxi"));
  assert.equal(oscar.isTaxi, true);
  assert.equal(oscar.pickup, true, "AM taxi is a home pickup");
  assert.equal(oscar.dropoffDestination, "home", "taxi dogs get pickup and drop-off routes");
  assert.equal(oscar.routeVanKey, "van_5");
  const oscarStops = buildTransportationStops([oscar], date);
  assert.equal(oscarStops.pickupCount, 1);
  assert.equal(oscarStops.dropoffCount, 1);
  const oscarDisplays = gingrTransportDisplays(oscar);
  assert.ok(oscarDisplays.some((d) => d.homeVan && d.em === "From Home"));
  assert.ok(oscarDisplays.some((d) => d.em === "To Home"));
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
    classCount: 0,
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

  assert.equal(parseGingrSendOwnerSmsParam(null), false);
  assert.equal(parseGingrSendOwnerSmsParam(""), false);
  assert.equal(parseGingrSendOwnerSmsParam("0"), false);
  assert.equal(parseGingrSendOwnerSmsParam("1"), true);
  assert.equal(parseGingrSendOwnerSmsParam("true"), true);
  assert.equal(parseGingrSendOwnerSmsParam("YES"), true);

  {
    const csv = [
      "Animal Name,Owner,Reservation Type,Add-ons,Address,City,State,Zip,Phone",
      "Jasper,Ada Cole,Adventure Hike,Fitdog to Pick Up @ Home,123 Main St,Santa Monica,CA,90401,3105550100",
      "Mochi,Alex Lee,Beach Excursion,Fitdog to Drop Off @ Home,900 Ocean Ave,Santa Monica,CA,90403,3105550199"
    ].join("\n");
    const reservations = parseGingrUploadText(csv, date);
    assert.equal(reservations.length, 2);
    const imported = normalizeGingrRouteReservations(reservations, date);
    const jasper = imported.dogs.find((d) => d.name === "Jasper");
    const mochi = imported.dogs.find((d) => d.name === "Mochi");
    assert.ok(jasper && mochi);
    assert.equal(jasper!.pickup, true);
    assert.equal(mochi!.dropoff, true);
    assert.ok(jasper!.activities.includes("adventure_hike"));
  }

  {
    const start = { latitude: 34.02485, longitude: -118.47389 };
    const near = { id: "near", latitude: 34.02, longitude: -118.49 };
    const far = { id: "far", latitude: 34.05, longitude: -118.24 };
    const ordered = orderStopsByShortestPath([far, near], start, start);
    assert.equal(ordered[0]?.id, "near", "shortest path visits the closer home first");
  }

  {
    const lumos = normalizeGingrRouteReservations(
      [
        reservation({
          id: "lumos-board",
          animal_id: 401,
          a_name: "Lumos",
          a_o_last_name: "Liu",
          type: "Overnight: Suite Blue Room",
          addons: [{ name: "Boarding @ Fitdog Club" }],
          services: [
            { name: "Activity | Adventure Hike", assigned_to: "Van 1", scheduled_at: `${date}T07:00:00-07:00` }
          ],
          owner: { ...ownerHome(), last_name: "Liu" },
          check_in_date: "2026-09-24T07:00:00-07:00",
          check_out_date: "2026-09-29T20:00:00-07:00"
        })
      ],
      date
    ).dogs[0];
    assert.ok(lumos);
    assert.equal(lumos!.routeVanKey, "van_1");
    assert.equal(lumos!.pickupDestination, "club");
    assert.equal(lumos!.dropoffDestination, "club");
    const lumosStops = buildTransportationStops([lumos!], date);
    assert.equal(lumosStops.stops.length, 2);
    assert.ok(lumosStops.stops.every((s) => s.destination === "club"));
    assert.ok(lumosStops.stops.every((s) => s.notes?.includes("Lumos Liu")));
    assert.equal(stopDisplayName(lumosStops.stops[0]!), "Fitdog Club");
  }

  {
    const ivonne = normalizeGingrRouteReservations(
      [
        reservation({
          id: "juno-ivonne",
          animal_id: 208564,
          a_name: "Juno",
          a_o_last_name: "Berglund",
          reservation_type: { type: "Overnight: Petite Suite" },
          addons: [{ name: "Boarding @ Fitdog Club" }],
          services: [
            {
              name: "Activity | Leash Manners",
              assigned_to: "Ivonne Campuzano",
              scheduled_at: `${date}T00:00:00-07:00`
            }
          ],
          owner: { ...ownerHome(), last_name: "Berglund" },
          check_in_date: "2026-09-18T10:00:00-07:00",
          check_out_date: null
        })
      ],
      date
    ).dogs[0];
    assert.equal(ivonne!.routeVanKey, "van_5");
    assert.equal(ivonne!.pickupDestination, "club");
    const taxi = normalizeGingrRouteReservations(
      [
        reservation({
          id: "oscar-taxi",
          animal_id: 930,
          a_name: "Oscar",
          type: "Full Day Daycare",
          services: [{ name: "Taxi Service", scheduled_at: `${date}T07:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(taxi!.routeVanKey, "van_5");
    assert.equal(taxi!.pickupDestination, "home");
    assert.equal(taxi!.dropoffDestination, "home");
  }

  console.log("test-gingr-route-generator: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
