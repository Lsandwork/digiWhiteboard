import type { GingrReservation } from "@/lib/integrations/gingr/types";

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

/** Reservation nested service rows — same sources as groomer / My Shift feeds. */
export function reservationServiceRows(reservation: GingrReservation): Array<Record<string, unknown>> {
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

export function serviceCancelled(service: Record<string, unknown>): boolean {
  if (service.cancelled || service.deleted || service.voided) return true;
  const status = pickString(service.status, service.state)?.toLowerCase() || "";
  return status.includes("cancel") || status.includes("void") || status === "deleted";
}

export function serviceOnDate(service: Record<string, unknown>, date: string): boolean {
  const scheduled = pickString(service.scheduled_at, service.start_date, service.date, service.service_date);
  if (!scheduled) return true;
  return scheduled.slice(0, 10) === date;
}

/**
 * Gingr marks services complete with a unix `complete` timestamp (see facility
 * calendar / reservation services UI). Null / empty means still pending.
 */
export function isGingrServiceCompleted(service: Record<string, unknown>): boolean {
  const complete = service.complete ?? service.completed ?? service.completed_at;
  if (complete != null && complete !== "" && complete !== "0" && complete !== 0 && complete !== false) {
    return true;
  }
  const status = pickString(service.status, service.state)?.toLowerCase() || "";
  if (status.includes("complete")) return true;
  if (service.is_complete === true || service.is_complete === "1" || service.is_complete === 1) return true;
  return false;
}

export function serviceDisplayName(service: Record<string, unknown>): string {
  return (
    pickString(service.name, service.service, service.type, service.service_name, service.service_type) || ""
  );
}

export function serviceRowId(
  reservationId: string,
  service: Record<string, unknown>,
  serviceName: string,
  scheduledAt: string | null,
  date: string
): string {
  const serviceId = pickString(service.id, service.service_id, service.reservation_service_id) || serviceName;
  return `svc:${reservationId}:${serviceId}:${scheduledAt || date}`;
}
