/**
 * Fitdog platform class sign-ups → Gingr Route Generator dogs.
 *
 * Outings, group classes, and taxi are booked on the Fitdog platform (class
 * occurrences), and many of those dogs never appear as Gingr reservations. Each
 * sign-up carries its own pickup and drop-off location: the owner's home (or a
 * custom address) is a Fitdog van leg; Fitdog Club makes the Club the dog's
 * transportation location, which the stop builder turns into a Club stop for
 * outings only.
 */

import {
  GINGR_ROUTE_ACTIVITY_BY_ID,
  isRouteQualifyingActivity,
  matchGingrRouteActivity,
  sortGingrRouteActivities,
  type GingrRouteActivityId
} from "@/lib/gingr-route-generator/activities";
import {
  sortRouteDogs,
  type GingrRouteAddressStatus,
  type GingrRouteDog
} from "@/lib/gingr-route-generator/normalize";
import type { GingrTransportationType } from "@/lib/gingr-route-generator/transportation";
import { resolveRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";
import { appointmentOptionLabel } from "@/lib/gingr-route-generator/transportation";
import type { FitdogClassSignup } from "@/lib/route-generator/fitdog-api";
import type { NormalizedReportItem } from "@/lib/route-generator/parser";

const CANONICAL_TO_ACTIVITY: Record<string, GingrRouteActivityId> = {
  "Adventure Hike": "adventure_hike",
  "Beach Excursion": "beach_excursion",
  "Trainer-Led Hike": "trainer_led_hike",
  "Group Class": "trainer_activity",
  "Taxi Service": "taxi"
};

function activityForClass(signup: FitdogClassSignup): GingrRouteActivityId | null {
  const matched = matchGingrRouteActivity(signup.className)?.id;
  const canonical = signup.pickup.serviceCanonical;
  const id = matched ?? (canonical ? CANONICAL_TO_ACTIVITY[canonical] : undefined) ?? null;
  return id && isRouteQualifyingActivity(id) ? id : null;
}

type LegKind = "home" | "club" | null;

function legKind(item: NormalizedReportItem): LegKind {
  const type = item.locationType;
  if (type === "FITDOG" || type === "HUB") return "club";
  if (type === "HOME") return "home";
  if (type === "CUSTOM" && (item.addressStreet || item.addressRaw)) return "home";
  return null;
}

function addressStatusOf(item: NormalizedReportItem): GingrRouteAddressStatus {
  const hasStreet = Boolean(item.addressStreet);
  const hasLocality = Boolean(item.addressCity || item.addressZip);
  if (hasStreet && hasLocality) return "ok";
  if (hasStreet || hasLocality) return "incomplete";
  return "missing";
}

function fullAddress(item: NormalizedReportItem): string | null {
  if (addressStatusOf(item) !== "ok") return null;
  const street = [item.addressStreet, item.addressUnit].filter(Boolean).join(", ");
  const locality = [item.addressCity, [item.addressState, item.addressZip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [street, locality, "USA"].filter(Boolean).join(", ");
}

function ownerDisplay(item: NormalizedReportItem): string {
  const first = item.ownerFirstName || "";
  const last = item.ownerLastName || "";
  if (first && last) return `${first} ${last.charAt(0)}.`;
  return first || last || item.ownerFullName || "Owner";
}

function scheduledIso(date: string, time: string | null): string | null {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return null;
  const [h, m] = time.split(":");
  return `${date}T${h!.padStart(2, "0")}:${m!.slice(0, 2)}:00`;
}

function timeLabel(iso: string | null): string | null {
  const m = iso?.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

function nameKey(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Dog name + owner last name — Fitdog and Gingr use different dog ids. */
export function routeDogMatchKey(dog: { name: string; ownerLastName: string | null }): string | null {
  const name = nameKey(dog.name);
  const last = nameKey(dog.ownerLastName);
  return name && last ? `${name}|${last}` : null;
}

function withAddress(dog: GingrRouteDog, item: NormalizedReportItem): void {
  dog.homeAddress = fullAddress(item);
  dog.homeStreet1 = item.addressStreet;
  dog.homeStreet2 = item.addressUnit;
  dog.homeCity = item.addressCity;
  dog.homeState = item.addressState;
  dog.homePostalCode = item.addressZip;
  dog.addressStatus = addressStatusOf(item);
}

export function fitdogSignupsToRouteDogs(signups: FitdogClassSignup[], date: string): GingrRouteDog[] {
  const byDog = new Map<string, GingrRouteDog>();
  const activitySets = new Map<string, Set<GingrRouteActivityId>>();

  for (const signup of signups) {
    const activity = activityForClass(signup);
    if (!activity) continue;
    const { pickup, dropoff } = signup;
    const name = (pickup.dogName || "").trim();
    if (!name) continue;
    const key = pickup.dogId ? `fitdog:${pickup.dogId}` : `fitdog:${nameKey(name)}|${nameKey(pickup.ownerLastName)}`;

    let dog = byDog.get(key);
    if (!dog) {
      dog = {
        id: key,
        animalId: null,
        name,
        owner: ownerDisplay(pickup),
        imageUrl: null,
        activities: [],
        activityLabels: [],
        pickup: false,
        dropoff: false,
        pickupDestination: null,
        dropoffDestination: null,
        startLocation: "club",
        endLocation: "club",
        clubTransportLocation: false,
        ownerClubDropoff: false,
        ownerClubPickup: false,
        returnToClub: false,
        isTaxi: false,
        assignedTo: null,
        routeVanKey: "van_5",
        ownerLastName: pickup.ownerLastName,
        alreadyOnProperty: false,
        transportationTypes: [],
        scheduledTime: null,
        scheduledTimeLabel: null,
        notes: pickup.reservationNotes,
        pickupInstructions: pickup.driverNotes,
        reservationIds: [],
        homeAddress: null,
        homeStreet1: null,
        homeStreet2: null,
        homeCity: null,
        homeState: null,
        homePostalCode: null,
        ownerPhone: pickup.raw?.phone || null,
        ownerFullName: pickup.ownerFullName,
        addressStatus: "ok",
        appointmentOptions: []
      };
      byDog.set(key, dog);
      activitySets.set(key, new Set());
    }
    activitySets.get(key)!.add(activity);

    const types = new Set<GingrTransportationType>(dog.transportationTypes);
    const pickupKind = legKind(pickup);
    const dropoffKind = legKind(dropoff);
    if (pickupKind === "home") {
      dog.pickup = true;
      dog.pickupDestination = "home";
      dog.startLocation = "home";
      types.add(activity === "taxi" ? "TAXI" : "FITDOG_HOME_PICKUP");
      withAddress(dog, pickup);
    }
    if (dropoffKind === "home") {
      dog.dropoff = true;
      dog.dropoffDestination = "home";
      dog.endLocation = "home";
      types.add(activity === "taxi" ? "TAXI" : "FITDOG_HOME_DROPOFF");
      if (!dog.pickup || dog.addressStatus !== "ok") withAddress(dog, dropoff);
    }
    if (pickupKind === "club") {
      dog.ownerClubDropoff = true;
      dog.clubTransportLocation = true;
    }
    if (dropoffKind === "club") {
      dog.ownerClubPickup = true;
      dog.returnToClub = true;
      dog.clubTransportLocation = true;
    }
    if (activity === "taxi") dog.isTaxi = true;
    dog.transportationTypes = Array.from(types);
    for (const raw of [
      pickupKind === "home" ? "Fitdog to Pick Up @ Home" : pickupKind === "club" ? "Owner Drop Off | Fitdog Club" : null,
      dropoffKind === "home" ? "Fitdog to Drop Off @ Home" : dropoffKind === "club" ? "Owner Pick Up | Fitdog Club" : null
    ]) {
      const label = raw ? appointmentOptionLabel(raw) : null;
      if (label && !dog.appointmentOptions.includes(label)) dog.appointmentOptions.push(label);
    }

    const time = scheduledIso(date, pickup.timeWindowStart);
    if (time && (!dog.scheduledTime || time < dog.scheduledTime)) {
      dog.scheduledTime = time;
      dog.scheduledTimeLabel = timeLabel(time);
    }
  }

  const dogs = Array.from(byDog.values());
  for (const dog of dogs) {
    dog.activities = sortGingrRouteActivities(activitySets.get(dog.id)!);
    dog.activityLabels = dog.activities.map((id) => GINGR_ROUTE_ACTIVITY_BY_ID[id].label);
    dog.routeVanKey = resolveRouteVanKey({ assignedLabels: [], isTaxi: dog.isTaxi, activities: dog.activities });
    if (!dog.pickup && !dog.dropoff) dog.addressStatus = "ok";
  }
  return dogs;
}

/**
 * Merge Fitdog sign-up dogs into the Gingr dogs. A dog on both merges into the
 * Gingr record (keeping its photo, van assignment, and Gingr add-ons) and gains
 * the Fitdog activities and legs; everyone else is added as-is.
 */
export function mergeFitdogRouteDogs(gingrDogs: GingrRouteDog[], fitdogDogs: GingrRouteDog[]): GingrRouteDog[] {
  const merged = gingrDogs.map((dog) => ({ ...dog }));
  const byKey = new Map<string, GingrRouteDog>();
  for (const dog of merged) {
    const key = routeDogMatchKey(dog);
    if (key && !byKey.has(key)) byKey.set(key, dog);
  }

  for (const src of fitdogDogs) {
    const key = routeDogMatchKey(src);
    const target = key ? byKey.get(key) : undefined;
    if (!target) {
      merged.push({ ...src });
      if (key) byKey.set(key, merged[merged.length - 1]!);
      continue;
    }

    target.activities = sortGingrRouteActivities([...target.activities, ...src.activities]);
    target.activityLabels = target.activities.map((id) => GINGR_ROUTE_ACTIVITY_BY_ID[id].label);
    const needsAddress = (src.pickup && !target.pickup) || (src.dropoff && !target.dropoff);
    if (needsAddress && target.addressStatus !== "ok") {
      target.homeAddress = src.homeAddress;
      target.homeStreet1 = src.homeStreet1;
      target.homeStreet2 = src.homeStreet2;
      target.homeCity = src.homeCity;
      target.homeState = src.homeState;
      target.homePostalCode = src.homePostalCode;
      target.addressStatus = src.addressStatus;
    }
    if (src.pickup && !target.pickup) {
      target.pickup = true;
      target.pickupDestination = "home";
      target.startLocation = "home";
    }
    if (src.dropoff && !target.dropoff) {
      target.dropoff = true;
      target.dropoffDestination = "home";
      target.endLocation = "home";
    }
    target.clubTransportLocation = target.clubTransportLocation || src.clubTransportLocation;
    target.isTaxi = target.isTaxi || src.isTaxi;
    target.transportationTypes = Array.from(new Set([...target.transportationTypes, ...src.transportationTypes]));
    target.appointmentOptions = Array.from(new Set([...(target.appointmentOptions || []), ...(src.appointmentOptions || [])]));
    if (src.scheduledTime && (!target.scheduledTime || src.scheduledTime < target.scheduledTime)) {
      target.scheduledTime = src.scheduledTime;
      target.scheduledTimeLabel = src.scheduledTimeLabel;
    }
    target.notes = target.notes || src.notes;
    target.pickupInstructions = target.pickupInstructions || src.pickupInstructions;
    target.ownerPhone = target.ownerPhone || src.ownerPhone;
    target.routeVanKey = resolveRouteVanKey({
      assignedLabels: target.assignedTo ? [target.assignedTo] : [],
      isTaxi: target.isTaxi,
      activities: target.activities
    });
  }

  return sortRouteDogs(merged);
}
