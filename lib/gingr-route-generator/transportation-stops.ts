/**
 * Build Fitdog driver stops from each dog's transport plan.
 *
 * A Fitdog home pick-up / drop-off is a stop at the owner's address. A dog that
 * starts or ends an activity day at Fitdog Club (boarding, or handed off there
 * by the owner) is picked up from / returned to the Club. Dogs that share a
 * van, a run, and a physical place share one stop, and each dog stays listed
 * on it with the option that put it there.
 */

import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";
import type { GingrRouteDog } from "@/lib/gingr-route-generator/normalize";
import type {
  GingrResponsibleParty,
  GingrTransportationType,
  GingrTransportEnd
} from "@/lib/gingr-route-generator/transportation";
import { clubPassengerNote, type GingrRouteVanKey } from "@/lib/gingr-route-generator/van-assignment";

export type TransportationKind = "PICK_UP" | "DROP_OFF";

export type TransportationLocationType = "OWNER_HOME" | "FITDOG_CLUB";

export type TransportationStopType = "HOME_PICKUP" | "HOME_DROPOFF" | "CLUB_PICKUP" | "CLUB_DROPOFF";

export type TransportationStopDog = {
  dogId: string;
  animalId: number | null;
  dogName: string;
  ownerName: string;
  ownerLastName: string | null;
  ownerFullName: string | null;
  ownerPhone: string | null;
  reservationIds: number[];
  activityLabels: string[];
  /** Appointment option (or rule) that puts the dog at this stop. */
  reason: string;
  /** Who hands the dog to the driver (pick-up) or receives it (drop-off), besides Fitdog staff. */
  handoffParty: GingrResponsibleParty;
  transportOption: GingrTransportationType | null;
  scheduledTime: string | null;
  /** Drop-off / pick-up instructions and client notes for this dog. */
  instructions: string | null;
};

export type TransportationStop = {
  /** Stable key for one physical stop: date|van|kind|place */
  key: string;
  date: string;
  stopType: TransportationStopType;
  /** Every dog served at this stop. */
  dogs: TransportationStopDog[];
  /** First dog's id; `dogs` lists everyone at the stop. */
  dogId: string;
  animalId: number | null;
  /** Every dog at the stop, e.g. "Scout & Maple". */
  dogName: string;
  ownerName: string;
  ownerFullName: string | null;
  ownerPhone: string | null;
  kind: TransportationKind;
  /** Kept for the Samsara exporter: "home" = owner address, "club" = Fitdog Club. */
  destination: "home" | "club";
  locationType: TransportationLocationType;
  locationLabel: string;
  /** Gingr transportation option that created this stop (first dog). */
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

export type TransportationReviewDog = {
  dogId: string;
  dogName: string;
  ownerName: string;
  issues: string[];
};

export type TransportationStopBuildResult = {
  stops: TransportationStop[];
  exportable: TransportationStop[];
  missingAddress: TransportationStop[];
  pickupCount: number;
  dropoffCount: number;
  /** Dogs whose options are missing or conflicting; their unknown ends get no stop. */
  reviewDogs: TransportationReviewDog[];
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

/** "Scout", "Scout & Maple", "Scout, Maple & Pepper". */
export function joinDogNames(names: string[]): string {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} & ${unique[unique.length - 1]}`;
}

function dogInstructions(dog: GingrRouteDog, locationType: TransportationLocationType): string | null {
  if (locationType === "FITDOG_CLUB") return null;
  return (
    [
      dog.dropoffInstructions ? `Drop-off Instructions: ${dog.dropoffInstructions}` : null,
      dog.pickupInstructions && dog.pickupInstructions !== dog.dropoffInstructions
        ? `Pick Up Instructions: ${dog.pickupInstructions}`
        : null,
      dog.notes
    ]
      .filter(Boolean)
      .join(" | ") || null
  );
}

function stopDog(
  dog: GingrRouteDog,
  end: GingrTransportEnd,
  locationType: TransportationLocationType
): TransportationStopDog {
  return {
    dogId: dog.id,
    animalId: dog.animalId,
    dogName: dog.name,
    ownerName: dog.owner,
    ownerLastName: dog.ownerLastName,
    ownerFullName: dog.ownerFullName,
    ownerPhone: dog.ownerPhone,
    reservationIds: [...dog.reservationIds],
    activityLabels: [...dog.activityLabels],
    reason: end.basis || (locationType === "FITDOG_CLUB" ? "Fitdog Club" : "Owner home"),
    handoffParty: end.responsibleParty,
    transportOption:
      dog.isTaxi && locationType === "OWNER_HOME"
        ? "TAXI"
        : end.transportationType === "UNKNOWN"
          ? null
          : end.transportationType,
    scheduledTime: dog.scheduledTime,
    instructions: dogInstructions(dog, locationType)
  };
}

/** Short reason for Club driver notes. */
function noteReason(entry: TransportationStopDog): string {
  const reason = entry.reason.toLowerCase();
  if (/boarding/.test(reason)) return "boarding";
  if (/owner/.test(reason) && /drop off/.test(reason)) return "owner drop-off at Club";
  if (/owner/.test(reason) && /pick up/.test(reason)) return "owner pick-up at Club";
  return entry.reason;
}

function composeStopNotes(stop: TransportationStop): string | null {
  if (stop.locationType === "FITDOG_CLUB") {
    return (
      stop.dogs
        .map((entry) => `${clubPassengerNote(entry.dogName, entry.ownerLastName)} (${noteReason(entry)})`)
        .join("; ") || null
    );
  }
  if (stop.dogs.length === 1) return stop.dogs[0]!.instructions;
  return (
    stop.dogs
      .filter((entry) => entry.instructions)
      .map((entry) => `${entry.dogName}: ${entry.instructions}`)
      .join(" | ") || null
  );
}

function refreshStopSummary(stop: TransportationStop): void {
  stop.dogs.sort((a, b) => a.dogName.localeCompare(b.dogName));
  const first = stop.dogs[0]!;
  stop.dogId = first.dogId;
  stop.animalId = first.animalId;
  stop.dogName = joinDogNames(stop.dogs.map((entry) => entry.dogName));
  stop.ownerName = Array.from(new Set(stop.dogs.map((entry) => entry.ownerName).filter(Boolean))).join(" / ");
  stop.ownerFullName = stop.dogs.find((entry) => entry.ownerFullName)?.ownerFullName ?? null;
  stop.ownerPhone = stop.dogs.find((entry) => entry.ownerPhone)?.ownerPhone ?? null;
  stop.transportOption = first.transportOption;
  stop.activityLabels = Array.from(new Set(stop.dogs.flatMap((entry) => entry.activityLabels)));
  const times = stop.dogs.map((entry) => entry.scheduledTime).filter((t): t is string => Boolean(t)).sort();
  stop.scheduledTime = times[0] ?? null;
  stop.notes = composeStopNotes(stop);
}

function makeStop(
  key: string,
  date: string,
  dog: GingrRouteDog,
  kind: TransportationKind,
  stopType: TransportationStopType
): TransportationStop {
  const locationType: TransportationLocationType =
    stopType === "CLUB_PICKUP" || stopType === "CLUB_DROPOFF" ? "FITDOG_CLUB" : "OWNER_HOME";
  const club = locationType === "FITDOG_CLUB" ? clubAddressParts() : null;
  return {
    key,
    date,
    stopType,
    dogs: [],
    dogId: dog.id,
    animalId: dog.animalId,
    dogName: dog.name,
    ownerName: dog.owner,
    ownerFullName: dog.ownerFullName,
    ownerPhone: dog.ownerPhone,
    kind,
    destination: locationType === "FITDOG_CLUB" ? "club" : "home",
    locationType,
    locationLabel: locationType === "FITDOG_CLUB" ? DEFAULT_FITDOG_LOCATIONS.club.name : "Owner Home",
    transportOption: null,
    routeVanKey: dog.routeVanKey,
    activityLabels: [],
    scheduledTime: null,
    notes: null,
    homeAddress: club?.homeAddress ?? dog.homeAddress,
    homeStreet1: club?.homeStreet1 ?? dog.homeStreet1,
    homeStreet2: club?.homeStreet2 ?? dog.homeStreet2,
    homeCity: club?.homeCity ?? dog.homeCity,
    homeState: club?.homeState ?? dog.homeState,
    homePostalCode: club?.homePostalCode ?? dog.homePostalCode,
    addressStatus: locationType === "FITDOG_CLUB" ? "ok" : dog.addressStatus
  };
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

export function buildTransportationStops(
  dogs: GingrRouteDog[],
  date: string
): TransportationStopBuildResult {
  const byKey = new Map<string, TransportationStop>();
  const reviewDogs: TransportationReviewDog[] = [];

  for (const dog of dogs) {
    const plan = dog.transportPlan;
    if (plan.status === "NEEDS_REVIEW") {
      reviewDogs.push({ dogId: dog.id, dogName: dog.name, ownerName: dog.owner, issues: [...plan.issues] });
    }
    const legs = [
      ["PICK_UP", plan.pickupStopType, plan.startingLocation],
      ["DROP_OFF", plan.dropoffStopType, plan.finalDestination]
    ] as const;
    for (const [kind, stopType, end] of legs) {
      if (!stopType) continue;
      const atClub = stopType === "CLUB_PICKUP" || stopType === "CLUB_DROPOFF";
      const place = atClub
        ? "fitdog-club"
        : dog.addressStatus === "ok" && dog.homeAddress
          ? `home:${addressFingerprint(dog)}`
          : `home-unrouted:${dog.id}`;
      const key = `${date}|${dog.routeVanKey}|${kind}|${place}`;
      let stop = byKey.get(key);
      if (!stop) {
        stop = makeStop(key, date, dog, kind, stopType);
        byKey.set(key, stop);
      }
      if (stop.dogs.some((entry) => entry.dogId === dog.id)) continue;
      stop.dogs.push(stopDog(dog, end, stop.locationType));
    }
  }

  const stops = Array.from(byKey.values());
  for (const stop of stops) refreshStopSummary(stop);
  stops.sort(compareStops);
  const exportable = stops.filter((s) => s.addressStatus === "ok" && Boolean(s.homeAddress));
  const missingAddress = stops.filter((s) => s.addressStatus !== "ok" || !s.homeAddress);

  return {
    stops,
    exportable,
    missingAddress,
    pickupCount: stops.filter((s) => s.kind === "PICK_UP").length,
    dropoffCount: stops.filter((s) => s.kind === "DROP_OFF").length,
    reviewDogs
  };
}

export function stopDisplayName(stop: TransportationStop): string {
  if (stop.locationType === "FITDOG_CLUB") return DEFAULT_FITDOG_LOCATIONS.club.name;
  const kindLabel = stop.kind === "PICK_UP" ? "PICK UP FROM HOME" : "DROP OFF TO HOME";
  const owner = stop.ownerName ? ` (${stop.ownerName})` : "";
  return `${stop.dogName}${owner} - ${kindLabel}`;
}
