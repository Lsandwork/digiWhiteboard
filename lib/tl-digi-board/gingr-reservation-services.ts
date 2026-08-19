/**
 * Gingr reservation services for TL Additional Services completion sync.
 *
 * ## Supported completion source (API key / TL_GINGR_KEY)
 *
 * **Primary:** `POST /api/v1/reservations`
 * - `checked_in=true` for all currently checked-in reservations
 * - `start_date` + `end_date` (today, LA) as enrichment when nested rows omit `complete`
 *
 * Service rows live on the reservation payload under `services`, `additional_services`,
 * `reservation_services`, and `addons`. Each row uses Gingr's `complete` unix field
 * (null/empty = pending; timestamp = completed). Confirmed from Gingr app.js:
 * `service.complete`, `addonData.complete`, Services table `t.complete`.
 *
 * ## Not usable with API key alone
 *
 * - `GET /services/get_by_reservation/id/{reservationId}` — session auth (302 login)
 * - No documented `/api/v1/get_service_report_history` equivalent exists (unlike medications)
 *
 * When `complete` is absent after merging both reservation pulls, completion is **unknown**
 * and the board shows `COMPLETION UNKNOWN` rather than assuming incomplete.
 */
import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { requireTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import { fetchTlGingrResponse } from "./gingr-http";
import {
  mergeGingrServiceRows,
  reservationServiceRows,
  serviceDisplayName,
  serviceRowKey
} from "./gingr-service-completion";
import { isTlBoardAdditionalService } from "./tl-service-names";

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

function reservationCancelled(reservation: GingrReservation): boolean {
  const record = reservation as Record<string, unknown>;
  if (record.cancelled_date || record.cancelled_at || record.cancelled) return true;
  const status = pickString(record.status, record.state)?.toLowerCase() || "";
  return status.includes("cancel") || status.includes("void");
}

function isCheckedInReservation(reservation: GingrReservation): boolean {
  const record = reservation as Record<string, unknown>;
  if (record.check_in_stamp || record.check_in_date || record.checked_in === true || record.checked_in === "1") {
    return true;
  }
  const status = pickString(record.status, record.status_string, record.state)?.toLowerCase() || "";
  return status.includes("checked in") || status === "checked_in";
}

async function postReservations(fields: Record<string, string>): Promise<GingrReservation[]> {
  const apiKey = requireTlGingrApiKey();
  const { subdomain, locationId } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain, locationId });
  const body = new URLSearchParams({ key: client.config.apiKey, location_id: client.config.locationId, ...fields });
  const response = await fetchTlGingrResponse(
    `${client.config.baseUrl}/api/v1/reservations`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
      },
      body,
      cache: "no-store"
    },
    "Gingr reservations"
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gingr reservations ${response.status}: ${text.slice(0, 180) || response.statusText}`);
  }
  return normalizeGingrReservationList(await response.json());
}

/** Checked-in reservations — primary TL additional-services source. */
export async function loadTlBoardCheckedInReservations(): Promise<GingrReservation[]> {
  const rows = await postReservations({ checked_in: "true" });
  return rows.filter((reservation) => !reservationCancelled(reservation) && isCheckedInReservation(reservation));
}

/** Today's reservations — enriches service rows when checked-in payload omits `complete`. */
export async function loadTlBoardReservationsByDate(date: string): Promise<GingrReservation[]> {
  const rows = await postReservations({ checked_in: "false", start_date: date, end_date: date });
  return rows.filter((reservation) => !reservationCancelled(reservation));
}

/**
 * Merge checked-in reservations with same-day reservation list.
 * Per-reservation service rows prefer whichever copy exposes reliable `complete`.
 */
export function mergeTlBoardReservationSources(
  checkedIn: GingrReservation[],
  byDate: GingrReservation[]
): GingrReservation[] {
  const map = new Map<string, GingrReservation>();

  for (const reservation of checkedIn) {
    const id = reservationIdOf(reservation);
    if (!id) continue;
    map.set(id, reservation);
  }

  for (const reservation of byDate) {
    const id = reservationIdOf(reservation);
    if (!id) continue;
    const existing = map.get(id);
    if (!existing) continue;
    map.set(id, mergeReservationServiceArrays(existing, reservation));
  }

  return [...map.values()];
}

function mergeServiceArray(
  primary: unknown,
  secondary: unknown,
  reservationId: string,
  date: string
): unknown {
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

function mergeReservationServiceArrays(a: GingrReservation, b: GingrReservation): GingrReservation {
  const id = reservationIdOf(a) || reservationIdOf(b) || "";
  const date =
    pickString(a.start_date, b.start_date)?.slice(0, 10) || todayInLosAngeles(new Date());
  const out = { ...a } as Record<string, unknown>;
  for (const field of ["services", "additional_services", "reservation_services", "addons"] as const) {
    out[field] = mergeServiceArray(
      (a as Record<string, unknown>)[field],
      (b as Record<string, unknown>)[field],
      id,
      date
    );
  }
  return out as GingrReservation;
}

export async function loadTlBoardReservationsForAdditionalServices(now = new Date()): Promise<{
  date: string;
  reservations: GingrReservation[];
}> {
  const date = todayInLosAngeles(now);
  const [checkedIn, byDate] = await Promise.all([
    loadTlBoardCheckedInReservations(),
    loadTlBoardReservationsByDate(date).catch(() => [] as GingrReservation[])
  ]);
  return {
    date,
    reservations: mergeTlBoardReservationSources(checkedIn, byDate)
  };
}

/** Flatten TL-tracked service rows from reservations for audits. */
export function collectTlTrackedServiceRows(
  reservations: GingrReservation[],
  date: string
): Array<{
  reservationId: string;
  service: Record<string, unknown>;
  serviceName: string;
  scheduledAt: string | null;
}> {
  const rows: Array<{
    reservationId: string;
    service: Record<string, unknown>;
    serviceName: string;
    scheduledAt: string | null;
  }> = [];
  for (const reservation of reservations) {
    const reservationId = reservationIdOf(reservation);
    if (!reservationId) continue;
    for (const service of reservationServiceRows(reservation)) {
      const serviceName = serviceDisplayName(service);
      if (!serviceName || !isTlBoardAdditionalService(serviceName)) continue;
      const scheduledAt = pickString(service.scheduled_at, service.start_date, service.date, service.service_date);
      if (scheduledAt && scheduledAt.slice(0, 10) !== date) continue;
      rows.push({ reservationId, service, serviceName, scheduledAt });
    }
  }
  return rows;
}
