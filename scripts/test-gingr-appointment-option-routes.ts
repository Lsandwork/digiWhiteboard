/**
 * Gingr Route Generator — appointment option route scenarios.
 *
 * Each scenario feeds Gingr-shaped reservations through the same pipeline the
 * app uses: normalizeGingrRouteReservations -> buildGingrSamsaraExport (stops,
 * van routes, Samsara CSV rows). Only geocoding is replaced, with fixed
 * coordinates, so the run needs no network.
 *
 * Run: npx tsx scripts/test-gingr-appointment-option-routes.ts
 *      add --print to also print the generated Samsara rows.
 */
import assert from "node:assert/strict";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import type { GeocodeResult } from "../lib/route-generator/geocode";
import type { ExportStopRow } from "../lib/route-generator/samsara-csv";
import { normalizeGingrRouteReservations, type GingrRouteDog } from "../lib/gingr-route-generator/normalize";
import { FITDOG_CLUB_ADDRESS } from "../lib/gingr-route-generator/transportation";
import type { TransportationStop } from "../lib/gingr-route-generator/transportation-stops";
import {
  buildGingrSamsaraExport,
  isFacilityBookendRow,
  type GingrSamsaraExportResult
} from "../lib/gingr-route-generator/samsara-export";

const DATE = "2026-11-17"; // Tuesday
const PRINT = process.argv.includes("--print");

let nextAnimal = 70100;

function owner(last: string, street: string) {
  return {
    first_name: "Pat",
    last_name: last,
    address_1: street,
    city: "Santa Monica",
    state: "CA",
    postal: "90405",
    cell_phone: "3105550142"
  };
}

type OptionField = "appointment_options" | "addons" | "additional_services";

function options(names: string[], field: OptionField, reservationId: string) {
  return { [field]: names.map((name, index) => ({ id: `${reservationId}-opt-${index + 1}`, name })) };
}

/** A day booking for one activity, with its appointment options. */
function dayBooking(input: {
  id: string;
  dog: string;
  ownerLast: string;
  street: string;
  service: string;
  van?: string;
  time?: string;
  options: string[];
  optionField?: OptionField;
}): GingrReservation {
  const time = input.time ?? "09:00";
  return {
    reservation_id: input.id,
    animal_id: nextAnimal++,
    a_name: input.dog,
    a_o_first_name: "Pat",
    a_o_last_name: input.ownerLast,
    reservation_type: { type: input.service },
    start_date: `${DATE}T${time}:00-08:00`,
    end_date: `${DATE}T15:00:00-08:00`,
    services: [
      {
        id: `${input.id}-svc`,
        name: input.service,
        scheduled_at: `${DATE}T${time}:00-08:00`,
        assigned_to: input.van ?? null
      }
    ],
    ...options(input.options, input.optionField ?? "appointment_options", input.id),
    owner: owner(input.ownerLast, input.street)
  } as unknown as GingrReservation;
}

/** An overnight stay (checked in days ago) with one activity today. */
function boardingStay(input: {
  id: string;
  dog: string;
  ownerLast: string;
  street: string;
  activity: string;
  van?: string;
  options: string[];
  extraActivityDates?: string[];
}): GingrReservation {
  return {
    reservation_id: input.id,
    animal_id: nextAnimal++,
    a_name: input.dog,
    a_o_first_name: "Pat",
    a_o_last_name: input.ownerLast,
    reservation_type: { type: "Overnight: Petite Suite" },
    start_date: "2026-11-14T08:00:00-08:00",
    end_date: "2026-11-21T17:00:00-08:00",
    check_in_date: "2026-11-14T09:12:00-08:00",
    check_out_date: null,
    services: [
      {
        id: `${input.id}-svc`,
        name: `Activity | ${input.activity}`,
        scheduled_at: `${DATE}T08:30:00-08:00`,
        assigned_to: input.van ?? null
      },
      ...(input.extraActivityDates ?? []).map((day, index) => ({
        id: `${input.id}-svc-${index + 2}`,
        name: `Activity | ${input.activity}`,
        scheduled_at: `${day}T08:30:00-08:00`,
        assigned_to: input.van ?? null
      }))
    ],
    ...options(input.options, "appointment_options", input.id),
    owner: owner(input.ownerLast, input.street)
  } as unknown as GingrReservation;
}

function fixedGeocode(addresses: string[]): Promise<Map<string, GeocodeResult>> {
  const map = new Map<string, GeocodeResult>();
  for (const address of addresses) {
    let hash = 0;
    for (const char of address) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    map.set(address, {
      latitude: 34.0 + (hash % 500) / 10000,
      longitude: -118.5 + ((hash >>> 9) % 900) / 10000,
      formattedAddress: address,
      confidence: 1,
      provider: "cache",
      cacheHit: true
    });
  }
  return Promise.resolve(map);
}

type Day = {
  dogs: GingrRouteDog[];
  dog: (name: string) => GingrRouteDog;
  stops: TransportationStop[];
  stopsFor: (name: string) => TransportationStop[];
  rows: ExportStopRow[];
  rowsFor: (name: string) => ExportStopRow[];
  result: GingrSamsaraExportResult;
};

async function runDay(reservations: GingrReservation[]): Promise<Day> {
  const { dogs } = normalizeGingrRouteReservations(reservations, DATE);
  const result = await buildGingrSamsaraExport({ date: DATE, dogs, vehicleName: "All vans", geocode: fixedGeocode });
  const transportation = result.transportation;
  assert.ok(transportation, "the export always reports the stops it built");
  const stops = transportation.stops;
  const rows = result.ok ? result.rows : [];
  if (result.ok) {
    assert.ok(rows.length > 0);
  }
  const dog = (name: string) => {
    const found = dogs.find((d) => d.name === name);
    assert.ok(found, `${name} is on the route roster`);
    return found;
  };
  return {
    dogs,
    dog,
    stops,
    stopsFor: (name) => stops.filter((stop) => stop.dogs.some((entry) => entry.dogName === name)),
    rows,
    rowsFor: (name) => rows.filter((row) => row.stopName.includes(name) || row.stopNotes.includes(name)),
    result
  };
}

function stopSummary(stops: TransportationStop[]): string[] {
  return stops.map((stop) => `${stop.routeVanKey}:${stop.stopType}`);
}

function endText(dog: GingrRouteDog, which: "start" | "end"): string {
  const end = which === "start" ? dog.transportPlan.startingLocation : dog.transportPlan.finalDestination;
  if (end.locationType === "UNKNOWN") return "unknown (review)";
  const place = end.locationType === "HOME" ? "home" : "Fitdog Club";
  const party = end.responsibleParty === "OWNER" ? "owner" : end.responsibleParty === "FITDOG" ? "Fitdog" : "?";
  return `${place} (${party})`;
}

function optionShape(dog: GingrRouteDog): string[] {
  return dog.appointmentOptionDetails.map(
    (o) => `${o.phase}|${o.filter}|${o.responsibleParty}|${o.action}|${o.location}${o.issue ? "|ISSUE" : ""}`
  );
}

function routeRows(rows: ExportStopRow[], van: string, direction: "pickup" | "dropoff"): ExportStopRow[] {
  return rows.filter(
    (row) => row.vehicleName === van && (direction === "pickup" ? /pick/i.test(row.routeName) : /drop/i.test(row.routeName))
  );
}

function customerRows(rows: ExportStopRow[]): ExportStopRow[] {
  return rows.filter((row) => !isFacilityBookendRow(row));
}

const results: Array<{ n: number; title: string; start: string; finish: string; stops: string; csv: string }> = [];

function record(n: number, title: string, day: Day, name: string, csv: string) {
  const dog = day.dog(name);
  results.push({
    n,
    title,
    start: endText(dog, "start"),
    finish: endText(dog, "end"),
    stops: stopSummary(day.stopsFor(name)).join(", ") || "none",
    csv
  });
}

async function main() {
  // 1. Owner drops off at Fitdog Club; Fitdog drives the dog home afterwards.
  {
    const day = await runDay([
      dayBooking({
        id: "s1",
        dog: "Biscuit",
        ownerLast: "Alvarez",
        street: "1201 Pearl St",
        service: "Adventure Hike",
        van: "Van 1",
        options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    const dog = day.dog("Biscuit");
    assert.deepEqual(optionShape(dog), [
      "BEFORE|PICKUP|OWNER|DROPOFF|FITDOG_CLUB",
      "AFTER|DROPOFF|FITDOG|DROPOFF|HOME"
    ]);
    assert.equal(dog.transportPlan.startingLocation.locationType, "FITDOG_CLUB");
    assert.equal(dog.transportPlan.startingLocation.responsibleParty, "OWNER");
    assert.equal(dog.pickup, false, "owner drop-off is never a Fitdog home pickup");
    assert.deepEqual(stopSummary(day.stopsFor("Biscuit")), ["van_1:CLUB_PICKUP", "van_1:HOME_DROPOFF"]);
    const pick = routeRows(day.rows, "Van 01", "pickup");
    assert.ok(!pick.some((row) => /PICK UP FROM HOME/.test(row.stopName)), "no home pickup row");
    assert.ok(customerRows(pick).some((row) => row.stopName === "Fitdog Club" && row.stopAddress.includes("1712 21st St")));
    assert.ok(customerRows(routeRows(day.rows, "Van 01", "dropoff")).some((row) => row.stopName === "Biscuit (Pat A.) - DROP OFF TO HOME"));
    record(1, "Owner drops off at Fitdog Club", day, "Biscuit", "Club pickup row, home drop-off row, no home pickup");
  }

  // 2. Fitdog picks the dog up from home; the owner collects it at the Club.
  {
    const day = await runDay([
      dayBooking({
        id: "s2",
        dog: "Mochi",
        ownerLast: "Bishop",
        street: "2210 Ocean Park Blvd",
        service: "Beach Excursion",
        van: "Van 2",
        options: ["Before Outing - Fitdog to Pick Up @ Home", "After Outing - Owner Pick Up @ Fitdog Club"],
        optionField: "addons"
      })
    ]);
    const dog = day.dog("Mochi");
    assert.deepEqual(optionShape(dog), ["BEFORE|PICKUP|FITDOG|PICKUP|HOME", "AFTER|DROPOFF|OWNER|PICKUP|FITDOG_CLUB"]);
    assert.equal(dog.pickup, true);
    assert.equal(dog.dropoff, false, "owner pick-up at the Club is never a Fitdog home drop-off");
    assert.deepEqual(stopSummary(day.stopsFor("Mochi")), ["van_2:HOME_PICKUP", "van_2:CLUB_DROPOFF"]);
    const pick = customerRows(routeRows(day.rows, "Van 02", "pickup"));
    assert.deepEqual(pick.map((row) => row.stopName), ["Mochi (Pat B.) - PICK UP FROM HOME"]);
    assert.equal(pick[0]!.stopAddress, "2210 Ocean Park Blvd, Santa Monica, CA 90405, USA");
    const drop = customerRows(routeRows(day.rows, "Van 02", "dropoff"));
    assert.deepEqual(drop.map((row) => row.stopName), ["Fitdog Club"], "the van returns Mochi to the Club");
    assert.match(drop[0]!.stopNotes, /owner pick-up at Club/);
    record(2, "Fitdog picks up from home", day, "Mochi", "Home pickup row at owner address, Club return row");
  }

  // 3. Fitdog drops the dog off at home.
  {
    const day = await runDay([
      dayBooking({
        id: "s3",
        dog: "Pepper",
        ownerLast: "Castro",
        street: "915 Hill St",
        service: "Recall At The Beach",
        van: "Van 3",
        options: ["Before Outing - Fitdog to Pick Up @ Home", "After Outing - Fitdog to Drop Off @ Home"],
        optionField: "additional_services"
      })
    ]);
    const dog = day.dog("Pepper");
    assert.equal(dog.transportPlan.finalDestination.locationType, "HOME");
    assert.equal(dog.transportPlan.finalDestination.responsibleParty, "FITDOG");
    assert.deepEqual(stopSummary(day.stopsFor("Pepper")), ["van_3:HOME_PICKUP", "van_3:HOME_DROPOFF"]);
    const drop = routeRows(day.rows, "Van 03", "dropoff");
    assert.deepEqual(customerRows(drop).map((row) => row.stopName), ["Pepper (Pat C.) - DROP OFF TO HOME"]);
    assert.match(drop[drop.length - 1]!.stopName, /Hub/, "Van 3 drop-off run ends at the Hub");
    record(3, "Fitdog drops off at home", day, "Pepper", "Home drop-off row at owner address");
  }

  // 4. Owner drops off and picks up at Fitdog Club: no Fitdog home leg at either end.
  {
    const day = await runDay([
      dayBooking({
        id: "s4",
        dog: "Rocket",
        ownerLast: "Dunn",
        street: "740 Bay St",
        service: "Adventure Hike",
        van: "Van 1",
        options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Owner Pick Up @ Fitdog Club"]
      })
    ]);
    const dog = day.dog("Rocket");
    assert.equal(dog.dropoff, false);
    assert.equal(dog.transportPlan.finalDestination.responsibleParty, "OWNER");
    assert.deepEqual(stopSummary(day.stopsFor("Rocket")), ["van_1:CLUB_PICKUP", "van_1:CLUB_DROPOFF"]);
    assert.ok(!day.rows.some((row) => /TO HOME|FROM HOME/.test(row.stopName)), "no home rows at all");
    record(4, "Owner picks up at Fitdog Club", day, "Rocket", "Club pickup + Club return rows, no home rows");
  }

  // 5. Boarding dog with no Before / After option: starts and ends at the Club.
  {
    const day = await runDay([
      boardingStay({
        id: "s5",
        dog: "Juniper",
        ownerLast: "Ellis",
        street: "1530 Euclid St",
        activity: "Adventure Hike",
        van: "Van 1",
        options: ["Boarding @ Fitdog Club"]
      })
    ]);
    const dog = day.dog("Juniper");
    assert.deepEqual(optionShape(dog), ["BOARDING|BOARDING|FITDOG|NONE|FITDOG_CLUB"]);
    assert.equal(dog.transportPlan.status, "OK", "boarding needs no Before or After option");
    assert.equal(dog.transportPlan.startingLocation.locationType, "FITDOG_CLUB");
    assert.equal(dog.transportPlan.finalDestination.locationType, "FITDOG_CLUB");
    assert.equal(dog.transportPlan.finalDestination.address, FITDOG_CLUB_ADDRESS);
    assert.deepEqual(stopSummary(day.stopsFor("Juniper")), ["van_1:CLUB_PICKUP", "van_1:CLUB_DROPOFF"]);
    assert.equal(customerRows(day.rows).filter((row) => row.stopName === "Fitdog Club").length, 2);
    record(5, "Boarding: Club to Club", day, "Juniper", "Club pickup + Club return rows");
  }

  // 6. Boarding dog starts at the Club and finishes at home.
  {
    const day = await runDay([
      boardingStay({
        id: "s6",
        dog: "Maple",
        ownerLast: "Foster",
        street: "2400 Main St",
        activity: "Adventure Hike",
        van: "Van 1",
        options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    const dog = day.dog("Maple");
    assert.equal(dog.transportPlan.startingLocation.locationType, "FITDOG_CLUB");
    assert.equal(dog.transportPlan.finalDestination.locationType, "HOME", "the After option overrides the Club return");
    assert.equal(dog.returnToClub, false);
    assert.deepEqual(stopSummary(day.stopsFor("Maple")), ["van_1:CLUB_PICKUP", "van_1:HOME_DROPOFF"]);
    const drop = customerRows(routeRows(day.rows, "Van 01", "dropoff"));
    assert.deepEqual(drop.map((row) => row.stopName), ["Maple (Pat F.) - DROP OFF TO HOME"]);
    record(6, "Boarding: Club to home", day, "Maple", "Club pickup row, home drop-off row, no Club return");
  }

  // 7. Boarding dog in a Group Class, dropped at home afterwards (Van 5 starts and ends at the Club).
  {
    const day = await runDay([
      boardingStay({
        id: "s7",
        dog: "Oakley",
        ownerLast: "Garcia",
        street: "1022 Pico Blvd",
        activity: "Leash Manners | Group Training - Business Only",
        van: "Van 5",
        options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    const dog = day.dog("Oakley");
    assert.ok(dog.activities.includes("leash_manners"));
    assert.deepEqual(stopSummary(day.stopsFor("Oakley")), ["van_5:CLUB_PICKUP", "van_5:HOME_DROPOFF"]);
    const pick = routeRows(day.rows, "Van 05", "pickup");
    assert.equal(customerRows(pick).length, 0, "Van 5 starts at the Club, so no second Club row");
    assert.match(pick[0]!.stopNotes, /^START: .*PICK UP AT FITDOG CLUB \(1\): Oakley Garcia/);
    const drop = routeRows(day.rows, "Van 05", "dropoff");
    assert.deepEqual(customerRows(drop).map((row) => row.stopName), ["Oakley (Pat G.) - DROP OFF TO HOME"]);
    assert.ok(!/DROP OFF AT FITDOG CLUB/.test(drop[drop.length - 1]!.stopNotes), "no Club return for Oakley");
    record(7, "Boarding Group Class to home", day, "Oakley", "Van 5 START carries the Club pickup; home drop-off row");
  }

  // 8. Boarding dog on a Beach Excursion, dropped at home.
  {
    const day = await runDay([
      boardingStay({
        id: "s8",
        dog: "Sunny",
        ownerLast: "Hayes",
        street: "301 Ocean Ave",
        activity: "Beach Excursion",
        van: "Van 2",
        options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    assert.deepEqual(stopSummary(day.stopsFor("Sunny")), ["van_2:CLUB_PICKUP", "van_2:HOME_DROPOFF"]);
    assert.deepEqual(customerRows(routeRows(day.rows, "Van 02", "dropoff")).map((row) => row.stopName), [
      "Sunny (Pat H.) - DROP OFF TO HOME"
    ]);
    record(8, "Boarding Beach Excursion to home", day, "Sunny", "Club pickup row, home drop-off row");
  }

  // 9. Boarding dog on Recall at the Beach, dropped at home.
  {
    const day = await runDay([
      boardingStay({
        id: "s9",
        dog: "Koda",
        ownerLast: "Ito",
        street: "1845 17th St",
        activity: "Recall At The Beach",
        van: "Van 3",
        options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    assert.ok(day.dog("Koda").activities.includes("recall_at_the_beach"));
    assert.deepEqual(stopSummary(day.stopsFor("Koda")), ["van_3:CLUB_PICKUP", "van_3:HOME_DROPOFF"]);
    assert.deepEqual(customerRows(routeRows(day.rows, "Van 03", "dropoff")).map((row) => row.stopName), [
      "Koda (Pat I.) - DROP OFF TO HOME"
    ]);
    record(9, "Boarding Recall at the Beach to home", day, "Koda", "Club pickup row, home drop-off row");
  }

  // 10. Several boarding dogs share one Club pickup; each keeps its own destination.
  {
    const day = await runDay([
      boardingStay({ id: "s10a", dog: "Ace", ownerLast: "Jensen", street: "510 Marine St", activity: "Adventure Hike", van: "Van 1", options: ["Boarding @ Fitdog Club"] }),
      boardingStay({ id: "s10b", dog: "Bella", ownerLast: "Kim", street: "620 Raymond Ave", activity: "Adventure Hike", van: "Van 1", options: [] }),
      boardingStay({
        id: "s10c",
        dog: "Cooper",
        ownerLast: "Lopez",
        street: "733 Navy St",
        activity: "Adventure Hike",
        van: "Van 1",
        options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      })
    ]);
    const clubPickups = day.stops.filter((stop) => stop.stopType === "CLUB_PICKUP");
    assert.equal(clubPickups.length, 1, "one physical Club pickup");
    assert.deepEqual(clubPickups[0]!.dogs.map((entry) => entry.dogName), ["Ace", "Bella", "Cooper"]);
    const clubReturns = day.stops.filter((stop) => stop.stopType === "CLUB_DROPOFF");
    assert.equal(clubReturns.length, 1);
    assert.deepEqual(clubReturns[0]!.dogs.map((entry) => entry.dogName), ["Ace", "Bella"]);
    assert.deepEqual(stopSummary(day.stopsFor("Cooper")), ["van_1:CLUB_PICKUP", "van_1:HOME_DROPOFF"]);
    assert.equal(day.dog("Bella").transportPlan.isBoarding, true, "an overnight stay is boarding without the option");
    const pick = customerRows(routeRows(day.rows, "Van 01", "pickup"));
    assert.equal(pick.length, 1);
    assert.equal(pick[0]!.stopName, "Fitdog Club");
    assert.match(pick[0]!.stopNotes, /^PICK UP AT FITDOG CLUB \(3 dogs\) \| Ace Jensen \(boarding\); Bella Kim \(boarding\); Cooper Lopez \(boarding\)/);
    results.push({
      n: 10,
      title: "Multiple boarding dogs, one Club pickup",
      start: "Fitdog Club (Fitdog) x3",
      finish: "Club x2, home x1",
      stops: stopSummary(day.stops).join(", "),
      csv: "One Club pickup row listing 3 dogs"
    });
  }

  // 11. Owner-managed Sport Sign-Up: no Fitdog home transportation.
  {
    const day = await runDay([
      dayBooking({
        id: "s11",
        dog: "Ziggy",
        ownerLast: "Moreno",
        street: "1408 Princeton St",
        service: "Sport Sign Ups",
        options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Owner Pick Up @ Fitdog Club"]
      })
    ]);
    const dog = day.dog("Ziggy");
    assert.equal(dog.transportPlan.filters.ownerManaged, true);
    assert.equal(dog.pickup, false);
    assert.equal(dog.dropoff, false);
    assert.ok(day.stopsFor("Ziggy").every((stop) => stop.locationType === "FITDOG_CLUB"));
    assert.ok(!day.rows.some((row) => /TO HOME|FROM HOME/.test(row.stopName)), "no home rows");
    assert.equal(customerRows(day.rows).length, 0, "the Club van's own start / end rows carry Ziggy");
    record(11, "Owner-managed Sport Sign-Up", day, "Ziggy", "No home rows; Ziggy listed on the Club start / end rows");
  }

  // 12. Group Class dog picked up from home by Fitdog.
  {
    const day = await runDay([
      dayBooking({
        id: "s12",
        dog: "Nala",
        ownerLast: "Nguyen",
        street: "2633 Kansas Ave",
        service: "Cool Tricks | Group Training - Business Only",
        options: ["Before Outing - Fitdog to Pick Up @ Home", "After Outing - Owner Pick Up @ Fitdog Club"]
      })
    ]);
    const dog = day.dog("Nala");
    assert.equal(dog.routeVanKey, "van_5");
    assert.deepEqual(stopSummary(day.stopsFor("Nala")), ["van_5:HOME_PICKUP", "van_5:CLUB_DROPOFF"]);
    const pick = routeRows(day.rows, "Van 05", "pickup");
    assert.deepEqual(pick.map((row) => row.stopName), ["Fitdog Club", "Nala (Pat N.) - PICK UP FROM HOME", "Fitdog Club"]);
    assert.equal(day.result.ok && day.result.pickupTrackingStops.length, 1, "home pickup gets owner live tracking");
    record(12, "Group Class with Fitdog home pickup", day, "Nala", "Home pickup row on Van 5; return on the Club end row");
  }

  // 13. Missing, ambiguous, or conflicting options are flagged and never guessed.
  {
    const day = await runDay([
      dayBooking({ id: "s13a", dog: "Blank", ownerLast: "Owens", street: "100 Wilshire Blvd", service: "Adventure Hike", van: "Van 1", options: [] }),
      dayBooking({
        id: "s13b",
        dog: "Clash",
        ownerLast: "Price",
        street: "200 Wilshire Blvd",
        service: "Adventure Hike",
        van: "Van 1",
        options: [
          "Before Outing - Fitdog to Pick Up @ Home",
          "Before Outing - Owner To Drop Off @ Fitdog Club",
          "After Outing - Fitdog to Drop Off @ Home"
        ]
      }),
      dayBooking({
        id: "s13c",
        dog: "Vague",
        ownerLast: "Quinn",
        street: "300 Wilshire Blvd",
        service: "Beach Excursion",
        van: "Van 2",
        options: ["Drop Off @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"]
      }),
      dayBooking({
        id: "s13d",
        dog: "Backward",
        ownerLast: "Reed",
        street: "400 Wilshire Blvd",
        service: "Beach Excursion",
        van: "Van 2",
        options: ["Before Outing - Fitdog to Drop Off @ Home", "After Outing - Owner Pick Up @ Fitdog Club"]
      }),
      boardingStay({
        id: "s13e",
        dog: "Undated",
        ownerLast: "Shaw",
        street: "500 Wilshire Blvd",
        activity: "Adventure Hike",
        van: "Van 1",
        options: ["After Outing - Fitdog to Drop Off @ Home"],
        extraActivityDates: ["2026-11-19"]
      })
    ]);
    const issuesOf = (name: string) => day.dog(name).transportPlan.issues;
    for (const name of ["Blank", "Clash", "Vague", "Backward", "Undated"]) {
      assert.equal(day.dog(name).transportPlan.status, "NEEDS_REVIEW", `${name} is flagged`);
    }
    assert.deepEqual(issuesOf("Blank"), [
      "No Before Outing, After Outing, or Boarding option on this booking, so the starting location and final destination are unknown."
    ]);
    assert.deepEqual(issuesOf("Clash"), [
      "Before Outing options conflict: Before Outing - Fitdog to Pick Up @ Home vs. Before Outing - Owner To Drop Off @ Fitdog Club."
    ]);
    assert.deepEqual(issuesOf("Vague"), ['"Drop Off @ Fitdog Club" does not say whether the owner or Fitdog is responsible.']);
    assert.deepEqual(issuesOf("Backward"), [
      '"Before Outing - Fitdog to Drop Off @ Home" puts a Fitdog drop-off before the outing.'
    ]);
    assert.deepEqual(issuesOf("Undated"), [
      '"After Outing - Fitdog to Drop Off @ Home" has no date, and this stay has activities on 2 days.'
    ]);

    assert.deepEqual(stopSummary(day.stopsFor("Blank")), [], "nothing guessed for a booking with no options");
    assert.deepEqual(stopSummary(day.stopsFor("Clash")), ["van_1:HOME_DROPOFF"], "only the decided end is routed");
    assert.deepEqual(stopSummary(day.stopsFor("Vague")), ["van_2:HOME_DROPOFF"]);
    assert.deepEqual(stopSummary(day.stopsFor("Backward")), ["van_2:CLUB_DROPOFF"]);
    assert.deepEqual(
      stopSummary(day.stopsFor("Undated")),
      ["van_1:CLUB_PICKUP"],
      "the boarding start stands; the undated drop-off is held for review"
    );
    assert.ok(day.result.ok);
    assert.deepEqual(
      (day.result.ok ? day.result.summary.reviewDogs : []).map((d) => d.dogName).sort(),
      ["Backward", "Blank", "Clash", "Undated", "Vague"],
      "the export summary names every flagged dog"
    );
    assert.ok(!day.rows.some((row) => row.stopName.startsWith("Blank")));
    results.push({
      n: 13,
      title: "Missing / conflicting options flagged",
      start: "unknown for Blank, Clash, Vague, Backward",
      finish: "unknown for Blank, Undated",
      stops: "decided ends only",
      csv: "5 dogs in summary.reviewDogs; no guessed rows"
    });
  }

  // Whole day: every scenario on one schedule, exported together.
  {
    nextAnimal = 80100;
    const all = [
      dayBooking({ id: "d1", dog: "Biscuit", ownerLast: "Alvarez", street: "1201 Pearl St", service: "Adventure Hike", van: "Van 1", options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"] }),
      dayBooking({ id: "d2", dog: "Mochi", ownerLast: "Bishop", street: "2210 Ocean Park Blvd", service: "Beach Excursion", van: "Van 2", options: ["Before Outing - Fitdog to Pick Up @ Home", "After Outing - Owner Pick Up @ Fitdog Club"] }),
      dayBooking({ id: "d4", dog: "Rocket", ownerLast: "Dunn", street: "740 Bay St", service: "Adventure Hike", van: "Van 1", options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Owner Pick Up @ Fitdog Club"] }),
      boardingStay({ id: "d5", dog: "Juniper", ownerLast: "Ellis", street: "1530 Euclid St", activity: "Adventure Hike", van: "Van 1", options: ["Boarding @ Fitdog Club"] }),
      boardingStay({ id: "d6", dog: "Maple", ownerLast: "Foster", street: "2400 Main St", activity: "Adventure Hike", van: "Van 1", options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"] }),
      boardingStay({ id: "d7", dog: "Oakley", ownerLast: "Garcia", street: "1022 Pico Blvd", activity: "Leash Manners | Group Training - Business Only", van: "Van 5", options: ["Boarding @ Fitdog Club", "After Outing - Fitdog to Drop Off @ Home"] }),
      dayBooking({ id: "d11", dog: "Ziggy", ownerLast: "Moreno", street: "1408 Princeton St", service: "Sport Sign Ups", options: ["Before Outing - Owner To Drop Off @ Fitdog Club", "After Outing - Owner Pick Up @ Fitdog Club"] }),
      dayBooking({ id: "d12", dog: "Nala", ownerLast: "Nguyen", street: "2633 Kansas Ave", service: "Cool Tricks | Group Training - Business Only", options: ["Before Outing - Fitdog to Pick Up @ Home", "After Outing - Owner Pick Up @ Fitdog Club"] })
    ];
    const day = await runDay(all);
    assert.ok(day.result.ok, "the full day exports");
    if (!day.result.ok) return;
    assert.equal(day.result.summary.reviewDogs.length, 0);
    const van1ClubPickups = day.stops.filter((stop) => stop.routeVanKey === "van_1" && stop.stopType === "CLUB_PICKUP");
    assert.equal(van1ClubPickups.length, 1, "Van 1 visits the Club once on its pickup run");
    assert.deepEqual(van1ClubPickups[0]!.dogs.map((entry) => entry.dogName), ["Biscuit", "Juniper", "Maple", "Rocket"]);
    const van1ClubReturns = day.stops.filter((stop) => stop.routeVanKey === "van_1" && stop.stopType === "CLUB_DROPOFF");
    assert.deepEqual(van1ClubReturns[0]!.dogs.map((entry) => entry.dogName), ["Juniper", "Rocket"]);
    for (const van of ["Van 01", "Van 02", "Van 05"]) {
      for (const direction of ["pickup", "dropoff"] as const) {
        const route = routeRows(day.rows, van, direction);
        if (!route.length) continue;
        const clubRows = route.filter((row) => row.stopName === "Fitdog Club" && !isFacilityBookendRow(row));
        assert.ok(clubRows.length <= 1, `${van} ${direction}: the Club appears at most once as a stop`);
        assert.ok(route.length >= 2, `${van} ${direction}: Samsara needs at least two stops`);
      }
    }
    if (PRINT) {
      console.log("\nGenerated Samsara rows for the whole day:");
      for (const row of day.rows) {
        console.log(
          [row.vehicleName, /pick/i.test(row.routeName) ? "pickup " : "dropoff", String(row.stopOrder).padStart(2), row.stopName, "|", row.stopNotes.slice(0, 150)].join(" ")
        );
      }
    }
    results.push({
      n: 0,
      title: "Whole day, all scenarios together",
      start: "-",
      finish: "-",
      stops: `${day.stops.length} stops, ${day.result.summary.stopCount} routed`,
      csv: `${day.rows.length} rows across ${day.result.summary.routeCount} routes; CSV validation passed`
    });
  }

  console.log("\nScenario | Start | Final destination | Stops | Samsara rows");
  for (const r of results) {
    console.log(`${r.n ? String(r.n).padStart(2) : " *"}. ${r.title} | ${r.start} | ${r.finish} | ${r.stops} | ${r.csv} | PASS`);
  }
  console.log("\ntest-gingr-appointment-option-routes: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
