import type { GingrReservation } from "@/lib/integrations/gingr/types";
import {
  GINGR_ROUTE_ACTIVITY_BY_ID,
  dogHasClassActivity,
  type GingrRouteActivityId,
  isRouteQualifyingActivity,
  matchGingrRouteActivity,
  sortGingrRouteActivities
} from "@/lib/gingr-route-generator/activities";
import {
  collectReservationAppointmentOptions,
  logTransportationClassification,
  gingrTimestampDateKey,
  isInternalBoardingTaxiMarker,
  normalizeReservationTransportation,
  resolveBoardingOccupancy,
  resolveTransportLifecycle,
  type GingrTransportationType
} from "@/lib/gingr-route-generator/transportation";
import {
  collectAssignedToLabels,
  ownerLastNameFromDisplay,
  resolveRouteVanKey,
  type GingrRouteVanKey
} from "@/lib/gingr-route-generator/van-assignment";

export type GingrRouteAddressStatus = "ok" | "missing" | "incomplete";

export type GingrRouteDog = {
  id: string;
  animalId: number | null;
  name: string;
  owner: string;
  imageUrl: string | null;
  activities: GingrRouteActivityId[];
  /** Subject labels for RSVP-style columns (Canine Fitness, Adventure Hike, etc.). */
  activityLabels: string[];
  /** Fitdog van pickup from the owner's home. */
  pickup: boolean;
  /** Fitdog van drop-off to the owner's home. */
  dropoff: boolean;
  pickupDestination: "home" | "club" | null;
  dropoffDestination: "home" | "club" | null;
  startLocation: "home" | "club";
  endLocation: "home" | "club";
  /** Boarding @ Fitdog Club — the Club is this dog's transportation location. */
  clubTransportLocation: boolean;
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  /** Owner Pick Up | Fitdog Club — the owner collects the dog at the Club. */
  returnToClub: boolean;
  isTaxi: boolean;
  assignedTo: string | null;
  routeVanKey: GingrRouteVanKey;
  ownerLastName: string | null;
  alreadyOnProperty: boolean;
  transportationTypes: GingrTransportationType[];
  scheduledTime: string | null;
  scheduledTimeLabel: string | null;
  /** Notes visible to the client on the reservation. */
  notes: string | null;
  /** Booking comments visible to the client — shown as Pick Up Instructions. */
  pickupInstructions: string | null;
  reservationIds: number[];
  /** Full owner/home postal address when transport is required. */
  homeAddress: string | null;
  homeStreet1: string | null;
  homeStreet2: string | null;
  homeCity: string | null;
  homeState: string | null;
  homePostalCode: string | null;
  ownerPhone: string | null;
  ownerFullName: string | null;
  addressStatus: GingrRouteAddressStatus;
  /** Canonical labels, e.g. Owner Drop Off | Fitdog Club. */
  appointmentOptions: string[];
};

export type GingrRouteSchedulePayload = {
  date: string;
  dogs: GingrRouteDog[];
  stats: {
    dogsScheduled: number;
    classCount: number;
    adventureHike: number;
    beachExcursion: number;
    transportationRequired: number;
  };
  fetchedAt: string;
  cached: boolean;
  source?: "gingr_api" | "upload";
  uploadFileName?: string | null;
  /** Problems pulling a secondary source (e.g. Fitdog class sign-ups); dogs from Gingr still load. */
  warnings?: string[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function reservationTypeName(reservation: GingrReservation): string {
  const type = asRecord(reservation.reservation_type);
  return (
    pickString(
      type.type,
      type.name,
      reservation.type,
      reservation.service,
      reservation.service_type,
      reservation.s_name
    ) || ""
  );
}

function reservationServiceRows(reservation: GingrReservation): Array<Record<string, unknown>> {
  const record = reservation as Record<string, unknown>;
  const candidates = [record.services, record.additional_services, record.reservation_services, record.addons];
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      const row = asRecord(item);
      if (Object.keys(row).length) rows.push(row);
    }
  }
  return rows;
}

function serviceName(service: Record<string, unknown>): string {
  return pickString(service.name, service.service, service.type, service.s_name) || "";
}

function ownerDisplayName(reservation: GingrReservation): string {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  const first =
    pickString(owner.first_name, reservation.a_o_first_name, reservation.owner_first_name) || "";
  const last =
    pickString(owner.last_name, reservation.a_o_last_name, reservation.owner_last_name) || "";
  if (first && last) return `${first} ${last.charAt(0)}.`;
  if (first) return first;
  if (last) return last;
  const full = pickString(owner.full_name, reservation.owner_name, reservation.client_name);
  if (!full) return "Owner";
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
  return full;
}

function dogNameFromReservation(reservation: GingrReservation): string {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  return (
    pickString(
      animal.name,
      animal.first_name,
      reservation.animal_name,
      reservation.pet_name,
      reservation.dog_name,
      reservation.a_name
    ) || "Dog"
  );
}

function animalIdFromReservation(reservation: GingrReservation): number | null {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  const raw = pickString(animal.id, reservation.animal_id, reservation.a_id);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function reservationPhoto(reservation: GingrReservation): string | null {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  return pickString(
    animal.image,
    animal.image_url,
    animal.photo_url,
    animal.profile_pic,
    reservation.a_profile_pic,
    reservation.a_image,
    reservation.animal_image,
    reservation.a_photo,
    reservation.photo_url,
    reservation.image_url
  );
}

function extractTimeIso(
  reservation: GingrReservation,
  service?: Record<string, unknown>
): string | null {
  return pickString(
    service?.scheduled_at,
    service?.start_date,
    service?.start_time,
    service?.time,
    reservation.start_date,
    reservation.r_start,
    reservation.r_time,
    reservation.r_date_start,
    reservation.date,
    reservation.r_date
  );
}

function formatTimeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const normalized = iso.includes("T") ? iso : iso.includes(" ") ? iso.replace(" ", "T") : iso;
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }
  const m = iso.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${ampm}`;
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

/** Notes marked/stored as visible to the client on the Gingr reservation. */
function extractClientNotes(reservation: GingrReservation): string | null {
  const notesObj = asRecord(reservation.notes);
  const raw = stripHtml(
    pickString(
      notesObj.owner_notes,
      notesObj.client_notes,
      notesObj.public_notes,
      notesObj.reservation_notes,
      reservation.owner_notes,
      reservation.client_notes,
      reservation.public_notes,
      reservation.o_notes,
      reservation.reservation_notes,
      reservation.r_notes,
      reservation.a_notes,
      typeof reservation.notes === "string" ? reservation.notes : null
    )
  );
  if (!raw) return null;
  return clipText(raw, 280);
}

/**
 * Comments the client enters when booking (visible to them) —
 * mapped to the Pick Up Instructions column for drivers.
 */
function extractPickupInstructions(reservation: GingrReservation): string | null {
  const notesObj = asRecord(reservation.notes);
  const raw = stripHtml(
    pickString(
      notesObj.comments,
      notesObj.booking_comments,
      notesObj.owner_comments,
      notesObj.instructions,
      notesObj.pickup_instructions,
      reservation.r_comments,
      reservation.comments,
      reservation.booking_comments,
      reservation.owner_comments,
      reservation.r_instructions,
      reservation.pickup_instructions,
      reservation.special_instructions
    )
  );
  if (!raw) return null;
  return clipText(raw, 400);
}

function animalKey(reservation: GingrReservation): string {
  const id = animalIdFromReservation(reservation);
  if (id) return `animal:${id}`;
  const name = dogNameFromReservation(reservation).toLowerCase();
  const owner = ownerDisplayName(reservation).toLowerCase();
  return `name:${name}|${owner}`;
}

function reservationNumericId(reservation: GingrReservation): number | null {
  const raw = pickString(reservation.reservation_id, reservation.r_id, reservation.id);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function stayCoversRouteDate(reservation: GingrReservation, routeDate: string): boolean {
  const start = gingrTimestampDateKey(reservation.start_date);
  const end = gingrTimestampDateKey(reservation.end_date);
  if (start && start > routeDate) return false;
  if (end && end < routeDate) return false;
  return true;
}

/**
 * A dated service row belongs to its own date. An undated row belongs to the
 * reservation, so it only applies when the reservation itself applies to the date.
 */
function serviceAppliesToRouteDate(
  service: Record<string, unknown>,
  routeDate: string,
  undatedRowApplies: boolean
): boolean {
  const scheduled =
    gingrTimestampDateKey(service.scheduled_at) || gingrTimestampDateKey(service.scheduled_until);
  if (scheduled) return scheduled === routeDate;
  return undatedRowApplies;
}

/**
 * Does this reservation describe something happening on the route date?
 *
 * Used to decide whether a transportation add-on can put a dog on the route by
 * itself, so an add-on attached to another day's appointment never leaks.
 */
function reservationAppliesToRouteDate(
  reservation: GingrReservation,
  routeDate: string,
  overnightStay: boolean
): boolean {
  const scheduledDates = new Set<string>();
  for (const service of reservationServiceRows(reservation)) {
    const scheduled =
      gingrTimestampDateKey(service.scheduled_at) || gingrTimestampDateKey(service.scheduled_until);
    if (scheduled) scheduledDates.add(scheduled);
  }
  if (scheduledDates.has(routeDate)) return true;
  if (overnightStay) return stayCoversRouteDate(reservation, routeDate);
  const start = gingrTimestampDateKey(reservation.start_date);
  if (start) return start === routeDate;
  // Dated elsewhere but not on this date; otherwise an undated record from a
  // date-scoped Gingr fetch belongs to the selected date.
  return scheduledDates.size === 0;
}

/**
 * Undated rows never apply mid-stay — a boarding stay's undated extras must not
 * repeat on every day it spans.
 */
function undatedRowAppliesToRouteDate(
  reservation: GingrReservation,
  routeDate: string,
  overnightStay: boolean
): boolean {
  if (overnightStay) return false;
  return reservationAppliesToRouteDate(reservation, routeDate, overnightStay);
}

/**
 * Match a Gingr service/type name to a route activity.
 * "Taxi Service - Business Only" is the day's taxi only on a service row dated
 * to the route date; as an undated line or reservation type it is billing only.
 */
function routeActivityForServiceName(
  rawName: string | null | undefined,
  datedToRouteDate = false
) {
  const activity = matchGingrRouteActivity(rawName);
  if (!activity) return null;
  if (
    activity.category === "taxi" &&
    isInternalBoardingTaxiMarker({ text: String(rawName || "") }) &&
    !datedToRouteDate
  ) {
    return null;
  }
  return activity;
}

/**
 * Activities for this route date only.
 * A class/outing service on another day of a boarding stay must not leak onto tomorrow.
 */
function collectRouteDayActivities(
  reservation: GingrReservation,
  routeDate: string
): GingrRouteActivityId[] {
  const occupancy = resolveBoardingOccupancy(reservation as Record<string, unknown>, routeDate);
  const ids = new Set<GingrRouteActivityId>();
  const undatedRowApplies = undatedRowAppliesToRouteDate(reservation, routeDate, occupancy.isOvernight);
  // When the reservation carries dated route services, those dates are authoritative
  // and the undated reservation type must not qualify the dog on other days.
  let hasDatedRouteService = false;

  for (const service of reservationServiceRows(reservation)) {
    const name = serviceName(service);
    const scheduled =
      gingrTimestampDateKey(service.scheduled_at) || gingrTimestampDateKey(service.scheduled_until);
    const activity = routeActivityForServiceName(name, scheduled === routeDate);
    if (!activity) continue;
    if (scheduled && isRouteQualifyingActivity(activity.id)) hasDatedRouteService = true;
    if (!serviceAppliesToRouteDate(service, routeDate, undatedRowApplies)) continue;
    ids.add(activity.id);
  }

  const typeName = reservationTypeName(reservation);
  const typeActivity = routeActivityForServiceName(typeName);
  if (typeActivity) {
    const start = gingrTimestampDateKey(reservation.start_date);
    if (typeActivity.category === "club") {
      if (stayCoversRouteDate(reservation, routeDate)) ids.add(typeActivity.id);
    } else if (start) {
      if (start === routeDate) ids.add(typeActivity.id);
    } else if (!hasDatedRouteService) {
      // Undated record from a date-scoped Gingr fetch — it belongs to this date.
      ids.add(typeActivity.id);
    }
  }

  const flat = pickString(reservation.s_name, reservation.service_name);
  const flatActivity = routeActivityForServiceName(flat);
  if (flatActivity && !occupancy.isOvernight && !hasDatedRouteService) ids.add(flatActivity.id);

  return Array.from(ids);
}


function ownerFullName(reservation: GingrReservation): string | null {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  const first = pickString(owner.first_name, reservation.a_o_first_name, reservation.owner_first_name);
  const last = pickString(owner.last_name, reservation.a_o_last_name, reservation.owner_last_name);
  if (first && last) return `${first} ${last}`;
  return pickString(owner.full_name, reservation.owner_name, reservation.client_name, first, last);
}

function ownerPhone(reservation: GingrReservation): string | null {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  return pickString(
    owner.cell_phone,
    owner.mobile_phone,
    owner.home_phone,
    owner.phone,
    reservation.phone,
    reservation.owner_phone,
    reservation.a_o_mobile
  );
}

export type ExtractedHomeAddress = {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  fullAddress: string | null;
  status: GingrRouteAddressStatus;
};

/** Pull owner/home postal fields from a Gingr reservation without extra API calls. */
export function extractHomeAddressFromReservation(reservation: GingrReservation): ExtractedHomeAddress {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  const address = asRecord(reservation.address || reservation.pickup_address || reservation.location);
  const street1 = pickString(
    owner.address_1,
    owner.address1,
    owner.street,
    address.address_1,
    address.address1,
    address.address,
    address.street,
    address.line1,
    reservation.address_line_1,
    reservation.street
  );
  const street2 = pickString(
    owner.address_2,
    owner.address2,
    address.address_2,
    address.address2,
    address.unit,
    address.line2
  );
  const city = pickString(owner.city, address.city, reservation.city);
  const state = pickString(owner.state, address.state, reservation.state) || (street1 || city ? "CA" : null);
  const postalCode = pickString(
    owner.postal,
    owner.postcode,
    address.zip,
    address.postcode,
    address.postal_code,
    reservation.zip,
    reservation.postcode
  );
  const hasStreet = Boolean(street1);
  const hasLocality = Boolean(city || postalCode);
  let status: GingrRouteAddressStatus = "ok";
  if (!hasStreet && !hasLocality) status = "missing";
  else if (!hasStreet || !hasLocality) status = "incomplete";

  const street = [street1, street2].filter(Boolean).join(", ") || null;
  const localityParts = [city, [state, postalCode].filter(Boolean).join(" ")].filter(Boolean);
  const locality = localityParts.join(", ") || null;
  const fullAddress =
    status === "ok" ? [street, locality, "USA"].filter(Boolean).join(", ") : null;

  return { street1, street2, city, state, postalCode, fullAddress, status };
}

function preferAddress(current: ExtractedHomeAddress, next: ExtractedHomeAddress): ExtractedHomeAddress {
  const rank = { ok: 2, incomplete: 1, missing: 0 } as const;
  if (rank[next.status] > rank[current.status]) return next;
  if (rank[next.status] < rank[current.status]) return current;
  if ((next.fullAddress || "").length > (current.fullAddress || "").length) return next;
  return current;
}

type Acc = {
  id: string;
  animalId: number | null;
  name: string;
  owner: string;
  imageUrl: string | null;
  activitySet: Set<GingrRouteActivityId>;
  activityLabels: Set<string>;
  pickup: boolean;
  dropoff: boolean;
  pickupDestination: "home" | "club" | null;
  dropoffDestination: "home" | "club" | null;
  startLocation: "home" | "club";
  endLocation: "home" | "club";
  clubTransportLocation: boolean;
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  returnToClub: boolean;
  isTaxi: boolean;
  assignedLabels: Set<string>;
  ownerLastName: string | null;
  alreadyOnProperty: boolean;
  transportationTypes: Set<GingrTransportationType>;
  scheduledTime: string | null;
  notes: string | null;
  pickupInstructions: string | null;
  reservationIds: Set<number>;
  hasEligibleActivity: boolean;
  /** An explicit Fitdog home van leg dated to this route date. */
  hasRouteTransportLeg: boolean;
  homeStreet1: string | null;
  homeStreet2: string | null;
  homeCity: string | null;
  homeState: string | null;
  homePostalCode: string | null;
  homeAddress: string | null;
  ownerPhone: string | null;
  ownerFullName: string | null;
  addressStatus: GingrRouteAddressStatus;
  appointmentOptions: Set<string>;
};

/**
 * Aggregate Gingr reservations for one calendar day into route dogs.
 * Eligible activities + same-day Pick Up / Drop Off merge onto one dog record.
 */
export function normalizeGingrRouteReservations(
  reservations: GingrReservation[],
  date: string
): Omit<GingrRouteSchedulePayload, "fetchedAt" | "cached"> {
  const byAnimal = new Map<string, Acc>();

  for (const reservation of reservations) {
    try {
      if (asRecord(reservation).cancelled_date) continue;

      const key = animalKey(reservation);
      let acc = byAnimal.get(key);
      if (!acc) {
        acc = {
          id: key,
          animalId: animalIdFromReservation(reservation),
          name: dogNameFromReservation(reservation),
          owner: ownerDisplayName(reservation),
          imageUrl: reservationPhoto(reservation),
          activitySet: new Set(),
          activityLabels: new Set(),
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
          assignedLabels: new Set(),
          ownerLastName: null,
          alreadyOnProperty: false,
          transportationTypes: new Set(),
          scheduledTime: null,
          notes: null,
          pickupInstructions: null,
          reservationIds: new Set(),
          hasEligibleActivity: false,
          hasRouteTransportLeg: false,
          homeStreet1: null,
          homeStreet2: null,
          homeCity: null,
          homeState: null,
          homePostalCode: null,
          homeAddress: null,
          ownerPhone: null,
          ownerFullName: null,
          addressStatus: "missing",
          appointmentOptions: new Set()
        };
        byAnimal.set(key, acc);
      }

      const rid = reservationNumericId(reservation);
      if (rid) acc.reservationIds.add(rid);
      if (!acc.imageUrl) acc.imageUrl = reservationPhoto(reservation);

      const typeName = reservationTypeName(reservation);
      const services = reservationServiceRows(reservation);
      const occupancy = resolveBoardingOccupancy(reservation as Record<string, unknown>, date);
      const undatedRowApplies = undatedRowAppliesToRouteDate(reservation, date, occupancy.isOvernight);
      const dayActivities = collectRouteDayActivities(reservation, date);

      for (const activityId of dayActivities) {
        const activity = GINGR_ROUTE_ACTIVITY_BY_ID[activityId];
        if (!activity) continue;
        // Daycare/boarding/club presence is kept as a label but never qualifies a dog.
        if (isRouteQualifyingActivity(activityId)) acc.hasEligibleActivity = true;
        acc.activitySet.add(activity.id);
        acc.activityLabels.add(activity.label);
      }

      const qualifyingServiceOnDate = dayActivities.some((activityId) => isRouteQualifyingActivity(activityId));
      const transport = normalizeReservationTransportation(reservation as Record<string, unknown>, date, {
        qualifyingServiceOnDate
      });
      for (const label of collectReservationAppointmentOptions(
        reservation as Record<string, unknown>,
        date,
        qualifyingServiceOnDate
      )) {
        acc.appointmentOptions.add(label);
      }
      const lifecycle = resolveTransportLifecycle(transport);
      if (
        (lifecycle.homePickup || lifecycle.homeDropoff) &&
        reservationAppliesToRouteDate(reservation, date, occupancy.isOvernight)
      ) {
        acc.hasRouteTransportLeg = true;
      }
      if (lifecycle.homePickup) {
        acc.pickup = true;
        acc.pickupDestination = "home";
        acc.startLocation = "home";
      }
      if (lifecycle.homeDropoff) {
        acc.dropoff = true;
        acc.dropoffDestination = "home";
        acc.endLocation = "home";
      }
      if (!lifecycle.homePickup && lifecycle.startLocation === "club") {
        if (!acc.pickup) acc.startLocation = "club";
      }
      if (!lifecycle.homeDropoff && lifecycle.endLocation === "club") {
        if (!acc.dropoff) acc.endLocation = "club";
      }
      if (lifecycle.clubLocation) acc.clubTransportLocation = true;
      if (transport.ownerClubDropoff) acc.ownerClubDropoff = true;
      if (transport.ownerClubPickup) acc.ownerClubPickup = true;
      acc.returnToClub = acc.ownerClubPickup;
      if (transport.isTaxi) acc.isTaxi = true;
      for (const label of collectAssignedToLabels(reservation as Record<string, unknown>, date)) {
        acc.assignedLabels.add(label);
      }
      const lastName = pickString(
        asRecord(reservation.owner || reservation.client || reservation.customer).last_name,
        reservation.a_o_last_name,
        reservation.owner_last_name
      );
      if (lastName && !acc.ownerLastName) acc.ownerLastName = lastName;
      if (transport.alreadyOnProperty) acc.alreadyOnProperty = true;
      for (const type of transport.types) acc.transportationTypes.add(type);
      logTransportationClassification({
        appointmentId: rid,
        service: typeName,
        addon: transport.types.join(",") || null,
        transportation: transport.types[0] ?? "UNKNOWN"
      });

      if (matchGingrRouteActivity(typeName) && !occupancy.isOvernight) {
        const t = extractTimeIso(reservation);
        if (t && (!acc.scheduledTime || t < acc.scheduledTime)) acc.scheduledTime = t;
      }

      for (const service of services) {
        const name = serviceName(service);
        if (!matchGingrRouteActivity(name)) continue;
        if (!serviceAppliesToRouteDate(service, date, undatedRowApplies)) continue;
        const t = extractTimeIso(reservation, service);
        if (t && (!acc.scheduledTime || t < acc.scheduledTime)) acc.scheduledTime = t;
      }

      const clientNotes = extractClientNotes(reservation);
      if (clientNotes && !acc.notes) acc.notes = clientNotes;
      const pickupInstructions = extractPickupInstructions(reservation);
      if (pickupInstructions && !acc.pickupInstructions) {
        acc.pickupInstructions = pickupInstructions;
      }
      if (acc.notes && acc.pickupInstructions && acc.notes === acc.pickupInstructions) {
        acc.notes = null;
      }

      const nextAddress = extractHomeAddressFromReservation(reservation);
      const currentAddress = {
        street1: acc.homeStreet1,
        street2: acc.homeStreet2,
        city: acc.homeCity,
        state: acc.homeState,
        postalCode: acc.homePostalCode,
        fullAddress: acc.homeAddress,
        status: acc.addressStatus
      };
      const chosen = preferAddress(currentAddress, nextAddress);
      acc.homeStreet1 = chosen.street1;
      acc.homeStreet2 = chosen.street2;
      acc.homeCity = chosen.city;
      acc.homeState = chosen.state;
      acc.homePostalCode = chosen.postalCode;
      acc.homeAddress = chosen.fullAddress;
      acc.addressStatus = chosen.status;
      if (!acc.ownerPhone) acc.ownerPhone = ownerPhone(reservation);
      if (!acc.ownerFullName) acc.ownerFullName = ownerFullName(reservation);
    } catch (error) {
      console.warn(
        "[RouteGenerator] skipped malformed Gingr reservation:",
        error instanceof Error ? error.message : error
      );
    }
  }

  const dogs: GingrRouteDog[] = [];
  for (const acc of Array.from(byAnimal.values())) {
    // Route dogs need a qualifying service (outing, taxi, class) on the selected
    // date, or an explicit Fitdog home van leg dated to it.
    if (!acc.hasEligibleActivity && !acc.hasRouteTransportLeg) continue;
    if (!acc.imageUrl && acc.animalId) {
      acc.imageUrl = `/api/gingr/animal-photo/image?animalId=${acc.animalId}`;
    }
    const activities = sortGingrRouteActivities(acc.activitySet);
    const routeVanKey = resolveRouteVanKey({
      assignedLabels: Array.from(acc.assignedLabels),
      isTaxi: acc.isTaxi,
      activities
    });
    const ownerLastName = acc.ownerLastName || ownerLastNameFromDisplay(acc.owner);
    const needsHomeAddress = acc.pickup || acc.dropoff;
    dogs.push({
      id: acc.id,
      animalId: acc.animalId,
      name: acc.name,
      owner: acc.owner,
      imageUrl: acc.imageUrl,
      activities,
      activityLabels: activities.map((id) => GINGR_ROUTE_ACTIVITY_BY_ID[id].label),
      pickup: acc.pickup,
      dropoff: acc.dropoff,
      pickupDestination: acc.pickupDestination,
      dropoffDestination: acc.dropoffDestination,
      startLocation: acc.startLocation,
      endLocation: acc.endLocation,
      clubTransportLocation: acc.clubTransportLocation || acc.alreadyOnProperty,
      ownerClubDropoff: acc.ownerClubDropoff,
      ownerClubPickup: acc.ownerClubPickup,
      returnToClub: acc.returnToClub,
      isTaxi: acc.isTaxi,
      assignedTo: Array.from(acc.assignedLabels)[0] || null,
      routeVanKey,
      ownerLastName,
      alreadyOnProperty: acc.alreadyOnProperty,
      transportationTypes: Array.from(acc.transportationTypes),
      scheduledTime: acc.scheduledTime,
      scheduledTimeLabel: formatTimeLabel(acc.scheduledTime),
      notes: acc.notes,
      pickupInstructions: acc.pickupInstructions,
      reservationIds: Array.from(acc.reservationIds),
      homeAddress: needsHomeAddress ? acc.homeAddress : null,
      homeStreet1: needsHomeAddress ? acc.homeStreet1 : null,
      homeStreet2: needsHomeAddress ? acc.homeStreet2 : null,
      homeCity: needsHomeAddress ? acc.homeCity : null,
      homeState: needsHomeAddress ? acc.homeState : null,
      homePostalCode: needsHomeAddress ? acc.homePostalCode : null,
      ownerPhone: acc.ownerPhone,
      ownerFullName: acc.ownerFullName,
      addressStatus: needsHomeAddress ? acc.addressStatus : "ok",
      appointmentOptions: Array.from(acc.appointmentOptions)
    });
  }

  sortRouteDogs(dogs);

  return {
    date,
    dogs,
    stats: summarizeRouteDogs(dogs)
  };
}

export function sortRouteDogs(dogs: GingrRouteDog[]): GingrRouteDog[] {
  return dogs.sort((a, b) => {
    const ta = a.scheduledTime || "99";
    const tb = b.scheduledTime || "99";
    if (ta !== tb) return ta.localeCompare(tb);
    return a.name.localeCompare(b.name);
  });
}

export function summarizeRouteDogs(dogs: GingrRouteDog[]): GingrRouteSchedulePayload["stats"] {
  return {
    dogsScheduled: dogs.length,
    classCount: dogs.filter((d) => dogHasClassActivity(d.activities)).length,
    adventureHike: dogs.filter((d) => d.activities.includes("adventure_hike")).length,
    beachExcursion: dogs.filter((d) => d.activities.includes("beach_excursion")).length,
    transportationRequired: dogs.filter((d) => d.pickup || d.dropoff).length
  };
}

export function buildGingrRouteSchedulePayload(
  date: string,
  reservations: GingrReservation[],
  options?: { cached?: boolean; fetchedAt?: string }
): GingrRouteSchedulePayload {
  const normalized = normalizeGingrRouteReservations(reservations, date);
  return {
    ...normalized,
    fetchedAt: options?.fetchedAt || new Date().toISOString(),
    cached: Boolean(options?.cached)
  };
}
