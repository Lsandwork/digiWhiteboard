import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { enrichTlBoardAnimalPhotoUrls } from "./animal-photos";
import {
  isGingrServiceCompleted,
  reservationServiceRows,
  serviceCancelled,
  serviceDisplayName,
  serviceOnDate,
  serviceRowId
} from "./gingr-service-completion";
import { requireTlGingrApiKey, tlGingrClientConfig } from "./gingr-auth";
import { lodgingLabelForArea, matchOvernightLodgingArea, parseRunName } from "./lodging";
import { isTlBoardAdditionalService } from "./tl-service-names";
import type { TlAdditionalServicesSummary, TlBoardAdditionalServiceRow } from "./types";
import type { TlDigiBoardConfig } from "./config";

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

function animalFromReservation(reservation: GingrReservation) {
  const animalField = reservation.animal ?? reservation.pet ?? reservation.dog;
  const animal =
    asRecord(animalField) ||
    (typeof animalField === "string" || typeof animalField === "number" ? { id: animalField } : null);
  const animalId = pickString(
    animal?.id,
    reservation.animal_id,
    typeof animalField === "string" || typeof animalField === "number" ? animalField : null
  );
  const dogName = pickString(
    animal?.name,
    animal?.first_name,
    reservation.animal_name,
    reservation.pet_name,
    reservation.dog_name
  );
  const photoUrl = pickString(animal?.image, animal?.image_url, animal?.photo_url, reservation.photo_url);
  return { animalId, dogName, photoUrl };
}

function lodgingFromReservation(reservation: GingrReservation, config: TlDigiBoardConfig) {
  const type = asRecord(reservation.type) || asRecord(reservation.reservation_type);
  const reservationTypeName = pickString(type?.name, type?.type, reservation.type_name);
  const reservationTypeId = pickString(type?.id, reservation.type_id, reservation.reservation_type_id);
  const areaKey = matchOvernightLodgingArea(reservationTypeName, reservationTypeId, config);
  const runName = pickString(
    asRecord(reservation.run)?.name,
    reservation.run_name,
    asRecord(reservation.lodging)?.name
  );
  const parsed = parseRunName(runName);
  const lodgingLabel =
    parsed.lodgingLabel || lodgingLabelForArea(areaKey ?? parsed.areaKey, parsed.runLabel) || null;
  return { lodgingLabel };
}

export async function loadTlBoardCheckedInReservations(): Promise<GingrReservation[]> {
  const apiKey = requireTlGingrApiKey();
  const { subdomain, locationId } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain, locationId });
  const body = new URLSearchParams({
    key: client.config.apiKey,
    location_id: client.config.locationId,
    checked_in: "true"
  });
  const response = await fetch(`${client.config.baseUrl}/api/v1/reservations`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
    },
    body,
    cache: "no-store"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gingr checked-in reservations ${response.status}: ${text.slice(0, 180) || response.statusText}`);
  }
  return normalizeGingrReservationList(await response.json()).filter(
    (reservation) => !reservationCancelled(reservation) && isCheckedInReservation(reservation)
  );
}

export function additionalServicesFromReservation(
  reservation: GingrReservation,
  date: string,
  config: TlDigiBoardConfig
): TlBoardAdditionalServiceRow[] {
  const reservationId = pickString(reservation.reservation_id, reservation.id);
  if (!reservationId) return [];

  const { animalId, dogName, photoUrl } = animalFromReservation(reservation);
  if (!animalId || !dogName) return [];

  const { lodgingLabel } = lodgingFromReservation(reservation, config);
  const rows: TlBoardAdditionalServiceRow[] = [];

  for (const service of reservationServiceRows(reservation)) {
    if (serviceCancelled(service)) continue;
    const serviceName = serviceDisplayName(service);
    if (!serviceName || !isTlBoardAdditionalService(serviceName)) continue;
    if (!serviceOnDate(service, date)) continue;

    const completed = isGingrServiceCompleted(service);
    if (completed) continue;

    const scheduledAt = pickString(service.scheduled_at, service.start_date, service.date, service.service_date);
    const gingrServiceId =
      pickString(service.id, service.service_id, service.reservation_service_id) || serviceName;

    rows.push({
      id: serviceRowId(reservationId, service, serviceName, scheduledAt, date),
      gingrServiceId,
      gingrReservationId: reservationId,
      gingrAnimalId: animalId,
      dogName,
      photoUrl,
      lodgingLabel,
      serviceName,
      scheduledAt,
      displayStatus: "needs_completion",
      serviceDate: date
    });
  }

  return rows;
}

export function buildTlAdditionalServicesSummary(
  pending: TlBoardAdditionalServiceRow[],
  completedHiddenCount = 0
): TlAdditionalServicesSummary {
  const remaining = pending.length;
  const completed = completedHiddenCount;
  return {
    due: remaining + completed,
    completed,
    remaining
  };
}

export async function syncTlBoardAdditionalServices(options: {
  config: TlDigiBoardConfig;
  now?: Date;
}): Promise<{
  services: TlBoardAdditionalServiceRow[];
  summary: TlAdditionalServicesSummary;
  completionStatusAvailable: boolean;
}> {
  const now = options.now ?? new Date();
  const date = todayInLosAngeles(now);
  const reservations = await loadTlBoardCheckedInReservations();

  let completedHiddenCount = 0;
  let sawCompletionField = false;

  for (const reservation of reservations) {
    for (const service of reservationServiceRows(reservation)) {
      const name = serviceDisplayName(service);
      if (!name || !isTlBoardAdditionalService(name)) continue;
      if (!serviceOnDate(service, date) || serviceCancelled(service)) continue;
      if ("complete" in service || "completed" in service || "completed_at" in service) {
        sawCompletionField = true;
      }
      if (isGingrServiceCompleted(service)) completedHiddenCount += 1;
    }
  }

  let services = reservations.flatMap((reservation) =>
    additionalServicesFromReservation(reservation, date, options.config)
  );

  services = services.sort(
    (a, b) =>
      String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")) ||
      a.serviceName.localeCompare(b.serviceName) ||
      a.dogName.localeCompare(b.dogName)
  );

  if (services.length) {
    const photoByAnimal = await enrichTlBoardAnimalPhotoUrls(services);
    services = services.map((row) => ({
      ...row,
      photoUrl: row.photoUrl || photoByAnimal.get(row.gingrAnimalId) || null
    }));
  }

  return {
    services,
    summary: buildTlAdditionalServicesSummary(services, completedHiddenCount),
    completionStatusAvailable: sawCompletionField || completedHiddenCount > 0 || services.length === 0
  };
}
