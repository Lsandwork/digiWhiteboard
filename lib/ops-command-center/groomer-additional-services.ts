import { createGingrClient } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";

export type GingrAdditionalService = {
  id: string;
  serviceName: string;
  dogName: string | null;
  ownerName: string | null;
  scheduledAt: string | null;
  reservationId: string | null;
  reservationType: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function normalizeServiceName(name?: string | null) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Yard/club add-ons that should not appear on Groomer My Shift. */
export function isExcludedGroomerAdditionalService(name?: string | null) {
  const token = normalizeServiceName(name);
  if (!token) return false;
  if (/\bfree\b.*\bwalks?\b/.test(token)) return true;
  if (/\bgroup\s+walks?\b/.test(token)) return true;
  if (token.includes("puzzle playtime")) return true;
  if (token.includes("private training") && token.includes("business only")) return true;
  if (token.includes("daily enrichment") && token.includes("business only")) return true;
  if (token.includes("club food") && token.includes("business only")) return true;
  if (token.includes("taxi service") && token.includes("business only")) return true;
  return false;
}

/** @deprecated use isExcludedGroomerAdditionalService */
export function isFreeWalkService(name?: string | null) {
  return isExcludedGroomerAdditionalService(name);
}

function reservationServiceRows(reservation: GingrReservation): Array<Record<string, unknown>> {
  const candidates = [reservation.services, reservation.additional_services, reservation.reservation_services, reservation.addons];
  const rows: Array<Record<string, unknown>> = [];
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const item of candidate) rows.push(asRecord(item));
  }
  return rows;
}

function serviceCancelled(service: Record<string, unknown>) {
  if (service.cancelled || service.deleted || service.voided) return true;
  const status = pickString(service.status, service.state)?.toLowerCase() || "";
  return status.includes("cancel") || status.includes("void") || status === "deleted";
}

function serviceOnDate(service: Record<string, unknown>, date: string) {
  const scheduled = pickString(service.scheduled_at, service.start_date, service.date, service.service_date);
  if (!scheduled) return true;
  return scheduled.slice(0, 10) === date;
}

function dogNameFromReservation(reservation: GingrReservation) {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  return pickString(
    animal.name,
    animal.first_name,
    reservation.animal_name,
    reservation.pet_name,
    reservation.dog_name
  );
}

function ownerNameFromReservation(reservation: GingrReservation) {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  return pickString(
    owner.full_name,
    [pickString(owner.first_name, owner.o_first), pickString(owner.last_name, owner.o_last)].filter(Boolean).join(" "),
    reservation.owner_name,
    reservation.client_name
  );
}

export function additionalServicesFromReservation(
  reservation: GingrReservation,
  date: string
): GingrAdditionalService[] {
  const reservationId = pickString(reservation.reservation_id, reservation.id);
  const reservationType = pickString(
    asRecord(reservation.reservation_type).type,
    asRecord(reservation.reservation_type).name,
    asRecord(reservation.type).name,
    reservation.type_name,
    typeof reservation.type === "string" ? reservation.type : null
  );
  const dogName = dogNameFromReservation(reservation);
  const ownerName = ownerNameFromReservation(reservation);

  return reservationServiceRows(reservation)
    .filter((service) => !serviceCancelled(service))
    .map((service) => {
      const serviceName = pickString(service.name, service.service, service.type, service.service_name) || "";
      const scheduledAt = pickString(service.scheduled_at, service.start_date, service.date, service.service_date);
      return {
        service,
        serviceName,
        scheduledAt,
        serviceId: pickString(service.id, service.service_id, service.reservation_service_id)
      };
    })
    .filter((row) => row.serviceName && !isExcludedGroomerAdditionalService(row.serviceName) && serviceOnDate(row.service, date))
    .map((row) => ({
      id: `svc:${reservationId || "res"}:${row.serviceId || row.serviceName}:${row.scheduledAt || date}`,
      serviceName: row.serviceName,
      dogName,
      ownerName,
      scheduledAt: row.scheduledAt,
      reservationId,
      reservationType
    }));
}

export async function loadTodaysAdditionalServices(now = new Date()): Promise<{
  date: string;
  services: GingrAdditionalService[];
}> {
  const date = todayInLosAngeles(now);
  try {
    const reservations = await createGingrClient().listReservationsByDate(date);
    const services = reservations
      .flatMap((reservation) => additionalServicesFromReservation(reservation, date))
      .sort((a, b) => String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")) || a.serviceName.localeCompare(b.serviceName));
    return { date, services: services.slice(0, 60) };
  } catch {
    return { date, services: [] };
  }
}
