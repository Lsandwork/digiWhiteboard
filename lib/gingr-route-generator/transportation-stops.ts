/**
 * Build FitDog home-transportation stops from normalized Gingr Route dogs.
 *
 * Only Pick Up (FROM HOME) and Drop Off (TO HOME) create stops.
 * Owner-transport dogs (no pickup/dropoff badges) are excluded.
 */

import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";

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
  /** All transportation intents (including missing-address). */
  stops: TransportationStop[];
  /** Stops with a usable home address (export candidates). */
  exportable: TransportationStop[];
  /** Stops excluded because the home address is missing/incomplete. */
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

function makeStop(
  date: string,
  dog: GingrRouteDog,
  kind: TransportationKind
): TransportationStop {
  const fingerprint = addressFingerprint(dog);
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
    activityLabels: [...dog.activityLabels],
    scheduledTime: dog.scheduledTime,
    notes: dog.notes,
    homeAddress: dog.homeAddress,
    homeStreet1: dog.homeStreet1,
    homeStreet2: dog.homeStreet2,
    homeCity: dog.homeCity,
    homeState: dog.homeState,
    homePostalCode: dog.homePostalCode,
    addressStatus: dog.addressStatus
  };
}

function mergeActivityLabels(target: TransportationStop, incoming: TransportationStop) {
  const set = new Set([...target.activityLabels, ...incoming.activityLabels]);
  target.activityLabels = Array.from(set);
  if (!target.notes && incoming.notes) target.notes = incoming.notes;
  if (!target.scheduledTime && incoming.scheduledTime) {
    target.scheduledTime = incoming.scheduledTime;
  }
  if (!target.ownerPhone && incoming.ownerPhone) target.ownerPhone = incoming.ownerPhone;
}

function compareStops(a: TransportationStop, b: TransportationStop): number {
  if (a.kind !== b.kind) return a.kind === "PICK_UP" ? -1 : 1;
  const ta = a.scheduledTime || "99";
  const tb = b.scheduledTime || "99";
  if (ta !== tb) return ta.localeCompare(tb);
  return a.dogName.localeCompare(b.dogName);
}

/**
 * Build deduplicated home-transportation stops for a schedule day.
 *
 * Dedup key: date + dog + transportation kind + address.
 * Multiple activities on the same dog still yield at most one Pick Up and one Drop Off
 * unless the address differs (rare split-household case).
 */
export function buildTransportationStops(
  dogs: GingrRouteDog[],
  date: string
): TransportationStopBuildResult {
  const byKey = new Map<string, TransportationStop>();

  for (const dog of dogs) {
    // Owner handles transport — never create a home route stop.
    if (!dog.pickup && !dog.dropoff) continue;

    if (dog.pickup) {
      const stop = makeStop(date, dog, "PICK_UP");
      const existing = byKey.get(stop.key);
      if (!existing) byKey.set(stop.key, stop);
      else mergeActivityLabels(existing, stop);
    }
    if (dog.dropoff) {
      const stop = makeStop(date, dog, "DROP_OFF");
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
  const kindLabel = stop.kind === "PICK_UP" ? "PICK UP FROM HOME" : "DROP OFF TO HOME";
  const owner = stop.ownerName ? ` (${stop.ownerName})` : "";
  return `${stop.dogName}${owner} - ${kindLabel}`;
}
