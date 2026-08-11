/**
 * Canonical Samsara dashboard bulk-upload headers (columns A–K).
 * Source of truth: company sample downloads + Samsara route CSV bulk upload
 * (e.g. fitdog-samsara-routes.csv from May 2026). Any other names are rejected
 * with "One or more column headers are not supported."
 */
export const SAMSARA_BULK_UPLOAD_HEADERS = [
  "Route Name",
  "Assigned Driver Username",
  "Assigned Vehicle Name",
  "Stop Name",
  "Stop Arrival Time",
  "Stop Departure Time",
  "Stop Notes",
  "Address Name",
  "Latitude",
  "Longitude",
  "Full Address"
] as const;

/** Headers that Samsara rejects (wrong aliases / leftover Digi columns). */
export const SAMSARA_UNSUPPORTED_HEADERS = [
  "Route Notes",
  "Assigned Vehicle",
  "Assigned Driver",
  "Notes",
  "Stop Address",
  "Scheduled Arrival Time",
  "Scheduled Departure Time",
  "Scheduled Arrival",
  "Scheduled Departure",
  "Route Date",
  "Stop Order"
] as const;

export type SamsaraTemplate = {
  headers: string[];
  delimiter: string;
  encoding: string;
  mappings: Record<string, string | null>; // samsara column -> route field
};

/** Always-valid template for Fitdog raw lat/lng + full address uploads. */
export function getCanonicalSamsaraTemplate(): SamsaraTemplate {
  const headers = [...SAMSARA_BULK_UPLOAD_HEADERS];
  return {
    headers,
    delimiter: ",",
    encoding: "utf-8",
    mappings: autoMapSamsaraHeaders(headers)
  };
}

export type ExportStopRow = {
  routeName: string;
  routeNotes: string;
  vehicleName: string;
  driverName: string;
  stopName: string;
  stopNotes: string;
  stopAddress: string;
  scheduledArrival: string;
  scheduledDeparture: string;
  routeDate: string;
  stopOrder: number;
  latitude: string;
  longitude: string;
};

const FIELD_GETTERS: Record<string, (row: ExportStopRow) => string | number> = {
  route_name: (r) => r.routeName,
  route_notes: (r) => r.routeNotes,
  assigned_vehicle: (r) => r.vehicleName,
  vehicle: (r) => r.vehicleName,
  assigned_driver: (r) => r.driverName,
  driver: (r) => r.driverName,
  stop_name: (r) => r.stopName,
  stop_notes: (r) => r.stopNotes,
  notes: (r) => r.stopNotes,
  stop_address: (r) => r.stopAddress,
  full_address: (r) => r.stopAddress,
  address: (r) => r.stopAddress,
  scheduled_arrival: (r) => r.scheduledArrival,
  scheduled_departure: (r) => r.scheduledDeparture,
  route_date: (r) => r.routeDate,
  stop_order: (r) => r.stopOrder,
  latitude: (r) => r.latitude,
  longitude: (r) => r.longitude
};

/**
 * Map Samsara bulk-upload headers (columns A–K from the dashboard sample) to export fields.
 * Unsupported / unused columns (e.g. Address Name when using raw lat/lng) map to null.
 */
export function autoMapSamsaraHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const header of headers) {
    const h = header.toLowerCase().trim();
    if (/route.?name/.test(h)) mapping[header] = "route_name";
    else if (/route.?note/.test(h)) mapping[header] = "route_notes";
    else if (/full.?address/.test(h)) mapping[header] = "full_address";
    else if (/address.?name/.test(h)) mapping[header] = null; // address-book mode; leave blank for raw
    else if (/^notes$/.test(h) || /stop.?note/.test(h)) mapping[header] = "stop_notes";
    else if (/vehicle/.test(h)) mapping[header] = "assigned_vehicle";
    else if (/driver/.test(h)) mapping[header] = "assigned_driver";
    else if (/stop.?name/.test(h)) mapping[header] = "stop_name";
    else if (/address/.test(h)) mapping[header] = "stop_address";
    else if (/arrival/.test(h)) mapping[header] = "scheduled_arrival";
    else if (/departure/.test(h)) mapping[header] = "scheduled_departure";
    else if (/date/.test(h)) mapping[header] = "route_date";
    else if (/order|sequence/.test(h)) mapping[header] = "stop_order";
    else if (/^lat/.test(h)) mapping[header] = "latitude";
    else if (/^(lng|lon)/.test(h)) mapping[header] = "longitude";
    else mapping[header] = null;
  }
  return mapping;
}

/**
 * Format a Date for Samsara route CSV upload in org-local wall time.
 * Samsara bulk upload expects M/D/YYYY H:mm (24h) — keep zero-padded for stable parsing.
 */
export function formatSamsaraCsvDateTime(date: Date, timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("month")}/${get("day")}/${get("year")} ${hour}:${get("minute")}`;
}

/** Pad Fitdog van labels to match Samsara vehicle names (Van 01 … Van 06). Never Van 04. */
export function normalizeSamsaraVehicleName(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/van[\s_-]*0*([1-9]\d*)/i);
  if (match) {
    const n = Number(match[1]);
    if (n === 4) throw new Error("Van 4 must never appear in Samsara exports.");
    return `Van ${String(n).padStart(2, "0")}`;
  }
  return raw;
}

/** Keep lat/lng numeric and compact so Samsara does not reject the row. */
export function formatSamsaraCoordinate(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(7)));
}

/** Max Stop Notes length — longer cells have triggered Samsara bulk-upload 500s. */
export const SAMSARA_STOP_NOTES_MAX_CHARS = 480;

/** Calendar date in America/Los_Angeles as YYYY-MM-DD. */
export function todayInLosAngeles(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** Extract MM/DD/YYYY → YYYY-MM-DD from a Samsara CSV datetime cell. */
export function operatingDateFromSamsaraCsvDateTime(value: string): string | null {
  const parsed = parseSamsaraCsvDateTime(value);
  if (!parsed) return null;
  const m = String(value)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+/);
  if (!m) return null;
  return `${m[3]}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** True when a Samsara datetime cell is on the plan's operating date. */
export function samsaraCsvDateTimeMatchesOperatingDate(value: string, operatingDate: string): boolean {
  const cellDate = operatingDateFromSamsaraCsvDateTime(value);
  return Boolean(cellDate && cellDate === operatingDate);
}

/**
 * Flatten multiline driver notes for CSV bulk upload.
 * Newlines inside quoted cells are valid CSV, but Samsara's importer often marks
 * those rows as incorrect / Internal Server Error — keep one short line.
 */
export function sanitizeSamsaraNotes(value: string | null | undefined): string {
  const flat = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Strip control chars that have crashed Samsara's importer.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= SAMSARA_STOP_NOTES_MAX_CHARS) return flat;
  return `${flat.slice(0, SAMSARA_STOP_NOTES_MAX_CHARS - 1).trimEnd()}…`;
}

/** Sanitize stop/route display text for CSV cells. */
export function sanitizeSamsaraText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * If an ETA datetime landed on the wrong calendar day (UTC/storage drift),
 * rebuild arrival/departure on the plan operating date using synthesized times.
 */
export function ensureScheduleOnOperatingDate(params: {
  operatingDate: string;
  arrival: string;
  departure: string;
  direction: "pickup" | "dropoff";
  stopIndex: number;
  stopCount: number;
  vanKey?: string | null;
}): { arrival: string; departure: string; realigned: boolean } {
  const arrivalOk =
    !params.arrival.trim() || samsaraCsvDateTimeMatchesOperatingDate(params.arrival, params.operatingDate);
  const departureOk =
    !params.departure.trim() ||
    samsaraCsvDateTimeMatchesOperatingDate(params.departure, params.operatingDate);
  if (arrivalOk && departureOk && params.arrival.trim() && params.departure.trim()) {
    return { arrival: params.arrival, departure: params.departure, realigned: false };
  }
  const synthesized = synthesizeStopSchedule({
    operatingDate: params.operatingDate,
    direction: params.direction,
    stopIndex: params.stopIndex,
    stopCount: params.stopCount,
    vanKey: params.vanKey
  });
  return { arrival: synthesized.arrival, departure: synthesized.departure, realigned: true };
}

/** Parse `MM/DD/YYYY HH:mm` used in our Samsara CSV cells. */
export function parseSamsaraCsvDateTime(value: string): Date | null {
  const m = String(value)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

/**
 * Drop-off route start times (America/Los_Angeles):
 * - Van 1 / 2 / 3 (outing): 10:30 — leave trail/beach for home drop-offs
 * - Van 5 / 6 (club): 12:00 — after group classes end; Van 5 for taxi/club drop-offs
 */
export function dropoffStartTimeForVan(vanKey?: string | null): { hour: number; minute: number } {
  const key = String(vanKey ?? "").trim().toLowerCase();
  if (key === "van_5" || key === "van_6") return { hour: 12, minute: 0 };
  // van_1, van_2, van_3 (and unknown outing vans)
  return { hour: 10, minute: 30 };
}

/**
 * Build spaced stop arrival/departure times for a route when ETAs were not persisted.
 * Pickup defaults to 07:00 PT.
 * Drop-off: Van 1/2/3 → 10:30 PT; Van 5/6 → 12:00 PT.
 */
export function synthesizeStopSchedule(params: {
  operatingDate: string; // YYYY-MM-DD
  direction: "pickup" | "dropoff";
  stopIndex: number;
  stopCount: number;
  minutesPerStop?: number;
  vanKey?: string | null;
}): { arrival: string; departure: string } {
  const minutesPerStop = params.minutesPerStop ?? 8;
  let startHour = 7;
  let startMinute = 0;
  if (params.direction === "dropoff") {
    const drop = dropoffStartTimeForVan(params.vanKey);
    startHour = drop.hour;
    startMinute = drop.minute;
  }
  const localStamp = `${params.operatingDate}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;
  const startMs = civilTimeToUtcMs(localStamp, "America/Los_Angeles");
  const arriveMs = startMs + params.stopIndex * minutesPerStop * 60_000;
  // Samsara rejects rows when departure is missing or earlier than arrival.
  // Keep a short dwell even on the final stop.
  const dwellMinutes = Math.max(1, Math.min(5, minutesPerStop));
  const departMs = arriveMs + dwellMinutes * 60_000;
  return {
    arrival: formatSamsaraCsvDateTime(new Date(arriveMs)),
    departure: formatSamsaraCsvDateTime(new Date(departMs))
  };
}

/** Convert a civil local datetime `YYYY-MM-DDTHH:mm:ss` in `timeZone` to UTC epoch ms. */
export function civilTimeToUtcMs(localIso: string, timeZone: string): number {
  const m = localIso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!m) throw new Error(`Invalid civil time: ${localIso}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] ?? 0);
  // Guess UTC, then correct using the timezone offset at that instant.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).formatToParts(new Date(guess));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") === 24 ? 0 : get("hour"),
      get("minute"),
      get("second")
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += desired - asUtc;
  }
  return guess;
}

/** Escape CSV cell; neutralize formula injection without breaking numeric lat/lng. */
export function escapeCsvCell(value: unknown, delimiter = ","): string {
  let text = value == null ? "" : String(value);
  // Only neutralize spreadsheet formulas. Do NOT prefix real negative numbers
  // (Samsara longitude values like -118.49 must stay numeric).
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(text.trim());
  if (!isPlainNumber && /^[=+\-@]/.test(text)) text = `'${text}`;
  const needsQuotes =
    text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter);
  if (text.includes('"')) text = text.replace(/"/g, '""');
  return needsQuotes ? `"${text}"` : text;
}

export function buildCsv(params: {
  template: SamsaraTemplate;
  rows: ExportStopRow[];
}): { csv: string; errors: string[] } {
  const { template, rows } = params;
  const errors: string[] = [];
  if (!template.headers.length) errors.push("Active Samsara template has no headers.");
  const lines = [template.headers.map((h) => escapeCsvCell(h, template.delimiter)).join(template.delimiter)];

  for (const row of rows) {
    const cells = template.headers.map((header) => {
      const field = template.mappings[header];
      if (!field) return "";
      const getter = FIELD_GETTERS[field];
      if (!getter) return "";
      return escapeCsvCell(getter(row), template.delimiter);
    });
    lines.push(cells.join(template.delimiter));
  }

  return { csv: lines.join("\n") + "\n", errors };
}

export function validateExport(params: {
  template: SamsaraTemplate;
  rows: ExportStopRow[];
  csv: string;
  /** When set, every stop arrival/departure must fall on this YYYY-MM-DD. */
  operatingDate?: string;
}): {
  ok: boolean;
  report: Record<string, unknown>;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const headerLine = params.csv.split(/\r?\n/)[0] ?? "";
  const parsedHeaders = headerLine.split(params.template.delimiter).map((h) => h.replace(/^"|"$/g, "").trim());
  const canonical = SAMSARA_BULK_UPLOAD_HEADERS.join("|");
  if (parsedHeaders.join("|") !== canonical) {
    errors.push(
      `Header names/order must exactly match Samsara bulk-upload columns A–K: ${SAMSARA_BULK_UPLOAD_HEADERS.join(", ")}`
    );
  }
  for (const bad of SAMSARA_UNSUPPORTED_HEADERS) {
    if (parsedHeaders.includes(bad)) {
      errors.push(`Unsupported Samsara header present: ${bad}`);
    }
  }
  if (!params.rows.length) errors.push("Export has no stop rows.");
  for (const row of params.rows) {
    if (!row.stopName?.trim()) {
      errors.push(`Missing Stop Name on route ${row.routeName}`);
    }
    if (!row.scheduledArrival?.trim() || !row.scheduledDeparture?.trim()) {
      errors.push(`Missing scheduled arrival/departure on route ${row.routeName} stop "${row.stopName}"`);
    } else {
      const arrival = parseSamsaraCsvDateTime(row.scheduledArrival);
      const departure = parseSamsaraCsvDateTime(row.scheduledDeparture);
      if (!arrival || !departure) {
        errors.push(
          `Bad datetime on ${row.routeName} stop "${row.stopName}" (use MM/DD/YYYY HH:mm). Got arrival="${row.scheduledArrival}" departure="${row.scheduledDeparture}"`
        );
      } else if (departure.getTime() < arrival.getTime()) {
        errors.push(
          `Departure before arrival on ${row.routeName} stop "${row.stopName}" (${row.scheduledArrival} → ${row.scheduledDeparture})`
        );
      } else if (params.operatingDate) {
        if (!samsaraCsvDateTimeMatchesOperatingDate(row.scheduledArrival, params.operatingDate)) {
          errors.push(
            `Arrival date must be ${params.operatingDate} on ${row.routeName} stop "${row.stopName}" (got "${row.scheduledArrival}"). Wrong-day times cause Samsara upload failures.`
          );
        }
        if (!samsaraCsvDateTimeMatchesOperatingDate(row.scheduledDeparture, params.operatingDate)) {
          errors.push(
            `Departure date must be ${params.operatingDate} on ${row.routeName} stop "${row.stopName}" (got "${row.scheduledDeparture}").`
          );
        }
      }
    }
    // Raw lat/lng mode: Samsara bulk upload often 500s when any of these are missing.
    if (!row.stopAddress?.trim() || !row.latitude?.trim() || !row.longitude?.trim()) {
      errors.push(
        `Stop "${row.stopName}" on ${row.routeName} needs Full Address, Latitude, and Longitude before Samsara upload.`
      );
    }
    if (row.latitude && !/^-?\d+(\.\d+)?$/.test(row.latitude.trim())) {
      errors.push(`Invalid Latitude on ${row.routeName} stop "${row.stopName}": ${row.latitude}`);
    }
    if (row.longitude && !/^-?\d+(\.\d+)?$/.test(row.longitude.trim())) {
      errors.push(`Invalid Longitude on ${row.routeName} stop "${row.stopName}": ${row.longitude}`);
    }
    const latN = Number(row.latitude);
    const lngN = Number(row.longitude);
    if (row.latitude && row.longitude && Number.isFinite(latN) && Number.isFinite(lngN)) {
      if (latN === 0 && lngN === 0) {
        errors.push(`Stop "${row.stopName}" on ${row.routeName} has 0,0 coordinates — fix geocode before upload.`);
      } else if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
        errors.push(`Stop "${row.stopName}" on ${row.routeName} has out-of-range coordinates.`);
      } else if (latN < 32 || latN > 36 || lngN > -114 || lngN < -122) {
        // Soft SoCal envelope — warn only (taxi / edge addresses can sit near the rim).
        warnings.push(
          `Stop "${row.stopName}" on ${row.routeName} coordinates look outside the usual Fitdog service area (${row.latitude}, ${row.longitude}).`
        );
      }
    }
    if (/\n|\r/.test(row.stopNotes || "")) {
      errors.push(`Multiline Notes on ${row.routeName} stop "${row.stopName}" — flatten before upload.`);
    }
    if ((row.stopNotes || "").length > SAMSARA_STOP_NOTES_MAX_CHARS) {
      errors.push(
        `Stop Notes too long on ${row.routeName} stop "${row.stopName}" (${row.stopNotes.length} chars). Cap at ${SAMSARA_STOP_NOTES_MAX_CHARS}.`
      );
    }
    if (row.driverName?.trim() && row.vehicleName?.trim()) {
      errors.push(
        `Route ${row.routeName} assigns both driver and vehicle — leave Assigned Driver Username blank when using Van 01–06.`
      );
    }
  }

  const byRoute = new Map<string, ExportStopRow[]>();
  for (const row of params.rows) {
    const list = byRoute.get(row.routeName) ?? [];
    list.push(row);
    byRoute.set(row.routeName, list);
    if (!row.vehicleName) errors.push(`Missing vehicle name on route ${row.routeName}`);
    if (/van\s*4/i.test(row.vehicleName) || /van_4/i.test(row.routeName)) {
      errors.push("Van 4 must never appear in exports.");
    }
    // Prefer exact Samsara roster labels (Van 01…). Soft warning only if non-standard.
    if (row.vehicleName && !/^Van 0[12356]$/.test(row.vehicleName)) {
      warnings.push(
        `Vehicle "${row.vehicleName}" on ${row.routeName} should exactly match a Samsara vehicle name (Van 01, Van 02, Van 03, Van 05, Van 06).`
      );
    }
  }

  for (const [routeName, stops] of byRoute) {
    if (stops.length < 2) errors.push(`Route ${routeName} has fewer than two stops.`);
    const orders = stops.map((s) => s.stopOrder);
    const sorted = [...orders].sort((a, b) => a - b);
    if (orders.join(",") !== sorted.join(",")) warnings.push(`Route ${routeName} stop order was resorted for validation.`);
  }

  // ZIP / scientific notation checks on addresses
  for (const row of params.rows) {
    if (/\d+e\+\d+/i.test(row.stopAddress)) errors.push("Scientific notation detected in an address/ZIP field.");
  }

  return {
    ok: errors.length === 0,
    report: {
      routeCount: byRoute.size,
      stopCount: params.rows.length,
      headerMatch: errors.every((e) => !/header/i.test(e)),
      operatingDate: params.operatingDate ?? null,
      errors,
      warnings,
      validationResult: errors.length === 0 ? "passed" : "failed"
    }
  };
}

export function buildRouteName(params: {
  date: string; // YYYY-MM-DD
  direction: "pickup" | "dropoff";
  vanDisplay: string;
}): string {
  const wave = params.direction === "pickup" ? "AM Pickup" : "PM Drop-Off";
  return `${params.date} ${wave} - ${params.vanDisplay}`;
}
