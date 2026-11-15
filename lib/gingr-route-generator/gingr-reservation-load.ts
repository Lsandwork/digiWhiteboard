/**
 * Load and merge Gingr reservations for a single route date, including pulls that
 * surface nested Service Addon rows omitted from the primary date list.
 *
 * Production must finish under Vercel's 60s limit — avoid N×animal and N×detail fan-out.
 */

import { addCalendarDays } from "@/lib/body-checks/roster";
import type { GingrClient } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { mergeGingrReservationsById } from "@/lib/gingr-route-generator/gingr-reservation-merge";
import {
  collectReservationTransportCandidates,
  gingrTimestampDateKey
} from "@/lib/gingr-route-generator/transportation";
import { listReservationServiceArrays } from "@/lib/gingr-route-generator/reservation-service-rows";

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

export function animalNameFromGingrReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const animal = asRecord(reservation.animal) ?? asRecord(record.pet) ?? asRecord(record.dog);
  return pickString(record.a_name, record.animal_name, record.pet_name, animal?.name, animal?.a_name);
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

function reservationIdOf(reservation: GingrReservation): string | null {
  return pickString(reservation.reservation_id, reservation.id);
}

/** How hard to fan out to Gingr after the primary date list. */
export type GingrRouteReservationLoadMode = "fast" | "refresh" | "diagnostics";

const LIMITS = {
  fast: {
    checkedInPages: 2,
    windowPages: 0,
    maxOwners: 16,
    maxSparseDetails: 0,
    maxAnimalsScoped: 0
  },
  refresh: {
    checkedInPages: 2,
    windowPages: 2,
    maxOwners: 24,
    maxSparseDetails: 12,
    maxAnimalsScoped: 0
  },
  diagnostics: {
    checkedInPages: 2,
    windowPages: 3,
    maxOwners: 32,
    maxSparseDetails: 20,
    maxAnimalsScoped: 8
  }
} as const;

const OWNER_FETCH_CONCURRENCY = 4;
const ANIMAL_OWNER_LOOKUP_CONCURRENCY = 4;
const DETAIL_PULL_CONCURRENCY = 3;
const DATE_WINDOW_BACK_DAYS = 7;
const DATE_WINDOW_FORWARD_DAYS = 3;

function reservationTouchesRouteDate(reservation: GingrReservation, routeDate: string): boolean {
  const record = reservation as Record<string, unknown>;
  const start =
    gingrTimestampDateKey(record.start_date) ||
    gingrTimestampDateKey(record.scheduled_at) ||
    pickString(record.start_date)?.slice(0, 10);
  if (start === routeDate) return true;
  for (const row of listReservationServiceArrays(record)) {
    const scheduled =
      gingrTimestampDateKey(row.scheduled_at) ||
      gingrTimestampDateKey(row.start_date) ||
      gingrTimestampDateKey(row.date);
    if (scheduled === routeDate) return true;
  }
  return false;
}

async function resolveOwnerIds(
  client: GingrClient,
  reservations: GingrReservation[],
  maxOwners: number
): Promise<string[]> {
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

  const animalList = [...animalsMissingOwner].slice(0, maxOwners);
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

  return [...ownerIds].slice(0, maxOwners);
}

async function enrichFromOwnerReservations(
  client: GingrClient,
  reservations: GingrReservation[],
  maxOwners: number
): Promise<GingrReservation[]> {
  const ownerIds = await resolveOwnerIds(client, reservations, maxOwners);
  if (!ownerIds.length) return reservations;

  const extra: GingrReservation[] = [];
  for (let offset = 0; offset < ownerIds.length; offset += OWNER_FETCH_CONCURRENCY) {
    const batch = ownerIds.slice(offset, offset + OWNER_FETCH_CONCURRENCY);
    const batches = await Promise.all(
      batch.map((ownerId) => client.listReservationsByOwner(ownerId).catch(() => [] as GingrReservation[]))
    );
    for (const rows of batches) extra.push(...rows);
  }
  if (!extra.length) return reservations;
  return mergeGingrReservationsById(reservations, extra);
}

async function enrichFromDateWindow(
  client: GingrClient,
  reservations: GingrReservation[],
  routeDate: string,
  maxPages: number
): Promise<GingrReservation[]> {
  if (maxPages <= 0) return reservations;
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
    maxPages
  );
  const relevant = window.filter((reservation) => {
    const animalId = animalIdFromGingrReservation(reservation);
    return Boolean(animalId && animalsOnRoute.has(animalId));
  });
  if (!relevant.length) return reservations;
  return mergeGingrReservationsById(reservations, relevant);
}

async function enrichSparseReservationDetails(
  client: GingrClient,
  reservations: GingrReservation[],
  routeDate: string,
  maxIds: number
): Promise<GingrReservation[]> {
  if (maxIds <= 0) return reservations;
  const sparse: string[] = [];
  for (const reservation of reservations) {
    if (!reservationTouchesRouteDate(reservation, routeDate)) continue;
    const record = reservation as Record<string, unknown>;
    if (collectReservationTransportCandidates(record).length > 0) continue;
    const id = reservationIdOf(reservation);
    if (id) sparse.push(id);
    if (sparse.length >= maxIds) break;
  }
  if (!sparse.length) return reservations;

  const extra: GingrReservation[] = [];
  for (let offset = 0; offset < sparse.length; offset += DETAIL_PULL_CONCURRENCY) {
    const batch = sparse.slice(offset, offset + DETAIL_PULL_CONCURRENCY);
    const rows = await Promise.all(batch.map((id) => client.getReservationById(id)));
    for (const row of rows) {
      if (row) extra.push(row);
    }
  }
  if (!extra.length) return reservations;
  return mergeGingrReservationsById(reservations, extra);
}

async function enrichFromAnimalScopedPulls(
  client: GingrClient,
  reservations: GingrReservation[],
  routeDate: string,
  maxAnimals: number
): Promise<GingrReservation[]> {
  if (maxAnimals <= 0) return reservations;
  const animals = new Set<string>();
  for (const reservation of reservations) {
    if (!reservationTouchesRouteDate(reservation, routeDate)) continue;
    const animalId = animalIdFromGingrReservation(reservation);
    if (animalId) animals.add(animalId);
  }
  if (!animals.size) return reservations;

  const start = addCalendarDays(routeDate, -DATE_WINDOW_BACK_DAYS);
  const end = addCalendarDays(routeDate, DATE_WINDOW_FORWARD_DAYS);
  const extra: GingrReservation[] = [];
  const animalList = [...animals].slice(0, maxAnimals);
  for (let offset = 0; offset < animalList.length; offset += 3) {
    const batch = animalList.slice(offset, offset + 3);
    const batches = await Promise.all(
      batch.map((animalId) => client.listReservationsForAnimal(animalId, start, end))
    );
    for (const rows of batches) extra.push(...rows);
  }
  if (!extra.length) return reservations;
  return mergeGingrReservationsById(reservations, extra);
}

export async function loadGingrReservationsForRouteDate(
  client: GingrClient,
  date: string,
  options?: { mode?: GingrRouteReservationLoadMode }
): Promise<GingrReservation[]> {
  const mode = options?.mode ?? "refresh";
  const limits = LIMITS[mode === "fast" ? "fast" : mode === "diagnostics" ? "diagnostics" : "refresh"];

  const [byDate, checkedIn] = await Promise.all([
    client.listReservationsByDate(date),
    client.listReservationsPaged({ checked_in: "true" }, limits.checkedInPages)
  ]);
  let merged = mergeGingrReservationsById(byDate, checkedIn);

  try {
    merged = await enrichFromDateWindow(client, merged, date, limits.windowPages);
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "gingr_route_reservation_load",
        step: "date_window",
        message: error instanceof Error ? error.message.slice(0, 120) : "failed"
      })
    );
  }

  try {
    merged = await enrichFromOwnerReservations(client, merged, limits.maxOwners);
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "gingr_route_reservation_load",
        step: "owner_pull",
        message: error instanceof Error ? error.message.slice(0, 120) : "failed"
      })
    );
  }

  try {
    merged = await enrichSparseReservationDetails(client, merged, date, limits.maxSparseDetails);
  } catch (error) {
    console.warn(
      JSON.stringify({
        scope: "gingr_route_reservation_load",
        step: "sparse_detail",
        message: error instanceof Error ? error.message.slice(0, 120) : "failed"
      })
    );
  }

  if (mode === "diagnostics") {
    try {
      merged = await enrichFromAnimalScopedPulls(client, merged, date, limits.maxAnimalsScoped);
    } catch (error) {
      console.warn(
        JSON.stringify({
          scope: "gingr_route_reservation_load",
          step: "animal_scoped",
          message: error instanceof Error ? error.message.slice(0, 120) : "failed"
        })
      );
    }
  }

  return merged;
}