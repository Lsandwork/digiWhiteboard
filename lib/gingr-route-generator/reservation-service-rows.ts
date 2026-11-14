/**
 * Nested service / addon arrays on Gingr reservation payloads (API shapes vary by report).
 */

export const RESERVATION_SERVICE_ARRAY_KEYS = [
  "services",
  "service_items",
  "additional_services",
  "reservation_services",
  "addons",
  "service_addons",
  "service_addon",
  "appointment_options",
  "reservation_options",
  "options"
] as const;

export function listReservationServiceArrays(reservation: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const key of RESERVATION_SERVICE_ARRAY_KEYS) {
    const value = reservation[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        rows.push(item as Record<string, unknown>);
      }
    }
  }
  return rows;
}