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

/** Authoritative completion resolution — never guess when Gingr omits completion fields. */
export type GingrServiceCompletionState = "complete" | "incomplete" | "unknown";

export type GingrServiceCompletionResolution = {
  state: GingrServiceCompletionState;
  /** Where completion was read from (for audits / debugging). */
  source:
    | "reservation.complete"
    | "reservation.completed"
    | "reservation.completed_at"
    | "reservation.status"
    | "reservation.is_complete"
    | "missing_completion_fields";
  /** True when Gingr exposed an explicit completion field we trust. */
  reliable: boolean;
};

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

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Gingr reservation Services tab / facility calendar rows expose a unix `complete`
 * timestamp when marked complete; null/empty/`0` means pending.
 *
 * See Gingr frontend (app.js): `service.complete`, `addonData.complete`, and the
 * Services table column `t.complete ? moment(1e3*t.complete)...`.
 */
export function resolveGingrServiceCompletion(service: Record<string, unknown>): GingrServiceCompletionResolution {
  if (hasOwn(service, "complete")) {
    const complete = service.complete;
    if (complete == null || complete === "" || complete === "0" || complete === 0 || complete === false) {
      return { state: "incomplete", source: "reservation.complete", reliable: true };
    }
    return { state: "complete", source: "reservation.complete", reliable: true };
  }

  if (hasOwn(service, "completed")) {
    const completed = service.completed;
    if (completed == null || completed === "" || completed === "0" || completed === 0 || completed === false) {
      return { state: "incomplete", source: "reservation.completed", reliable: true };
    }
    return { state: "complete", source: "reservation.completed", reliable: true };
  }

  if (hasOwn(service, "completed_at")) {
    const completedAt = service.completed_at;
    if (completedAt == null || completedAt === "" || completedAt === "0" || completedAt === 0 || completedAt === false) {
      return { state: "incomplete", source: "reservation.completed_at", reliable: true };
    }
    return { state: "complete", source: "reservation.completed_at", reliable: true };
  }

  if (hasOwn(service, "is_complete")) {
    const isComplete = service.is_complete;
    if (isComplete === true || isComplete === "1" || isComplete === 1) {
      return { state: "complete", source: "reservation.is_complete", reliable: true };
    }
    if (isComplete === false || isComplete === "0" || isComplete === 0 || isComplete == null) {
      return { state: "incomplete", source: "reservation.is_complete", reliable: true };
    }
  }

  const status = pickString(service.status, service.state)?.toLowerCase() || "";
  if (status) {
    if (status.includes("complete")) {
      return { state: "complete", source: "reservation.status", reliable: true };
    }
    if (status.includes("pending") || status.includes("scheduled") || status.includes("open")) {
      return { state: "incomplete", source: "reservation.status", reliable: true };
    }
  }

  return { state: "unknown", source: "missing_completion_fields", reliable: false };
}

/** @deprecated use resolveGingrServiceCompletion */
export function isGingrServiceCompleted(service: Record<string, unknown>): boolean {
  return resolveGingrServiceCompletion(service).state === "complete";
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

/** Merge two service rows for the same id — prefer the row with reliable completion fields. */
export function mergeGingrServiceRows(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>
): Record<string, unknown> {
  const primaryResolution = resolveGingrServiceCompletion(primary);
  const secondaryResolution = resolveGingrServiceCompletion(secondary);
  if (!primaryResolution.reliable && secondaryResolution.reliable) return { ...primary, ...secondary };
  if (primaryResolution.reliable) return primary;
  return { ...primary, ...secondary };
}

export function serviceRowKey(
  reservationId: string,
  service: Record<string, unknown>,
  serviceName: string,
  scheduledAt: string | null,
  date: string
): string {
  const serviceId = pickString(service.id, service.service_id, service.reservation_service_id) || serviceName;
  return `${reservationId}|${serviceId}|${scheduledAt || date}|${serviceName}`;
}
