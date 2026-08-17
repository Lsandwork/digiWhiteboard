import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { enrichTlBoardAnimalPhotoUrls } from "./animal-photos";
import { auditTlAdditionalServicesFromReservations } from "./additional-services-audit";
import {
  resolveGingrServiceCompletion,
  serviceCancelled,
  serviceDisplayName,
  serviceOnDate,
  serviceRowId
} from "./gingr-service-completion";
import { loadTlBoardReservationsForAdditionalServices } from "./gingr-reservation-services";
import { lodgingLabelForArea, matchOvernightLodgingArea, parseRunName } from "./lodging";
import { isTlBoardAdditionalService } from "./tl-service-names";
import type {
  TlAdditionalServicesCompletionAudit,
  TlAdditionalServicesSummary,
  TlBoardAdditionalServiceRow
} from "./types";
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

function reservationServiceRowsFromReservation(reservation: GingrReservation) {
  const record = reservation as Record<string, unknown>;
  const candidates = [record.services, record.additional_services, record.reservation_services, record.addons];
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) {
      const row = asRecord(item);
      if (row) rows.push(row);
    }
  }
  return rows;
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

  for (const service of reservationServiceRowsFromReservation(reservation)) {
    if (serviceCancelled(service)) continue;
    const serviceName = serviceDisplayName(service);
    if (!serviceName || !isTlBoardAdditionalService(serviceName)) continue;
    if (!serviceOnDate(service, date)) continue;

    const resolution = resolveGingrServiceCompletion(service);
    if (resolution.state === "complete") continue;

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
      displayStatus: resolution.reliable ? "needs_completion" : "completion_unknown",
      completionState: resolution.state === "unknown" ? "unknown" : "incomplete",
      completionReliable: resolution.reliable,
      completionSource: resolution.source,
      serviceDate: date
    });
  }

  return rows;
}

export function buildTlAdditionalServicesSummary(input: {
  pending: TlBoardAdditionalServiceRow[];
  completedHiddenCount: number;
}): TlAdditionalServicesSummary {
  const knownIncomplete = input.pending.filter((row) => row.displayStatus === "needs_completion").length;
  const completionUnknown = input.pending.filter((row) => row.displayStatus === "completion_unknown").length;
  const remaining = knownIncomplete + completionUnknown;
  const completed = input.completedHiddenCount;
  return {
    due: remaining + completed,
    completed,
    remaining,
    knownIncomplete,
    completionUnknown
  };
}

export async function syncTlBoardAdditionalServices(options: {
  config: TlDigiBoardConfig;
  now?: Date;
}): Promise<{
  services: TlBoardAdditionalServiceRow[];
  summary: TlAdditionalServicesSummary;
  completionStatusAvailable: boolean;
  audit: TlAdditionalServicesCompletionAudit;
}> {
  const now = options.now ?? new Date();
  const { date, reservations } = await loadTlBoardReservationsForAdditionalServices(now);
  const audit = auditTlAdditionalServicesFromReservations(reservations, date, now);

  let completedHiddenCount = 0;
  for (const reservation of reservations) {
    for (const service of reservationServiceRowsFromReservation(reservation)) {
      const name = serviceDisplayName(service);
      if (!name || !isTlBoardAdditionalService(name)) continue;
      if (!serviceOnDate(service, date) || serviceCancelled(service)) continue;
      const resolution = resolveGingrServiceCompletion(service);
      if (resolution.state === "complete") completedHiddenCount += 1;
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
    summary: buildTlAdditionalServicesSummary({ pending: services, completedHiddenCount }),
    completionStatusAvailable: audit.allReliable,
    audit
  };
}

export { loadTlBoardCheckedInReservations } from "./gingr-reservation-services";
