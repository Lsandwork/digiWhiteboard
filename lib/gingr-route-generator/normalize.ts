import type { GingrReservation } from "@/lib/integrations/gingr/types";
import {
  type GingrRouteActivityId,
  isDropOffService,
  isPickUpService,
  matchGingrRouteActivity
} from "@/lib/gingr-route-generator/activities";

export type GingrRouteDog = {
  id: string;
  animalId: number | null;
  name: string;
  owner: string;
  imageUrl: string | null;
  activities: GingrRouteActivityId[];
  activityLabels: string[];
  pickup: boolean;
  dropoff: boolean;
  scheduledTime: string | null;
  scheduledTimeLabel: string | null;
  notes: string | null;
  reservationIds: number[];
};

export type GingrRouteSchedulePayload = {
  date: string;
  dogs: GingrRouteDog[];
  stats: {
    dogsScheduled: number;
    adventureHike: number;
    beachExcursion: number;
    transportationRequired: number;
  };
  fetchedAt: string;
  cached: boolean;
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

function reservationServices(reservation: GingrReservation): Array<Record<string, unknown>> {
  const services = reservation.services;
  return Array.isArray(services) ? services.map((item) => asRecord(item)) : [];
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

function extractNotes(reservation: GingrReservation): string | null {
  const notesObj = asRecord(reservation.notes);
  const raw = stripHtml(
    pickString(
      notesObj.reservation_notes,
      reservation.reservation_notes,
      reservation.r_notes,
      reservation.r_instructions,
      reservation.a_notes,
      reservation.r_comments,
      typeof reservation.notes === "string" ? reservation.notes : null
    )
  );
  if (!raw) return null;
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
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

function collectServiceNames(reservation: GingrReservation): string[] {
  const names: string[] = [];
  const typeName = reservationTypeName(reservation);
  if (typeName) names.push(typeName);
  for (const service of reservationServices(reservation)) {
    const name = serviceName(service);
    if (name) names.push(name);
  }
  const flat = pickString(reservation.s_name, reservation.service_name);
  if (flat) names.push(flat);
  return names;
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
  scheduledTime: string | null;
  notes: string | null;
  reservationIds: Set<number>;
  hasEligibleActivity: boolean;
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
        scheduledTime: null,
        notes: null,
        reservationIds: new Set(),
        hasEligibleActivity: false
      };
      byAnimal.set(key, acc);
    }

    const rid = reservationNumericId(reservation);
    if (rid) acc.reservationIds.add(rid);
    if (!acc.imageUrl) acc.imageUrl = reservationPhoto(reservation);

    const typeName = reservationTypeName(reservation);
    const services = reservationServices(reservation);
    const names = collectServiceNames(reservation);

    for (const name of names) {
      const activity = matchGingrRouteActivity(name);
      if (activity) {
        acc.hasEligibleActivity = true;
        acc.activitySet.add(activity.id);
        acc.activityLabels.add(activity.label);
      }
      if (isPickUpService(name)) acc.pickup = true;
      if (isDropOffService(name)) acc.dropoff = true;
    }

    if (matchGingrRouteActivity(typeName)) {
      const t = extractTimeIso(reservation);
      if (t && (!acc.scheduledTime || t < acc.scheduledTime)) acc.scheduledTime = t;
      const notes = extractNotes(reservation);
      if (notes && !acc.notes) acc.notes = notes;
    }

    for (const service of services) {
      const name = serviceName(service);
      if (!matchGingrRouteActivity(name)) continue;
      const t = extractTimeIso(reservation, service);
      if (t && (!acc.scheduledTime || t < acc.scheduledTime)) acc.scheduledTime = t;
    }

    if (!acc.notes) {
      const notes = extractNotes(reservation);
      if (notes) acc.notes = notes;
    }
  }

  const dogs: GingrRouteDog[] = [];
  for (const acc of Array.from(byAnimal.values())) {
    if (!acc.hasEligibleActivity) continue;
    if (!acc.imageUrl && acc.animalId) {
      acc.imageUrl = `/api/gingr/animal-photo/image?animalId=${acc.animalId}`;
    }
    dogs.push({
      id: acc.id,
      animalId: acc.animalId,
      name: acc.name,
      owner: acc.owner,
      imageUrl: acc.imageUrl,
      activities: Array.from(acc.activitySet),
      activityLabels: Array.from(acc.activityLabels),
      pickup: acc.pickup,
      dropoff: acc.dropoff,
      scheduledTime: acc.scheduledTime,
      scheduledTimeLabel: formatTimeLabel(acc.scheduledTime),
      notes: acc.notes,
      reservationIds: Array.from(acc.reservationIds)
    });
  }

  dogs.sort((a, b) => {
    const ta = a.scheduledTime || "99";
    const tb = b.scheduledTime || "99";
    if (ta !== tb) return ta.localeCompare(tb);
    return a.name.localeCompare(b.name);
  });

  return {
    date,
    dogs,
    stats: {
      dogsScheduled: dogs.length,
      adventureHike: dogs.filter((d) => d.activities.includes("adventure_hike")).length,
      beachExcursion: dogs.filter((d) => d.activities.includes("beach_excursion")).length,
      transportationRequired: dogs.filter((d) => d.pickup || d.dropoff).length
    }
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
