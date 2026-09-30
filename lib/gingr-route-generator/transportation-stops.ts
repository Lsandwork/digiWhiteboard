/**
 * Build van stops for every scheduled Gingr Route dog.
 *
 * Fitdog to Pick Up / Drop Off @ Home use the owner address.
 * Boarding @ Fitdog Club makes Fitdog Club the stop location — the day's
 * activities decide whether the Club is the pickup or the drop-off.
 */

import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import { dogHasOffsiteActivity } from "@/lib/gingr-route-generator/activities";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import type { GingrTransportationType } from "@/lib/gingr-route-generator/transportation";
import { clubPassengerNote, type GingrRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";

export type TransportationKind = "PICK_UP" | "DROP_OFF";

export type TransportationLocationType = "OWNER_HOME" | "FITDOG_CLUB";

export type TransportationStop = {
  /** Stable dedupe key: date|dogId|kind|addressFingerprint */
  key: string;
  date: string;
  dogId: string;
  animalId: number | null;
  dogName: string;
  ownerName: string;
  ownerFullName: string | null;
  ownerPhone: string | null;
  kind: TransportationKind;
  /** Kept for the Samsara exporter: "home" = owner address, "club" = Fitdog Club. */
  destination: "home" | "club";
  locationType: TransportationLocationType;
  locationLabel: string;
  /** Gingr transportation option that created this stop. */
  transportOption: GingrTransportationType | null;
  routeVanKey?: GingrRouteVanKey;
  activityLabels: string[];
  scheduledTime: string | null;
  notes: string | null;
  homeAddress: string | null;
  homeStreet1: string | null;
  homeStreet2: string | null;
  homeCity: string | null;
  homeState: string | null;
  homePostalCode: string | null;
  addressStatus: "ok" | "missing" | "incomplete";
};

export type TransportationStopBuildResult = {
  stops: TransportationStop[];
  exportable: TransportationStop[];
  missingAddress: TransportationStop[];
  pickupCount: number;
  dropoffCount: number;
};

function addressFingerprint(dog: GingrRouteDog): string {
  const parts = [
    dog.homeStreet1,
    dog.homeStreet2,
    dog.homeCity,
    dog.homeState,
    dog.homePostalCode,
    dog.homeAddress
  ]
    .map((p) => String(p || "").trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  return parts.join("|") || "no-address";
}

export function fitdogClubStopAddress(): string {
  return DEFAULT_FITDOG_LOCATIONS.club.address;
}

function clubAddressParts() {
  return {
    homeAddress: DEFAULT_FITDOG_LOCATIONS.club.address,
    homeStreet1: "1712 21st St",
    homeStreet2: null as string | null,
    homeCity: "Santa Monica",
    homeState: "CA",
    homePostalCode: "90404"
  };
}

function makeStop(
  date: string,
  dog: GingrRouteDog,
  kind: TransportationKind,
  locationType: TransportationLocationType,
  transportOption: GingrTransportationType | null
): TransportationStop {
  const destination = locationType === "FITDOG_CLUB" ? "club" : "home";
  const club = locationType === "FITDOG_CLUB" ? clubAddressParts() : null;
  const fingerprint = locationType === "FITDOG_CLUB" ? "fitdog-club" : addressFingerprint(dog);
  const passenger = clubPassengerNote(dog.name, dog.ownerLastName);
  const clubNotes = locationType === "FITDOG_CLUB" ? passenger : null;
  return {
    key: `${date}|${dog.id}|${kind}|${fingerprint}`,
    date,
    dogId: dog.id,
    animalId: dog.animalId,
    dogName: dog.name,
    ownerName: dog.owner,
    ownerFullName: dog.ownerFullName,
    ownerPhone: dog.ownerPhone,
    kind,
    destination,
    locationType,
    locationLabel: locationType === "FITDOG_CLUB" ? DEFAULT_FITDOG_LOCATIONS.club.name : "Owner Home",
    transportOption,
    routeVanKey: dog.routeVanKey,
    activityLabels: [...dog.activityLabels],
    scheduledTime: dog.scheduledTime,
    notes:
      [
        clubNotes,
        dog.pickupInstructions ? `Pick Up Instructions: ${dog.pickupInstructions}` : null,
        locationType === "OWNER_HOME" ? dog.notes : null
      ]
        .filter(Boolean)
        .join(" | ") || null,
    homeAddress: club?.homeAddress ?? dog.homeAddress,
    homeStreet1: club?.homeStreet1 ?? dog.homeStreet1,
    homeStreet2: club?.homeStreet2 ?? dog.homeStreet2,
    homeCity: club?.homeCity ?? dog.homeCity,
    homeState: club?.homeState ?? dog.homeState,
    homePostalCode: club?.homePostalCode ?? dog.homePostalCode,
    addressStatus: locationType === "FITDOG_CLUB" ? "ok" : dog.addressStatus
  };
}

function mergeActivityLabels(target: TransportationStop, incoming: TransportationStop) {
  const set = new Set([...target.activityLabels, ...incoming.activityLabels]);
  target.activityLabels = Array.from(set);
  if (incoming.notes) {
    if (!target.notes) target.notes = incoming.notes;
    else if (!target.notes.includes(incoming.notes)) {
      target.notes = `${target.notes} | ${incoming.notes}`;
    }
  }
  if (!target.scheduledTime && incoming.scheduledTime) {
    target.scheduledTime = incoming.scheduledTime;
  }
  if (!target.ownerPhone && incoming.ownerPhone) target.ownerPhone = incoming.ownerPhone;
}

function compareStops(a: TransportationStop, b: TransportationStop): number {
  const vanA = a.routeVanKey || "";
  const vanB = b.routeVanKey || "";
  if (vanA !== vanB) return vanA.localeCompare(vanB);
  if (a.kind !== b.kind) return a.kind === "PICK_UP" ? -1 : 1;
  if (a.destination !== b.destination) return a.destination === "home" ? -1 : 1;
  const ta = a.scheduledTime || "99";
  const tb = b.scheduledTime || "99";
  if (ta !== tb) return ta.localeCompare(tb);
  return a.dogName.localeCompare(b.dogName);
}

/**
 * Where the dog joins and leaves the Fitdog van for this route date.
 *
 * Home legs come only from the Fitdog @ Home options (or a dated taxi).
 *
 * Fitdog Club is the stop location for the outbound leg of an offsite activity
 * whenever the dog is already at the Club — boarding or dropped off by the owner
 * (Club → Hike / Beach). The return leg belongs to the Club only when the dog
 * is boarding there (Hike / Beach → Club); Owner Pick Up | Fitdog Club stays
 * owner-operated and never becomes a van stop.
 */
export function resolveStopPlan(dog: GingrRouteDog): {
  pickup: { locationType: TransportationLocationType; option: GingrTransportationType | null } | null;
  dropoff: { locationType: TransportationLocationType; option: GingrTransportationType | null } | null;
} {
  const homePickup = dog.pickup && dog.pickupDestination === "home";
  const homeDropoff = dog.dropoff && dog.dropoffDestination === "home";
  const offsite = dogHasOffsiteActivity(dog.activities);
  const clubPickup = offsite && (dog.clubTransportLocation || dog.ownerClubDropoff);
  const clubDropoff = offsite && dog.clubTransportLocation;

  return {
    pickup: homePickup
      ? { locationType: "OWNER_HOME", option: dog.isTaxi ? "TAXI" : "FITDOG_HOME_PICKUP" }
      : clubPickup
        ? {
            locationType: "FITDOG_CLUB",
            option: dog.clubTransportLocation ? "BOARDING_CLUB" : "OWNER_CLUB_DROPOFF"
          }
        : null,
    dropoff: homeDropoff
      ? { locationType: "OWNER_HOME", option: dog.isTaxi ? "TAXI" : "FITDOG_HOME_DROPOFF" }
      : clubDropoff
        ? { locationType: "FITDOG_CLUB", option: "BOARDING_CLUB" }
        : null
  };
}

export function buildTransportationStops(
  dogs: GingrRouteDog[],
  date: string
): TransportationStopBuildResult {
  const byKey = new Map<string, TransportationStop>();

  for (const dog of dogs) {
    const plan = resolveStopPlan(dog);
    for (const [kind, leg] of [
      ["PICK_UP", plan.pickup],
      ["DROP_OFF", plan.dropoff]
    ] as const) {
      if (!leg) continue;
      const stop = makeStop(date, dog, kind, leg.locationType, leg.option);
      const existing = byKey.get(stop.key);
      if (!existing) byKey.set(stop.key, stop);
      else mergeActivityLabels(existing, stop);
    }
  }

  const stops = Array.from(byKey.values()).sort(compareStops);
  const exportable = stops.filter((s) => s.addressStatus === "ok" && Boolean(s.homeAddress));
  const missingAddress = stops.filter((s) => s.addressStatus !== "ok" || !s.homeAddress);

  return {
    stops,
    exportable,
    missingAddress,
    pickupCount: stops.filter((s) => s.kind === "PICK_UP").length,
    dropoffCount: stops.filter((s) => s.kind === "DROP_OFF").length
  };
}

export function stopDisplayName(stop: TransportationStop): string {
  if (stop.locationType === "FITDOG_CLUB") return DEFAULT_FITDOG_LOCATIONS.club.name;
  const kindLabel = stop.kind === "PICK_UP" ? "PICK UP FROM HOME" : "DROP OFF TO HOME";
  const owner = stop.ownerName ? ` (${stop.ownerName})` : "";
  return `${stop.dogName}${owner} - ${kindLabel}`;
}
