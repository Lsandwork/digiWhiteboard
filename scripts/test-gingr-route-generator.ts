/**
 * Gingr Route Generator unit tests — activity matching, normalize, cache/inflight.
 * Run: npx tsx scripts/test-gingr-route-generator.ts
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import {
  GINGR_ROUTE_ACTIVITIES,
  GINGR_ROUTE_ACTIVITY_BY_ID,
  dogHasClassActivity,
  dogHasOffsiteActivity,
  isDropOffService,
  isOffsiteGingrActivity,
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
import {
  buildTransportationStops,
  fitdogClubStopAddress,
  stopDisplayName
} from "../lib/gingr-route-generator/transportation-stops";
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
import { parseGingrAssignedVan } from "../lib/gingr-route-generator/van-assignment";
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

assert.equal(merged.dogs.length, 2, "only the hike and beach dogs qualify; same animal merged");
const biscuit = merged.dogs.find((d) => d.name === "Biscuit");
const mochi = merged.dogs.find((d) => d.name === "Mochi");
const rex = merged.dogs.find((d) => d.name === "Rex");
assert.ok(biscuit, "Biscuit should be present");
assert.ok(mochi, "Mochi should be present");
assert.equal(rex, undefined, "daycare with no route service and no transport is excluded");
assert.equal(biscuit!.pickup, true, "pickup merges onto activity dog");
assert.equal(mochi!.dropoff, true, "dropoff merges onto activity dog");
assert.equal(biscuit!.activities.length, 1, "no duplicate activity ids");
assert.equal(biscuit!.activities[0], "adventure_hike");
assert.equal(mochi!.activities[0], "beach_excursion");

assert.equal(merged.stats.dogsScheduled, 2);
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
  assert.equal(juno!.pickup, false, "owner club drop-off is not a Fitdog home pickup");
  assert.equal(juno!.dropoff, false, "owner club pickup is not a Fitdog home drop-off");
  assert.equal(juno!.startLocation, "club", "Juno owner drop-off is not a Fitdog home pickup");
  assert.equal(juno!.endLocation, "club", "Juno owner pickup is not a Fitdog home drop-off");
  assert.equal(juno!.pickupDestination, null);
  assert.equal(juno!.dropoffDestination, null);
  assert.equal(juno!.ownerClubDropoff, true);
  assert.equal(juno!.ownerClubPickup, true);
  assert.ok(juno!.transportationTypes.includes("OWNER_CLUB_DROPOFF"));
  assert.ok(!juno!.transportationTypes.includes("FITDOG_HOME_PICKUP"));
  const stops = buildTransportationStops([juno!], date);
  assert.equal(juno!.returnToClub, true);
  assert.equal(stops.stops.length, 0, "Owner club dogs are not Fitdog van stops");
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
      assert.equal(dog.pickup, false);
      assert.equal(dog.dropoff, false);
      assert.equal(dog.startLocation, "club");
      assert.equal(dog.pickupDestination, null);
      assert.equal(dog.ownerClubDropoff, true);
      assert.equal(buildTransportationStops([dog], date).stops.length, 0);
    }
    if (flag === "dropoff") {
      assert.equal(dog.pickup, false);
      assert.equal(dog.dropoff, true);
      assert.equal(dog.dropoffDestination, "home");
      assert.equal(dog.ownerClubPickup, false);
    }
    if (flag === "ownerClubPickup") {
      assert.equal(dog.pickup, false);
      assert.equal(dog.dropoff, false);
      assert.equal(dog.endLocation, "club");
      assert.equal(dog.dropoffDestination, null);
      assert.equal(dog.ownerClubPickup, true);
      assert.equal(dog.returnToClub, true);
      const clubStops = buildTransportationStops([dog], date);
      assert.equal(clubStops.stops.length, 0);
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
  assert.equal(club.pickup, false);
  assert.equal(club.dropoff, false);
  assert.equal(club.startLocation, "club");
  assert.equal(club.endLocation, "club");
  assert.equal(club.pickupDestination, null);
  assert.equal(club.dropoffDestination, null);
  assert.equal(club.ownerClubDropoff, true);
  assert.equal(club.ownerClubPickup, true);
  assert.equal(club.returnToClub, true);
  assert.equal(club.alreadyOnProperty, true);
  const clubStops = buildTransportationStops([club], date);
  assert.equal(clubStops.stops.length, 0);

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
  assert.equal(club.pickup, false);
  assert.equal(club.dropoff, false);
  assert.equal(club.startLocation, "club");
  assert.equal(club.endLocation, "club");
  assert.equal(club.pickupDestination, null);
  assert.equal(club.dropoffDestination, null);
  assert.equal(club.ownerClubDropoff, true);
  assert.equal(club.ownerClubPickup, true);
  assert.equal(club.returnToClub, true);
  assert.equal(club.alreadyOnProperty, true);
  const clubStops = buildTransportationStops([club], date);
  assert.equal(clubStops.stops.length, 0);

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
    assert.equal(dog.pickup, false, className);
    assert.equal(dog.startLocation, "club", className);
    assert.equal(dog.pickupDestination, null, className);
    assert.equal(dog.dropoff, false, className);
    assert.equal(buildTransportationStops([dog], date).stops.length, 0, className);
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
  assert.equal(taxi.dropoff, false, "undated taxi is AM pickup and stay at club, not a home drop-off");
  assert.equal(taxi.endLocation, "club");
  const taxiStops = buildTransportationStops([taxi], date);
  assert.equal(taxiStops.pickupCount, 1);
  assert.equal(taxiStops.dropoffCount, 0);
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
  assert.equal(arrayDog?.startLocation, "club");
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
  assert.equal(junoShaped!.pickup, false, "other-day Business Only taxi is not a home pickup");
  assert.equal(junoShaped!.dropoff, false, "other-day Business Only taxi is not a home drop-off");
  assert.equal(junoShaped!.startLocation, "club", "other-day Business Only taxi is not a home pickup");
  assert.equal(junoShaped!.endLocation, "club", "other-day Business Only taxi is not a home drop-off");
  assert.equal(junoShaped!.isTaxi, false);
  assert.equal(junoShaped!.pickupDestination, null);
  assert.equal(junoShaped!.alreadyOnProperty, true);
  const junoStops = buildTransportationStops([junoShaped!], routeDate);
  assert.equal(junoStops.stops.length, 0);
  const junoDisplays = gingrTransportDisplays(junoShaped!);
  assert.ok(!junoDisplays.some((d) => d.em === "From Home" || d.em === "To Home"));
  assert.ok(junoDisplays.some((d) => d.kind === "on_property" || d.em === "At Club" || d.em === "Already on property"));
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

  // The class is dated 9/29, so on 9/28 JoJo is only boarding — no class leak and no route entry.
  const priorDay = normalizeGingrRouteReservations([jojoRes], "2026-09-28").dogs.find((d) => d.name === "JoJo");
  assert.equal(priorDay, undefined, "a boarding-only day has no qualifying route service");
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
  assert.equal(boardingHomePickup.pickup, false, "undated home pickup on a multi-day stay does not apply mid-stay");
  assert.equal(boardingHomePickup.startLocation, "club");
  assert.equal(buildTransportationStops([boardingHomePickup], routeDate).stops.length, 0);
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
  assert.equal(boardingHomeDropoff.dropoff, false, "undated home drop-off on a multi-day stay does not apply mid-stay");
  assert.equal(boardingHomeDropoff.endLocation, "club");
  assert.equal(buildTransportationStops([boardingHomeDropoff], routeDate).stops.length, 0);
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
    pickup: false,
    dropoff: false,
    pickupDestination: null,
    dropoffDestination: null,
    startLocation: "club",
    endLocation: "club",
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
  assert.equal(boardingWithClubAddon.pickup, false);
  assert.equal(boardingWithClubAddon.startLocation, "club");
  assert.equal(boardingWithClubAddon.endLocation, "club");
  assert.equal(boardingWithClubAddon.returnToClub, true);
  const willowStops = buildTransportationStops([boardingWithClubAddon], routeDate);
  assert.equal(willowStops.stops.length, 0);
  const clubOnProperty = gingrTransportDisplays(boardingWithClubAddon);
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
  assert.equal(oscar.dropoff, false, "AM taxi stays at the club");
  assert.equal(oscar.endLocation, "club");
  assert.equal(oscar.routeVanKey, "van_5");
  const oscarStops = buildTransportationStops([oscar], date);
  assert.equal(oscarStops.pickupCount, 1);
  assert.equal(oscarStops.dropoffCount, 0);
  const oscarDisplays = gingrTransportDisplays(oscar);
  assert.ok(oscarDisplays.some((d) => d.homeVan && d.em === "From Home"));
  assert.ok(!oscarDisplays.some((d) => d.em === "To Home"));
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
    assert.equal(lumos!.pickup, false);
    assert.equal(lumos!.startLocation, "club");
    assert.equal(lumos!.endLocation, "club");
    const lumosStops = buildTransportationStops([lumos!], date);
    assert.equal(lumosStops.stops.length, 2, "boarding dog on a hike rides from and back to Fitdog Club");
    assert.ok(lumosStops.stops.every((s) => s.locationType === "FITDOG_CLUB"));
    assert.ok(lumosStops.stops.every((s) => s.homeAddress === fitdogClubStopAddress()));
    assert.equal(lumosStops.exportable.length, 2);
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
    assert.equal(ivonne!.pickup, false);
    assert.equal(ivonne!.startLocation, "club");
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
    assert.equal(taxi!.dropoff, false);
    assert.equal(taxi!.endLocation, "club");
  }

  {
    const className = "Leash Manners | Group Training";
    const homePu = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t1-home-pu",
          animal_id: 7101,
          a_name: "DogA",
          type: className,
          addons: [{ name: "Fitdog to Pick Up @ Home" }],
          services: [{ name: className, scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(homePu.pickup, true);
    assert.equal(homePu.dropoff, false);
    assert.equal(homePu.startLocation, "home");
    assert.equal(homePu.routeVanKey, "van_5");
    assert.equal(buildTransportationStops([homePu], date).pickupCount, 1);

    const ownerDo = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t2-owner-do",
          animal_id: 7102,
          a_name: "DogB",
          type: className,
          addons: [{ name: "Owner Drop Off | Fitdog Club" }],
          services: [{ name: className, scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(ownerDo.pickup, false);
    assert.equal(ownerDo.startLocation, "club");
    assert.equal(buildTransportationStops([ownerDo], date).stops.length, 0);

    const boarding = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t3-board",
          animal_id: 7103,
          a_name: "DogC",
          reservation_type: { type: "Overnight: Petite Suite" },
          check_in_date: "2026-08-20T10:00:00-07:00",
          check_out_date: "2026-09-10T18:00:00-07:00",
          addons: [{ name: "Boarding @ Fitdog Club" }],
          services: [{ name: className, scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(boarding.pickup, false);
    assert.equal(boarding.startLocation, "club");
    assert.equal(boarding.alreadyOnProperty, true);
    assert.equal(buildTransportationStops([boarding], date).stops.length, 0);

    const homeDo = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t4-home-do",
          animal_id: 7104,
          a_name: "DogD",
          type: className,
          addons: [{ name: "Fitdog to Drop Off @ Home" }],
          services: [{ name: className, scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(homeDo.dropoff, true);
    assert.equal(homeDo.endLocation, "home");
    assert.equal(buildTransportationStops([homeDo], date).dropoffCount, 1);

    const ownerPu = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t5-owner-pu",
          animal_id: 7105,
          a_name: "DogE",
          type: className,
          addons: [{ name: "Owner Pick Up | Fitdog Club" }],
          services: [{ name: className, scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(ownerPu.dropoff, false);
    assert.equal(ownerPu.endLocation, "club");
    assert.equal(ownerPu.ownerClubPickup, true);
    assert.equal(buildTransportationStops([ownerPu], date).stops.length, 0);
  }

  {
    const routeDate = "2026-09-29";
    const multiDay = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t6-multi",
          animal_id: 7106,
          a_name: "MidStay",
          reservation_type: { type: "Overnight: Petite Suite" },
          check_in_date: "2026-09-18T10:00:00-07:00",
          check_out_date: "2026-10-12T18:00:00-07:00",
          start_date: "2026-09-18T07:00:00-07:00",
          end_date: "2026-10-12T18:00:00-07:00",
          owner: ownerHome(),
          services: [
            {
              name: "Fitdog to Pick Up @ Home",
              scheduled_at: "2026-09-18T07:00:00-07:00"
            },
            {
              name: "Leash Manners | Group Training",
              scheduled_at: `${routeDate}T09:00:00-07:00`
            },
            {
              name: "Fitdog to Drop Off @ Home",
              scheduled_at: "2026-10-12T18:00:00-07:00"
            }
          ]
        })
      ],
      routeDate
    ).dogs[0];
    assert.ok(multiDay.activities.includes("leash_manners"));
    assert.equal(multiDay.pickup, false, "check-in transportation is ignored on the class date");
    assert.equal(multiDay.dropoff, false, "checkout transportation is ignored on the class date");
    assert.equal(multiDay.startLocation, "club");
    assert.equal(buildTransportationStops([multiDay], routeDate).stops.length, 0);
  }

  {
    const routeDate = "2026-09-29";
    const explicitSameDay = normalizeGingrRouteReservations(
      [
        reservation({
          id: "t7-explicit",
          animal_id: 7107,
          a_name: "SameDayVan",
          reservation_type: { type: "Overnight: Petite Suite" },
          check_in_date: "2026-09-18T10:00:00-07:00",
          check_out_date: "2026-10-12T18:00:00-07:00",
          owner: ownerHome(),
          services: [
            {
              name: "Leash Manners | Group Training",
              scheduled_at: `${routeDate}T09:00:00-07:00`,
              addons: [{ name: "Fitdog to Pick Up @ Home" }]
            }
          ]
        })
      ],
      routeDate
    ).dogs[0];
    assert.equal(explicitSameDay.pickup, true, "same-day class addon Fitdog to Pick Up @ Home is a home pickup");
    assert.equal(explicitSameDay.startLocation, "home");
    assert.equal(buildTransportationStops([explicitSameDay], routeDate).pickupCount, 1);
  }

  {
    assert.equal(parseGingrAssignedVan("Van 5"), "van_5");
    assert.equal(parseGingrAssignedVan("Van 6"), "van_6");
    const van6 = normalizeGingrRouteReservations(
      [
        reservation({
          id: "van6-class",
          animal_id: 7108,
          a_name: "ClubVanDog",
          type: "Leash Manners | Group Training",
          addons: [{ name: "Fitdog to Pick Up @ Home" }],
          services: [{ name: "Leash Manners | Group Training", assigned_to: "Van 6" }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(van6.routeVanKey, "van_6");
    assert.equal(van6.pickup, true);
  }

  // Boarding @ Fitdog Club is a real transportation LOCATION, not "no transportation".
  {
    const boardingAt = (activity: string, assignedVan: string) =>
      normalizeGingrRouteReservations(
        [
          reservation({
            id: `club-loc-${activity}`,
            animal_id: 8201,
            a_name: "Scout",
            a_o_last_name: "Reyes",
            reservation_type: { type: "Overnight: Petite Suite" },
            check_in_date: "2026-09-18T10:00:00-07:00",
            check_out_date: "2026-10-12T18:00:00-07:00",
            addons: [{ name: "Boarding @ Fitdog Club" }],
            services: [
              { name: activity, assigned_to: assignedVan, scheduled_at: `${date}T07:30:00-07:00` }
            ],
            owner: { ...ownerHome(), last_name: "Reyes" }
          })
        ],
        date
      ).dogs[0];

    // Test 1: Boarding @ Fitdog Club + Adventure Hike -> Club pickup, Club drop-off, no home legs.
    const hike = boardingAt("Activity | Adventure Hike", "Van 1");
    assert.equal(hike.clubTransportLocation, true, "Boarding @ Fitdog Club sets the Club as the location");
    assert.equal(hike.pickup, false, "Boarding @ Fitdog Club is never a home pickup");
    assert.equal(hike.dropoff, false, "Boarding @ Fitdog Club is never a home drop-off");
    const hikeStops = buildTransportationStops([hike], date);
    assert.equal(hikeStops.pickupCount, 1, "Fitdog Club -> Hike is a pickup stop");
    assert.equal(hikeStops.dropoffCount, 1, "Hike -> Fitdog Club is a drop-off stop");
    for (const stop of hikeStops.stops) {
      assert.equal(stop.locationType, "FITDOG_CLUB");
      assert.equal(stop.locationLabel, "Fitdog Club");
      assert.equal(stop.destination, "club");
      assert.equal(stop.transportOption, "BOARDING_CLUB");
      assert.equal(stop.homeAddress, fitdogClubStopAddress());
      assert.equal(stop.homeStreet1, "1712 21st St");
      assert.equal(stop.homeCity, "Santa Monica");
      assert.equal(stop.homeState, "CA");
      assert.equal(stop.homePostalCode, "90404");
      assert.equal(stop.addressStatus, "ok");
      assert.equal(stopDisplayName(stop), "Fitdog Club");
      assert.ok(stop.activityLabels.some((label) => label.toLowerCase().includes("hike")));
    }

    // Test 2: Boarding @ Fitdog Club + Beach Excursion -> same Club legs on the outing van.
    const beach = boardingAt("Activity | Beach Excursion", "Van 2");
    assert.equal(beach.routeVanKey, "van_2");
    const beachStops = buildTransportationStops([beach], date);
    assert.equal(beachStops.stops.length, 2);
    assert.ok(beachStops.stops.every((s) => s.locationType === "FITDOG_CLUB"));
    assert.ok(beachStops.stops.every((s) => s.routeVanKey === "van_2"));

    // Test 3: Boarding @ Fitdog Club never produces a home stop, even with a home address on file.
    const boardingDisplays = gingrTransportDisplays(hike);
    assert.ok(
      boardingDisplays.every((d) => !d.homeVan),
      "Boarding @ Fitdog Club produces no home van badge"
    );
    assert.ok(boardingDisplays.some((d) => d.kind === "club_pickup" && d.vanLeg));
    assert.ok(boardingDisplays.some((d) => d.kind === "club_dropoff" && d.vanLeg));
    assert.ok(
      buildTransportationStops([hike], date).stops.every((s) => s.locationType !== "OWNER_HOME")
    );

    // Test 4: Boarding with an on-site class only -> the dog stays put, so no van stop at all.
    const onSite = boardingAt("Activity | Leash Manners", "Ivonne Campuzano");
    assert.equal(onSite.clubTransportLocation, true);
    assert.equal(buildTransportationStops([onSite], date).stops.length, 0, "on-site classes need no van");

    // Test 5: Owner Drop Off | Fitdog Club hands the dog over at the Club, so the van
    // loads it there for the outing, but the owner still owns the return leg.
    const ownerDropOff = normalizeGingrRouteReservations(
      [
        reservation({
          id: "club-loc-owner-do",
          animal_id: 8202,
          a_name: "Pepper",
          type: "Activity | Adventure Hike",
          addons: [{ name: "Owner Drop Off | Fitdog Club" }],
          services: [
            {
              name: "Activity | Adventure Hike",
              assigned_to: "Van 3",
              scheduled_at: `${date}T07:30:00-07:00`
            }
          ],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(ownerDropOff.ownerClubDropoff, true);
    assert.equal(ownerDropOff.clubTransportLocation, false, "owner options are not a boarding stay");
    assert.equal(ownerDropOff.pickup, false, "Owner Drop Off | Fitdog Club is never a home pickup");
    const ownerDropOffStops = buildTransportationStops([ownerDropOff], date);
    assert.equal(ownerDropOffStops.pickupCount, 1, "the van loads the dog at the Club for the outing");
    assert.equal(ownerDropOffStops.dropoffCount, 0, "the owner still owns the return leg");
    const ownerDropOffPickup = ownerDropOffStops.stops[0]!;
    assert.equal(ownerDropOffPickup.locationType, "FITDOG_CLUB");
    assert.equal(ownerDropOffPickup.homeAddress, fitdogClubStopAddress());
    assert.equal(
      ownerDropOffPickup.transportOption,
      "OWNER_CLUB_DROPOFF",
      "the stop records the option that put the dog at the Club"
    );
    const ownerDropOffDisplays = gingrTransportDisplays(ownerDropOff);
    assert.ok(ownerDropOffDisplays.some((d) => d.kind === "owner_club_dropoff"));
    assert.ok(ownerDropOffDisplays.some((d) => d.kind === "club_pickup"));
    assert.ok(ownerDropOffDisplays.every((d) => !d.homeVan));

    // An on-site class after an owner drop-off still needs no van at all.
    const ownerDropOffClass = normalizeGingrRouteReservations(
      [
        reservation({
          id: "club-loc-owner-do-class",
          animal_id: 8204,
          a_name: "Biscuit",
          type: "Leash Manners | Group Training",
          addons: [{ name: "Owner Drop Off | Fitdog Club" }],
          services: [{ name: "Leash Manners | Group Training", scheduled_at: `${date}T09:00:00-07:00` }],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(buildTransportationStops([ownerDropOffClass], date).stops.length, 0);

    // Test 6: Home options still win — a same-day home pickup keeps the home leg on a boarding stay.
    const boardingHomePickup = normalizeGingrRouteReservations(
      [
        reservation({
          id: "club-loc-home-pu",
          animal_id: 8203,
          a_name: "Maple",
          reservation_type: { type: "Overnight: Petite Suite" },
          check_in_date: `${date}T07:00:00-07:00`,
          check_out_date: "2026-10-12T18:00:00-07:00",
          addons: [{ name: "Boarding @ Fitdog Club" }],
          services: [
            {
              name: "Activity | Adventure Hike",
              assigned_to: "Van 1",
              scheduled_at: `${date}T07:30:00-07:00`,
              addons: [{ name: "Fitdog to Pick Up @ Home" }]
            }
          ],
          owner: ownerHome()
        })
      ],
      date
    ).dogs[0];
    assert.equal(boardingHomePickup.pickup, true, "an explicit same-day home pickup still applies");
    const mixedStops = buildTransportationStops([boardingHomePickup], date);
    assert.equal(mixedStops.pickupCount, 1);
    assert.equal(
      mixedStops.stops.find((s) => s.kind === "PICK_UP")?.locationType,
      "OWNER_HOME",
      "the home pickup keeps the owner address"
    );
    assert.equal(
      mixedStops.stops.find((s) => s.kind === "DROP_OFF")?.locationType,
      "FITDOG_CLUB",
      "the dog returns to the Club it is boarding at"
    );
  }

  // Trainer Led Hike | Group Training is a class, not an outing — but its transportation
  // add-ons still decide pickup/drop-off exactly like any other class.
  {
    const TLH = "Trainer Led Hike | Group Training";
    assert.equal(matchGingrRouteActivity(TLH)?.id, "trainer_led_hike");
    assert.equal(GINGR_ROUTE_ACTIVITY_BY_ID.trainer_led_hike.category, "class");
    assert.equal(isOffsiteGingrActivity("trainer_led_hike"), false, "Group Training never implies an outing");
    assert.equal(dogHasOffsiteActivity(["trainer_led_hike"]), false);
    for (const activity of GINGR_ROUTE_ACTIVITIES) {
      if (/group training/i.test(activity.label) || activity.category === "class") {
        assert.equal(isOffsiteGingrActivity(activity.id), false, `${activity.label} is not an outing`);
      }
    }
    assert.deepEqual(
      GINGR_ROUTE_ACTIVITIES.filter((a) => isOffsiteGingrActivity(a.id)).map((a) => a.id),
      ["adventure_hike", "beach_excursion", "recall_at_the_beach"],
      "the outing set stays limited to Adventure Hike, Beach Excursion, Recall At The Beach"
    );

    const trainerLedHike = (addons: string[], extra?: Record<string, unknown>) =>
      normalizeGingrRouteReservations(
        [
          reservation({
            id: `tlh-${addons.join("-") || "none"}`,
            animal_id: 8301,
            a_name: "Ranger",
            a_o_last_name: "Novak",
            type: TLH,
            addons: addons.map((name) => ({ name })),
            services: [{ name: TLH, scheduled_at: `${date}T09:00:00-07:00` }],
            owner: { ...ownerHome(), last_name: "Novak" },
            ...extra
          })
        ],
        date
      ).dogs[0];

    // Home pickup + home drop-off: both legs ride, on a Club van rather than an outing van.
    const bothHome = trainerLedHike(["Fitdog to Pick Up @ Home", "Fitdog to Drop Off @ Home"]);
    assert.ok(bothHome.activities.includes("trainer_led_hike"));
    assert.equal(bothHome.routeVanKey, "van_5", "a class rides a Club van, never an outing van");
    const bothHomeStops = buildTransportationStops([bothHome], date);
    assert.equal(bothHomeStops.pickupCount, 1, "Group Training with a home pickup is still routed");
    assert.equal(bothHomeStops.dropoffCount, 1, "Group Training with a home drop-off is still routed");
    assert.ok(bothHomeStops.stops.every((s) => s.locationType === "OWNER_HOME"));
    assert.ok(bothHomeStops.stops.every((s) => s.homeAddress !== fitdogClubStopAddress()));

    // Home pickup only: the dog stays at the Club for the owner afterwards.
    const pickupOnly = trainerLedHike(["Fitdog to Pick Up @ Home", "Owner Pick Up | Fitdog Club"]);
    const pickupOnlyStops = buildTransportationStops([pickupOnly], date);
    assert.equal(pickupOnlyStops.pickupCount, 1);
    assert.equal(pickupOnlyStops.dropoffCount, 0);
    assert.equal(pickupOnly.ownerClubPickup, true);

    // Owner drops off, Fitdog drives home: only the drop-off leg is a stop.
    const dropoffOnly = trainerLedHike(["Owner Drop Off | Fitdog Club", "Fitdog to Drop Off @ Home"]);
    const dropoffOnlyStops = buildTransportationStops([dropoffOnly], date);
    assert.equal(dropoffOnlyStops.pickupCount, 0, "no Club pickup for a class the dog is already at");
    assert.equal(dropoffOnlyStops.dropoffCount, 1);
    assert.equal(dropoffOnlyStops.stops[0]?.locationType, "OWNER_HOME");

    // Owner handles both ends: no van stop, and the class is never mistaken for an outing.
    const ownerBothEnds = trainerLedHike(["Owner Drop Off | Fitdog Club", "Owner Pick Up | Fitdog Club"]);
    assert.equal(buildTransportationStops([ownerBothEnds], date).stops.length, 0);

    // Boarding mid-stay: the dog is at the Club and no van leaves, so there is no stop.
    const boardingClass = trainerLedHike(["Boarding @ Fitdog Club"], {
      reservation_type: { type: "Overnight: Petite Suite" },
      check_in_date: "2026-09-18T10:00:00-07:00",
      check_out_date: "2026-10-12T18:00:00-07:00"
    });
    assert.equal(boardingClass.clubTransportLocation, true);
    assert.equal(boardingClass.pickup, false);
    assert.equal(buildTransportationStops([boardingClass], date).stops.length, 0);

    // Boarding plus an explicit same-day home drop-off: the home leg still applies.
    const boardingGoesHome = trainerLedHike(["Boarding @ Fitdog Club", "Fitdog to Drop Off @ Home"], {
      reservation_type: { type: "Overnight: Petite Suite" },
      check_in_date: "2026-09-18T10:00:00-07:00",
      check_out_date: `${date}T18:00:00-07:00`
    });
    assert.equal(boardingGoesHome.dropoff, true, "checkout-day home drop-off applies to the class date");
    const boardingGoesHomeStops = buildTransportationStops([boardingGoesHome], date);
    assert.equal(boardingGoesHomeStops.dropoffCount, 1);
    assert.equal(boardingGoesHomeStops.stops[0]?.locationType, "OWNER_HOME");
  }

  // --- Eligibility: only the selected date's qualifying services put a dog on the route ---
  {
    const routeDate = "2026-09-30";
    const otherDate = "2026-10-01";
    let nextId = 9000;
    const dog = (name: string, partial: Record<string, unknown>) =>
      reservation({
        reservation_id: String(nextId++),
        animal_id: nextId,
        a_name: name,
        owner: ownerHome(),
        ...partial
      });
    const namesFor = (reservations: GingrReservation[], on: string) =>
      normalizeGingrRouteReservations(reservations, on)
        .dogs.map((d) => d.name)
        .sort();

    // 1. Outing scheduled -> included.
    assert.deepEqual(
      namesFor(
        [
          dog("OutingDog", {
            type: "Adventure Hike",
            services: [{ name: "Activity | Adventure Hike", scheduled_at: `${routeDate}T08:00:00-07:00` }]
          })
        ],
        routeDate
      ),
      ["OutingDog"]
    );

    // 2. Taxi Service scheduled -> included.
    assert.deepEqual(
      namesFor(
        [
          dog("TaxiDog", {
            type: "Taxi Service",
            services: [{ name: "Taxi Service", scheduled_at: `${routeDate}T08:00:00-07:00` }],
            addons: [{ name: "Door to Door Taxi" }]
          })
        ],
        routeDate
      ),
      ["TaxiDog"]
    );

    // 3. Group class scheduled -> included.
    assert.deepEqual(
      namesFor(
        [
          dog("ClassDog", {
            type: "Leash Manners | Group Training",
            services: [
              { name: "Leash Manners | Group Training", scheduled_at: `${routeDate}T09:00:00-07:00` }
            ]
          })
        ],
        routeDate
      ),
      ["ClassDog"]
    );

    // 4. Daycare only -> excluded. 5. Boarding only -> excluded.
    // 6. Unrelated service -> excluded. 7. No appointment that date -> excluded.
    const nonQualifying = [
      dog("DaycareOnly", { type: "Daycare Full Day", services: [{ name: "Daycare Full Day" }] }),
      dog("DaycareHalf", { type: "Half Day Daycare", services: [{ name: "Half Day Daycare" }] }),
      dog("BoardingOnly", {
        reservation_type: { type: "Overnight: Petite Suite" },
        check_in_date: "2026-09-20T10:00:00-07:00",
        check_out_date: "2026-10-12T18:00:00-07:00",
        start_date: "2026-09-20T10:00:00-07:00",
        end_date: "2026-10-12T18:00:00-07:00",
        addons: [{ name: "Boarding @ Fitdog Club" }],
        services: [{ name: "Free Daily Walk", scheduled_at: `${routeDate}T07:00:00-07:00` }]
      }),
      dog("BoardingTaxiMarker", {
        reservation_type: { type: "Overnight: Suite" },
        check_in_date: "2026-09-20T10:00:00-07:00",
        check_out_date: "2026-10-12T18:00:00-07:00",
        start_date: "2026-09-20T10:00:00-07:00",
        end_date: "2026-10-12T18:00:00-07:00",
        services: [{ name: "Taxi Service - Business Only", cost: 0, assigned_to: null }]
      }),
      dog("GeneralClub", { type: "Dog Hotel", services: [{ name: "Dog Hotel" }] }),
      dog("MembershipOnly", { type: "Membership", services: [{ name: "Monthly Membership" }] }),
      dog("UnrelatedService", { type: "Grooming", services: [{ name: "Bath & Brush" }] }),
      dog("NoAppointment", {}),
      // 8. Qualifying appointment on another date -> excluded today.
      dog("TomorrowOuting", {
        type: "Adventure Hike",
        start_date: `${otherDate}T08:00:00-07:00`,
        services: [{ name: "Activity | Adventure Hike", scheduled_at: `${otherDate}T08:00:00-07:00` }]
      })
    ];
    assert.deepEqual(namesFor(nonQualifying, routeDate), [], "no non-qualifying dog reaches the route");

    // The same TomorrowOuting record qualifies on its own date — the date drives everything.
    assert.deepEqual(namesFor(nonQualifying, otherDate), ["TomorrowOuting"]);

    // 9. Duplicate Gingr records for one dog -> one route dog, both reservations retained.
    const duplicated = normalizeGingrRouteReservations(
      [
        reservation({
          reservation_id: "9501",
          animal_id: 9500,
          a_name: "Indy",
          owner: ownerHome(),
          type: "Adventure Hike",
          services: [{ name: "Activity | Adventure Hike", scheduled_at: `${routeDate}T08:00:00-07:00` }],
          addons: [{ name: "Fitdog to Pick Up @ Home" }]
        }),
        reservation({
          reservation_id: "9502",
          animal_id: 9500,
          a_name: "Indy",
          owner: ownerHome(),
          type: "Adventure Hike",
          services: [{ name: "Activity | Adventure Hike", scheduled_at: `${routeDate}T08:00:00-07:00` }],
          addons: [{ name: "Fitdog to Drop Off @ Home" }]
        })
      ],
      routeDate
    );
    assert.equal(duplicated.dogs.length, 1, "duplicate Gingr records collapse to one dog");
    assert.equal(duplicated.dogs[0]!.name, "Indy");
    assert.deepEqual(duplicated.dogs[0]!.activities, ["adventure_hike"]);
    assert.deepEqual(duplicated.dogs[0]!.reservationIds.sort(), [9501, 9502]);
    // 10. Transportation add-ons stay attached to the qualifying appointment.
    assert.equal(duplicated.dogs[0]!.pickup, true);
    assert.equal(duplicated.dogs[0]!.dropoff, true);
    assert.equal(buildTransportationStops(duplicated.dogs, routeDate).stops.length, 2);

    // 11. Sport Sign Ups is a qualifying class service.
    const sport = normalizeGingrRouteReservations(
      [
        dog("SportDog", {
          type: "Sport Sign Ups",
          services: [{ name: "Sport Sign Ups", scheduled_at: `${routeDate}T10:00:00-07:00` }],
          addons: [{ name: "Fitdog to Pick Up @ Home" }]
        })
      ],
      routeDate
    ).dogs;
    assert.deepEqual(sport.map((d) => d.name), ["SportDog"]);
    assert.ok(sport[0]!.activities.includes("sport_sign_ups"));
    assert.equal(sport[0]!.pickup, true);

    // A boarding dog with an explicit same-day Fitdog home leg is still a real van stop.
    const boardingGoesHome = normalizeGingrRouteReservations(
      [
        dog("CheckoutRide", {
          reservation_type: { type: "Overnight: Petite Suite" },
          check_in_date: "2026-09-20T10:00:00-07:00",
          check_out_date: `${routeDate}T17:00:00-07:00`,
          addons: [{ name: "Boarding @ Fitdog Club" }, { name: "Fitdog to Drop Off @ Home" }]
        })
      ],
      routeDate
    ).dogs;
    assert.deepEqual(boardingGoesHome.map((d) => d.name), ["CheckoutRide"]);
    assert.equal(boardingGoesHome[0]!.dropoff, true);
    assert.equal(buildTransportationStops(boardingGoesHome, routeDate).dropoffCount, 1);
  }

  // 12/13. A full simulated day: only qualifying dogs come back, and a different date
  // built from the same records returns a different roster. Names live in this test only.
  {
    const routeDate = "2026-09-30";
    const nextDay = "2026-10-01";
    const expectedToday = [
      "Penelope", "Emmie", "Daisy", "Teddy", "Beau", "Stevie", "Mac", "Nikita",
      "Annie", "Brontë", "Zuma", "Angus", "Baxter", "Mookie", "Bruno", "Ollie",
      "Bill", "Indy", "Chazzy", "Gracie", "Garnet", "Harper", "Darcy", "Remy",
      "Tilly", "Juno", "Jojo", "Chucky", "Atlas", "Osita", "Luci", "Oscar C"
    ];
    const qualifyingServices = [
      "Activity | Adventure Hike",
      "Activity | Beach Excursion",
      "Recall At The Beach",
      "Leash Manners | Group Training",
      "Cool Tricks | Group Training",
      "Scent Work | Group Training",
      "Canine Fitness",
      "Sport Sign Ups"
    ];
    let animalId = 6000;
    const schedule: GingrReservation[] = [];

    expectedToday.forEach((name, index) => {
      animalId += 1;
      if (name === "Oscar C") {
        schedule.push(
          reservation({
            reservation_id: String(7000 + index),
            animal_id: animalId,
            a_name: name,
            owner: ownerHome(),
            type: "Taxi Service",
            services: [{ name: "Taxi Service", scheduled_at: `${routeDate}T07:30:00-07:00` }],
            addons: [{ name: "Door to Door Taxi" }]
          })
        );
        return;
      }
      const service = qualifyingServices[index % qualifyingServices.length];
      // Half of the roster is boarding at the Club during a qualifying appointment.
      const boarding = index % 2 === 0;
      schedule.push(
        reservation({
          reservation_id: String(7000 + index),
          animal_id: animalId,
          a_name: name,
          owner: ownerHome(),
          ...(boarding
            ? {
                reservation_type: { type: "Overnight: Petite Suite" },
                check_in_date: "2026-09-25T10:00:00-07:00",
                check_out_date: "2026-10-08T18:00:00-07:00",
                start_date: "2026-09-25T10:00:00-07:00",
                end_date: "2026-10-08T18:00:00-07:00",
                addons: [{ name: "Boarding @ Fitdog Club" }]
              }
            : {
                type: service,
                addons: [{ name: "Fitdog to Pick Up @ Home" }, { name: "Fitdog to Drop Off @ Home" }]
              }),
          services: [{ name: service, scheduled_at: `${routeDate}T09:00:00-07:00` }]
        })
      );
    });

    // Indy appears twice in the source data and must still be one route dog.
    const indy = schedule.find((r) => (r as Record<string, unknown>).a_name === "Indy")!;
    schedule.push(
      reservation({
        ...(indy as Record<string, unknown>),
        reservation_id: "7999",
        services: [{ name: "Activity | Adventure Hike", scheduled_at: `${routeDate}T08:00:00-07:00` }]
      })
    );

    // Noise that must never reach the route.
    const excludedNames = [
      "DaycareNoise",
      "BoardingNoise",
      "MembershipNoise",
      "GroomingNoise",
      "NextDayNoise"
    ];
    schedule.push(
      reservation({
        reservation_id: "7801",
        animal_id: 6901,
        a_name: "DaycareNoise",
        owner: ownerHome(),
        type: "Daycare Full Day",
        services: [{ name: "Daycare Full Day" }]
      }),
      reservation({
        reservation_id: "7802",
        animal_id: 6902,
        a_name: "BoardingNoise",
        owner: ownerHome(),
        reservation_type: { type: "Overnight: Suite Blue Room" },
        check_in_date: "2026-09-22T10:00:00-07:00",
        check_out_date: "2026-10-10T18:00:00-07:00",
        start_date: "2026-09-22T10:00:00-07:00",
        end_date: "2026-10-10T18:00:00-07:00",
        addons: [{ name: "Boarding @ Fitdog Club" }],
        services: [
          { name: "Free Daily Walk", scheduled_at: `${routeDate}T07:00:00-07:00` },
          { name: "Taxi Service - Business Only", cost: 0, assigned_to: null }
        ]
      }),
      reservation({
        reservation_id: "7803",
        animal_id: 6903,
        a_name: "MembershipNoise",
        owner: ownerHome(),
        type: "Membership",
        services: [{ name: "Monthly Membership" }]
      }),
      reservation({
        reservation_id: "7804",
        animal_id: 6904,
        a_name: "GroomingNoise",
        owner: ownerHome(),
        type: "Grooming",
        services: [{ name: "Bath & Brush", scheduled_at: `${routeDate}T11:00:00-07:00` }]
      }),
      reservation({
        reservation_id: "7805",
        animal_id: 6905,
        a_name: "NextDayNoise",
        owner: ownerHome(),
        type: "Beach Excursion",
        start_date: `${nextDay}T08:00:00-07:00`,
        services: [{ name: "Activity | Beach Excursion", scheduled_at: `${nextDay}T08:00:00-07:00` }]
      })
    );

    const today = normalizeGingrRouteReservations(schedule, routeDate);
    assert.deepEqual(
      today.dogs.map((d) => d.name).sort(),
      [...expectedToday].sort(),
      "the selected date returns exactly the dogs with a qualifying service"
    );
    assert.equal(today.dogs.length, expectedToday.length, "Indy's duplicate record is deduplicated");
    assert.equal(today.stats.dogsScheduled, expectedToday.length);
    for (const name of excludedNames) {
      assert.ok(!today.dogs.some((d) => d.name === name), `${name} must not appear`);
    }
    const indyDog = today.dogs.find((d) => d.name === "Indy")!;
    assert.ok(indyDog.reservationIds.length >= 2, "both Indy records merge onto one dog");

    // 13. The same Gingr records on a different date produce a different roster.
    const tomorrow = normalizeGingrRouteReservations(schedule, nextDay);
    assert.deepEqual(
      tomorrow.dogs.map((d) => d.name),
      ["NextDayNoise"],
      "a different date yields that date's qualifying dogs"
    );
    assert.notDeepEqual(today.dogs.map((d) => d.name), tomorrow.dogs.map((d) => d.name));
  }

  console.log("test-gingr-route-generator: all assertions passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
