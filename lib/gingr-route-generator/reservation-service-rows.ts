/**
 * Nested service / addon arrays on Gingr reservation payloads (API shapes vary by report).
 */

export const RESERVATION_SERVICE_ARRAY_KEYS = [
  "services",
  "service_items",
  "serviceItems",
  "additional_services",
  "reservation_services",
  "addons",
  "r_addons",
  "r_addon",
  "s_addons",
  "s_addon",
  "service_addons",
  "service_addon",
  "line_items",
  "selected_options",
  "appointment_options",
  "reservation_options",
  "options"
] as const;

export function listReservationServiceArrays(reservation: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const key of RESERVATION_SERVICE_ARRAY_KEYS) {
    const value = reservation[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          rows.push(item as Record<string, unknown>);
        } else if (typeof item === "string" && item.trim()) {
          rows.push({ name: item.trim() });
        }
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      for (const part of value.split(/\s*[,;\n]\s*/)) {
        const name = part.trim();
        if (name) rows.push({ name });
      }
    }
  }
  return rows;
}