/**
 * Build van stops for every scheduled Gingr Route dog.
 * Home addons/taxis use the owner address. Boarding and club addons use Fitdog Club.
 */

import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import { clubPassengerNote, type GingrRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";

export type TransportationKind = "PICK_UP" | "DROP_OFF";

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
  destination: "home" | "club";
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
  destination: "home" | "club"
): TransportationStop {
  const club = destination === "club" ? clubAddressParts() : null;
  const fingerprint = destination === "club" ? "fitdog-club" : addressFingerprint(dog);
  const passenger = clubPassengerNote(dog.name, dog.ownerLastName);
  const clubNotes = destination === "club" ? passenger : null;
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
    routeVanKey: dog.routeVanKey,
    activityLabels: [...dog.activityLabels],
    scheduledTime: dog.scheduledTime,
    notes:
      [
        clubNotes,
        dog.pickupInstructions ? `Pick Up Instructions: ${dog.pickupInstructions}` : null,
        destination === "home" ? dog.notes : null
      ]
        .filter(Boolean)
        .join(" | ") || null,
    homeAddress: club?.homeAddress ?? dog.homeAddress,
    homeStreet1: club?.homeStreet1 ?? dog.homeStreet1,
    homeStreet2: club?.homeStreet2 ?? dog.homeStreet2,
    homeCity: club?.homeCity ?? dog.homeCity,
    homeState: club?.homeState ?? dog.homeState,
    homePostalCode: club?.homePostalCode ?? dog.homePostalCode,
    addressStatus: destination === "club" ? "ok" : dog.addressStatus
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
  if (a.routeVanKey !== b.routeVanKey) return a.routeVanKey.localeCompare(b.routeVanKey);
  if (a.kind !== b.kind) return a.kind === "PICK_UP" ? -1 : 1;
  if (a.destination !== b.destination) return a.destination === "home" ? -1 : 1;
  const ta = a.scheduledTime || "99";
  const tb = b.scheduledTime || "99";
  if (ta !== tb) return ta.localeCompare(tb);
  return a.dogName.localeCompare(b.dogName);
}

export function buildTransportationStops(
  dogs: GingrRouteDog[],
  date: string
): TransportationStopBuildResult {
  const byKey = new Map<string, TransportationStop>();

  for (const dog of dogs) {
    const pickupDest = dog.pickup ? dog.pickupDestination : null;
    const dropoffDest = dog.dropoff ? dog.dropoffDestination : dog.returnToClub ? "club" : null;

    if (dog.pickup && pickupDest) {
      const stop = makeStop(date, dog, "PICK_UP", pickupDest);
      const existing = byKey.get(stop.key);
      if (!existing) byKey.set(stop.key, stop);
      else mergeActivityLabels(existing, stop);
    }
    if ((dog.dropoff || dog.returnToClub) && dropoffDest) {
      const stop = makeStop(date, dog, "DROP_OFF", dropoffDest);
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
  if (stop.destination === "club") return "Fitdog Club";
  const kindLabel = stop.kind === "PICK_UP" ? "PICK UP FROM HOME" : "DROP OFF TO HOME";
  const owner = stop.ownerName ? ` (${stop.ownerName})` : "";
  return `${stop.dogName}${owner} - ${kindLabel}`;
}
