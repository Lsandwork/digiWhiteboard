/**
 * Load and merge Gingr reservations for a single route date, including pulls that
 * surface nested Service Addon rows omitted from the primary date list.
 */

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

function ownerIdFromReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const owner =
    record.owner && typeof record.owner === "object" && !Array.isArray(record.owner)
      ? (record.owner as Record<string, unknown>)
      : null;
  return pickString(record.owner_id, record.o_id, record.client_id, owner?.id, owner?.owner_id);
}

const MAX_OWNER_ENRICHMENT = 64;
const OWNER_FETCH_CONCURRENCY = 4;

async function enrichFromOwnerReservations(
  client: GingrClient,
  reservations: GingrReservation[]
): Promise<GingrReservation[]> {
  const ownerIds = new Set<string>();
  for (const reservation of reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    if (ownerId) ownerIds.add(ownerId);
  }
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
 * Date-scoped reservations plus checked-in rows and per-owner pulls so nested
 * `service_items` / sibling transport reservations merge onto the same dog.
 */
export async function loadGingrReservationsForRouteDate(client: GingrClient, date: string): Promise<GingrReservation[]> {
  const [byDate, checkedIn] = await Promise.all([
    client.listReservationsByDate(date),
    client.listCheckedInReservations().catch(() => [] as GingrReservation[])
  ]);
  const merged = mergeGingrReservationsById(byDate, checkedIn);
  return enrichFromOwnerReservations(client, merged);
}