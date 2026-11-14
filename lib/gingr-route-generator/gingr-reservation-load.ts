/**
 * Load and merge Gingr reservations for a single route date, including pulls that
 * surface nested Service Addon rows omitted from the primary date list.
 */

import { addCalendarDays } from "@/lib/body-checks/roster";
import type { GingrClient } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { mergeGingrReservationsById } from "@/lib/gingr-route-generator/gingr-reservation-merge";

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function animalIdFromGingrReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const animal = asRecord(reservation.animal) ?? asRecord(record.pet) ?? asRecord(record.dog);
  return pickString(reservation.animal_id, record.a_id, record.animalId, animal?.id);
}

function ownerIdFromReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const owner =
    record.owner && typeof record.owner === "object" && !Array.isArray(record.owner)
      ? (record.owner as Record<string, unknown>)
      : null;
  const client = asRecord(record.client) ?? asRecord(record.customer);
  return pickString(
    record.owner_id,
    record.o_id,
    record.a_owner_id,
    record.a_o_id,
    record.client_id,
    record.customer_id,
    owner?.id,
    owner?.owner_id,
    owner?.o_id,
    client?.id,
    client?.owner_id
  );
}

const MAX_OWNER_ENRICHMENT = 64;
const OWNER_FETCH_CONCURRENCY = 4;
const ANIMAL_OWNER_LOOKUP_CONCURRENCY = 4;
const DATE_WINDOW_BACK_DAYS = 14;
const DATE_WINDOW_FORWARD_DAYS = 7;
const WINDOW_PULL_MAX_PAGES = 6;

async function resolveOwnerIds(
  client: GingrClient,
  reservations: GingrReservation[]
): Promise<Set<string>> {
  const ownerIds = new Set<string>();
  const animalsMissingOwner = new Set<string>();

  for (const reservation of reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    if (ownerId) ownerIds.add(ownerId);
    else {
      const animalId = animalIdFromGingrReservation(reservation);
      if (animalId) animalsMissingOwner.add(animalId);
    }
  }

  const animalList = [...animalsMissingOwner].slice(0, MAX_OWNER_ENRICHMENT);
  for (let offset = 0; offset < animalList.length; offset += ANIMAL_OWNER_LOOKUP_CONCURRENCY) {
    const batch = animalList.slice(offset, offset + ANIMAL_OWNER_LOOKUP_CONCURRENCY);
    const animals = await Promise.all(
      batch.map((animalId) =>
        client
          .getAnimal(animalId)
          .then((animal) => asRecord(animal))
          .catch(() => null)
      )
    );
    for (const animal of animals) {
      if (!animal) continue;
      const ownerId = pickString(animal.owner_id, animal.o_id, asRecord(animal.owner)?.id);
      if (ownerId) ownerIds.add(ownerId);
    }
  }

  return ownerIds;
}

async function enrichFromOwnerReservations(
  client: GingrClient,
  reservations: GingrReservation[]
): Promise<GingrReservation[]> {
  const ownerIds = await resolveOwnerIds(client, reservations);
  if (!ownerIds.size) return reservations;

  const ids = [...ownerIds].slice(0, MAX_OWNER_ENRICHMENT);
  const extra: GingrReservation[] = [];
  for (let offset = 0; offset < ids.length; offset += OWNER_FETCH_CONCURRENCY) {
    const batch = ids.slice(offset, offset + OWNER_FETCH_CONCURRENCY);
    const batches = await Promise.all(
      batch.map((ownerId) => client.listReservationsByOwner(ownerId).catch(() => [] as GingrReservation[]))
    );
    for (const rows of batches) extra.push(...rows);
  }
  if (!extra.length) return reservations;
  return mergeGingrReservationsById(reservations, extra);
}

/**
 * Sibling Before/After addon reservations sometimes sit outside the single-day
 * window; keep rows for animals already on the route date.
 */
async function enrichFromDateWindow(
  client: GingrClient,
  reservations: GingrReservation[],
  routeDate: string
): Promise<GingrReservation[]> {
  const animalsOnRoute = new Set<string>();
  for (const reservation of reservations) {
    const animalId = animalIdFromGingrReservation(reservation);
    if (animalId) animalsOnRoute.add(animalId);
  }
  if (!animalsOnRoute.size) return reservations;

  const start = addCalendarDays(routeDate, -DATE_WINDOW_BACK_DAYS);
  const end = addCalendarDays(routeDate, DATE_WINDOW_FORWARD_DAYS);
  const window = await client.listReservationsPaged(
    {
      start_date: start,
      end_date: end,
      checked_in: "false"
    },
    WINDOW_PULL_MAX_PAGES
  );
  const relevant = window.filter((reservation) => {
    const animalId = animalIdFromGingrReservation(reservation);
    return Boolean(animalId && animalsOnRoute.has(animalId));
  });
  if (!relevant.length) return reservations;
  return mergeGingrReservationsById(reservations, relevant);
}

/**
 * Date-scoped reservations plus checked-in rows, a nearby date window, and
 * per-owner pulls so nested `service_items` / sibling transport reservations
 * merge onto the same dog.
 */
export async function loadGingrReservationsForRouteDate(
  client: GingrClient,
  date: string
): Promise<GingrReservation[]> {
  const [byDate, checkedIn] = await Promise.all([
    client.listReservationsByDate(date),
    client.listCheckedInReservations().catch(() => [] as GingrReservation[])
  ]);
  let merged = mergeGingrReservationsById(byDate, checkedIn);
  merged = await enrichFromDateWindow(client, merged, date);
  merged = await enrichFromOwnerReservations(client, merged);
  return merged;
}