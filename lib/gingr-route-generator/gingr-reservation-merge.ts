/**
 * Merge Gingr reservation list payloads so route generation sees the same
 * service / addon rows staff get from multiple reservation pulls.
 */

import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { mergeGingrServiceRows, serviceRowKey } from "@/lib/tl-digi-board/gingr-service-completion";

import { RESERVATION_SERVICE_ARRAY_KEYS } from "@/lib/gingr-route-generator/reservation-service-rows";

const SERVICE_ARRAY_KEYS = RESERVATION_SERVICE_ARRAY_KEYS;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function reservationIdOf(reservation: GingrReservation): string | null {
  return pickString(reservation.reservation_id, reservation.id);
}

function serviceDisplayName(row: Record<string, unknown>): string {
  return pickString(row.name, row.service, row.type, row.s_name, row.title) || "service";
}

function mergeServiceArray(primary: unknown, secondary: unknown, reservationId: string, date: string): unknown {
  if (!Array.isArray(primary) && !Array.isArray(secondary)) return primary ?? secondary;
  const merged = new Map<string, Record<string, unknown>>();
  for (const item of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
    const row = asRecord(item);
    if (!row) continue;
    const name = serviceDisplayName(row);
    const scheduledAt = pickString(row.scheduled_at, row.start_date, row.date, row.service_date);
    const key = serviceRowKey(reservationId, row, name, scheduledAt, date);
    const existing = merged.get(key);
    merged.set(key, existing ? mergeGingrServiceRows(existing, row) : row);
  }
  return [...merged.values()];
}

function mergeReservationPair(a: GingrReservation, b: GingrReservation): GingrReservation {
  const id = reservationIdOf(a) || reservationIdOf(b) || "";
  const date = pickString(a.start_date, b.start_date)?.slice(0, 10) || "";
  const out = { ...a } as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  for (const field of SERVICE_ARRAY_KEYS) {
    out[field] = mergeServiceArray(out[field], bRecord[field], id, date);
  }
  return out as GingrReservation;
}

/**
 * Same reservation id in two pulls: union nested services / addons arrays.
 * Reservations that appear only once are kept as-is.
 */
export function mergeGingrReservationsById(primary: GingrReservation[], secondary: GingrReservation[]): GingrReservation[] {
  const map = new Map<string, GingrReservation>();
  const withoutId: GingrReservation[] = [];
  for (const reservation of primary) {
    const id = reservationIdOf(reservation);
    if (!id) {
      withoutId.push(reservation);
      continue;
    }
    map.set(id, reservation);
  }
  for (const reservation of secondary) {
    const id = reservationIdOf(reservation);
    if (!id) {
      withoutId.push(reservation);
      continue;
    }
    const existing = map.get(id);
    if (existing) map.set(id, mergeReservationPair(existing, reservation));
    else map.set(id, reservation);
  }
  return [...withoutId, ...map.values()];
}