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
 * Official cloud.samsara.com bulk-upload samples use unpadded `m/d/yyyy H:mm`
 * (e.g. `6/10/2026 1:30`, `8/11/2026 7:05`) — zero-padded `MM/DD/YYYY HH:mm`
 * has coincided with Internal Server Error on upload.
 */
export function formatSamsaraCsvDateTime(date: Date, timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hourRaw = get("hour");
  const hour = hourRaw === "24" ? "0" : String(Number(hourRaw));
  return `${Number(get("month"))}/${Number(get("day"))}/${get("year")} ${hour}:${get("minute")}`;
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
export const SAMSARA_STOP_NAME_MAX_CHARS = 120;
export const SAMSARA_ROUTE_NAME_MAX_CHARS = 120;
export const SAMSARA_ADDRESS_MAX_CHARS = 250;

/** Exact Samsara vehicle roster labels Digi may export. */
export const SAMSARA_ALLOWED_VEHICLE_NAMES = ["Van 01", "Van 02", "Van 03", "Van 05", "Van 06"] as const;

export function isAllowedSamsaraVehicleName(value: string | null | undefined): boolean {
  return (SAMSARA_ALLOWED_VEHICLE_NAMES as readonly string[]).includes(String(value ?? "").trim());
}

/**
 * Strip characters that have crashed Samsara's bulk CSV importer (ZWSP, bidi,
 * emoji, smart punctuation). Keep printable ASCII (optionally newlines for notes).
 */
export function toSamsaraSafeAscii(value: string, options?: { keepNewlines?: boolean }): string {
  const mapped = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2028\u2029]/g, " ")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    // Legacy separators stored in driver notes. Map to ASCII "|" so drivers keep the
    // visual break instead of the fields running together after the ASCII strip.
    .replace(/[\u00B7\u2022\u2219\u30FB]/g, "|")
    .replace(/\u2026/g, "...");
  if (options?.keepNewlines) {
    return mapped.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  }
  return mapped.replace(/[^\x20-\x7E]/g, " ");
}

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
 * those rows as incorrect / Internal Server Error — keep one short ASCII line.
 *
 * IMPORTANT: use ASCII `|` separators only. Middle-dot `·` (U+00B7) is non-ASCII;
 * joining with it after toSamsaraSafeAscii re-introduced characters that Digi's
 * fail-closed ASCII check rejects (blocking download) or that Samsara 500s on.
 */
export function sanitizeSamsaraNotes(value: string | null | undefined): string {
  const flat = toSamsaraSafeAscii(String(value ?? ""), { keepNewlines: true })
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim();
  // Final ASCII pass — strips any separator mistakes and leftover non-ASCII.
  const ascii = toSamsaraSafeAscii(flat).replace(/\s+/g, " ").trim();
  if (ascii.length <= SAMSARA_STOP_NOTES_MAX_CHARS) return ascii;
  return `${ascii.slice(0, SAMSARA_STOP_NOTES_MAX_CHARS - 3).trimEnd()}...`;
}

/** Sanitize stop/route display text for CSV cells. */
export function sanitizeSamsaraText(value: string | null | undefined): string {
  return toSamsaraSafeAscii(String(value ?? ""))
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse one CSV line respecting quotes (for post-build round-trip checks). */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
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

/** Parse `m/d/yyyy H:mm` used in our Samsara CSV cells (also accepts zero-padded). */
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

/** Minimum dwell Samsara needs between arrival and departure on one stop. */
export const SAMSARA_MIN_STOP_DWELL_MINUTES = 5;
/** Minimum travel gap between one stop's departure and the next stop's arrival. */
export const SAMSARA_MIN_TRAVEL_GAP_MINUTES = 1;

type WallClock = { month: number; day: number; year: number; minutes: number };

/**
 * Parse a CSV datetime cell as pure wall clock.
 *
 * `parseSamsaraCsvDateTime` returns a Date built in the *server* timezone, so
 * re-formatting it with `formatSamsaraCsvDateTime` (America/Los_Angeles) shifts the
 * time by the server offset — on Vercel (UTC) that silently moved stops by 7 hours.
 * Schedule repair therefore works on wall-clock minutes and never round-trips a Date.
 */
function parseWallClock(value: string): WallClock | null {
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
  return { month, day, year, minutes: hour * 60 + minute };
}

function formatWallClock(base: WallClock, minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${base.month}/${base.day}/${base.year} ${hour}:${String(minute).padStart(2, "0")}`;
}

/**
 * Force each route's stop times to move strictly forward.
 *
 * Facility ("already on-site") stops and the return-to-depot stop are timed from
 * different baselines than the optimizer's customer legs, so a route could end at
 * 11:18 after a stop that departed 11:50. Samsara answers those uploads with
 * "Internal Server Error", and blocking the download instead pushed coordinators
 * back to a stale CSV in Downloads. Repair the order here so the file is always
 * uploadable, and report what moved.
 */
export function enforceMonotonicRouteSchedule(rows: ExportStopRow[]): {
  adjustedStops: number;
  adjustments: string[];
} {
  const byRoute = new Map<string, ExportStopRow[]>();
  for (const row of rows) {
    const list = byRoute.get(row.routeName) ?? [];
    list.push(row);
    byRoute.set(row.routeName, list);
  }

  let adjustedStops = 0;
  const adjustments: string[] = [];

  for (const [routeName, stops] of byRoute) {
    const ordered = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    let previousDepartureMinutes: number | null = null;
    let previousBase: WallClock | null = null;

    for (const stop of ordered) {
      const arrival = parseWallClock(stop.scheduledArrival);
      const departure = parseWallClock(stop.scheduledDeparture);
      const base: WallClock | null = arrival ?? departure ?? previousBase;
      // Unparseable and no anchor to rebuild from — leave for validateExport to report.
      if (!base) continue;

      const originalArrivalMinutes: number | null = arrival ? arrival.minutes : null;
      const originalDepartureMinutes: number | null = departure ? departure.minutes : null;
      const originalDwell =
        originalArrivalMinutes != null &&
        originalDepartureMinutes != null &&
        originalDepartureMinutes > originalArrivalMinutes
          ? originalDepartureMinutes - originalArrivalMinutes
          : SAMSARA_MIN_STOP_DWELL_MINUTES;

      let arrivalMinutes: number =
        originalArrivalMinutes ??
        (previousDepartureMinutes == null
          ? Math.max(0, (originalDepartureMinutes ?? 0) - SAMSARA_MIN_STOP_DWELL_MINUTES)
          : previousDepartureMinutes + SAMSARA_MIN_TRAVEL_GAP_MINUTES);
      if (previousDepartureMinutes != null) {
        const earliest: number = previousDepartureMinutes + SAMSARA_MIN_TRAVEL_GAP_MINUTES;
        if (arrivalMinutes < earliest) arrivalMinutes = earliest;
      }
      if (arrivalMinutes < 0) arrivalMinutes = 0;
      let departureMinutes: number = originalDepartureMinutes ?? arrivalMinutes + originalDwell;

      const arrivalMoved = originalArrivalMinutes == null || arrivalMinutes !== originalArrivalMinutes;
      if (arrivalMoved || departureMinutes <= arrivalMinutes) {
        departureMinutes = arrivalMinutes + Math.max(SAMSARA_MIN_STOP_DWELL_MINUTES, originalDwell);
      }

      const nextArrival = formatWallClock(base, arrivalMinutes);
      const nextDeparture = formatWallClock(base, departureMinutes);
      // Report only real time movement — rewriting `07:05` as `7:05` is formatting.
      const movedMinutes =
        originalArrivalMinutes == null ||
        arrivalMinutes !== originalArrivalMinutes ||
        originalDepartureMinutes == null ||
        departureMinutes !== originalDepartureMinutes;
      if (movedMinutes) {
        adjustments.push(
          `${routeName} stop "${stop.stopName}": ${stop.scheduledArrival || "(blank)"} -> ${nextArrival}, ${
            stop.scheduledDeparture || "(blank)"
          } -> ${nextDeparture}`
        );
        adjustedStops += 1;
      }
      stop.scheduledArrival = nextArrival;
      stop.scheduledDeparture = nextDeparture;

      previousDepartureMinutes = departureMinutes;
      previousBase = base;
    }
  }

  return { adjustedStops, adjustments };
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

  // Official Samsara sample downloads use CRLF. Match exactly.
  return { csv: lines.join("\r\n") + "\r\n", errors };
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
  // Official samples: m/d/yyyy H:mm (unpadded). Also accept zero-padded legacy cells.
  const datetimeRe = /^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}$/;
  if (!params.csv.includes("\r\n")) {
    errors.push("CSV must use CRLF line endings to match Samsara official sample downloads.");
  }
  if (params.csv.charCodeAt(0) === 0xfeff || params.csv.startsWith("\uFEFF")) {
    errors.push("CSV must not include a UTF-8 BOM.");
  }
  const headerLine = params.csv.split(/\r?\n/)[0] ?? "";
  const parsedHeaders = parseCsvLine(headerLine, params.template.delimiter).map((h) => h.trim());
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
    if (!row.routeName?.trim()) {
      errors.push(`Missing Route Name on a stop row.`);
    } else if (row.routeName.length > SAMSARA_ROUTE_NAME_MAX_CHARS) {
      errors.push(`Route Name too long (${row.routeName.length} chars): ${row.routeName.slice(0, 40)}…`);
    }
    if (!row.stopName?.trim()) {
      errors.push(`Missing Stop Name on route ${row.routeName || "(unnamed)"}`);
    } else if (row.stopName.length > SAMSARA_STOP_NAME_MAX_CHARS) {
      errors.push(
        `Stop Name too long on ${row.routeName} ("${row.stopName.slice(0, 40)}…", ${row.stopName.length} chars).`
      );
    }
    if (!row.scheduledArrival?.trim() || !row.scheduledDeparture?.trim()) {
      errors.push(`Missing scheduled arrival/departure on route ${row.routeName} stop "${row.stopName}"`);
    } else {
      if (!datetimeRe.test(row.scheduledArrival.trim()) || !datetimeRe.test(row.scheduledDeparture.trim())) {
        errors.push(
          `Datetime must be m/d/yyyy H:mm (Samsara sample style) on ${row.routeName} stop "${row.stopName}" (got "${row.scheduledArrival}" / "${row.scheduledDeparture}").`
        );
      }
      const arrival = parseSamsaraCsvDateTime(row.scheduledArrival);
      const departure = parseSamsaraCsvDateTime(row.scheduledDeparture);
      if (!arrival || !departure) {
        errors.push(
          `Bad datetime on ${row.routeName} stop "${row.stopName}" (use m/d/yyyy H:mm). Got arrival="${row.scheduledArrival}" departure="${row.scheduledDeparture}"`
        );
      } else if (departure.getTime() <= arrival.getTime()) {
        errors.push(
          `Departure must be after arrival on ${row.routeName} stop "${row.stopName}" (${row.scheduledArrival} → ${row.scheduledDeparture}). Equal times cause Samsara Internal Server Error.`
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
    if (row.stopAddress && row.stopAddress.length > SAMSARA_ADDRESS_MAX_CHARS) {
      errors.push(
        `Full Address too long on ${row.routeName} stop "${row.stopName}" (${row.stopAddress.length} chars).`
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
      if ((Math.abs(latN) < 1e-4 && Math.abs(lngN) < 1e-4) || (latN === 0 && lngN === 0)) {
        errors.push(`Stop "${row.stopName}" on ${row.routeName} has near-zero coordinates — fix geocode before upload.`);
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
    if (/[^\x20-\x7E]/.test(row.stopNotes || "") || /·|\u00B7/.test(row.stopNotes || "")) {
      errors.push(
        `Non-ASCII characters in Stop Notes on ${row.routeName} stop "${row.stopName}" — sanitize before upload (Samsara Internal Server Error risk). Use ASCII "|" separators, never middle-dot ·.`
      );
    }
    if (/[^\x20-\x7E]/.test(row.stopName || "") || /[^\x20-\x7E]/.test(row.stopAddress || "")) {
      errors.push(
        `Non-ASCII characters in Stop Name/Address on ${row.routeName} stop "${row.stopName}" — sanitize before upload.`
      );
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
    if (!String(row.vehicleName || "").trim()) {
      errors.push(`Missing Assigned Vehicle Name on route ${row.routeName || "(unnamed)"}.`);
    } else if (!isAllowedSamsaraVehicleName(row.vehicleName)) {
      errors.push(
        `Vehicle "${row.vehicleName}" on ${row.routeName} must exactly match Samsara roster: Van 01, Van 02, Van 03, Van 05, Van 06 (never Van 04).`
      );
    }
    if (/van\s*4/i.test(row.vehicleName) || /van_4/i.test(row.routeName)) {
      errors.push("Van 4 must never appear in exports.");
    }
  }

  const byRoute = new Map<string, ExportStopRow[]>();
  for (const row of params.rows) {
    const list = byRoute.get(row.routeName) ?? [];
    list.push(row);
    byRoute.set(row.routeName, list);
  }

  for (const [routeName, stops] of byRoute) {
    if (stops.length < 2) errors.push(`Route ${routeName} has fewer than two stops.`);
    const ordered = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const orders = stops.map((s) => s.stopOrder);
    const sortedOrders = [...orders].sort((a, b) => a - b);
    if (orders.join(",") !== sortedOrders.join(",")) {
      warnings.push(`Route ${routeName} stop order was resorted for validation.`);
    }
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1]!;
      const cur = ordered[i]!;
      const prevDep = parseSamsaraCsvDateTime(prev.scheduledDeparture);
      const curArr = parseSamsaraCsvDateTime(cur.scheduledArrival);
      if (prevDep && curArr && curArr.getTime() < prevDep.getTime()) {
        errors.push(
          `Non-monotonic times on ${routeName}: stop "${cur.stopName}" arrives before previous departure (${prev.scheduledDeparture} → ${cur.scheduledArrival}).`
        );
      }
    }
  }

  // ZIP / scientific notation checks on addresses
  for (const row of params.rows) {
    if (/\d+e\+\d+/i.test(row.stopAddress)) errors.push("Scientific notation detected in an address/ZIP field.");
  }

  // Round-trip the built CSV — Digi must never hand staff a file Samsara will 500 on.
  const dataLines = params.csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (dataLines.length !== params.rows.length) {
    errors.push(
      `CSV row count mismatch (file has ${dataLines.length} data rows, exporter built ${params.rows.length}).`
    );
  }
  for (let i = 0; i < dataLines.length; i += 1) {
    const cells = parseCsvLine(dataLines[i]!, params.template.delimiter);
    if (cells.length !== SAMSARA_BULK_UPLOAD_HEADERS.length) {
      errors.push(
        `CSV line ${i + 2} has ${cells.length} columns (expected ${SAMSARA_BULK_UPLOAD_HEADERS.length}).`
      );
      continue;
    }
    const [
      routeName,
      driver,
      vehicle,
      stopName,
      arrival,
      departure,
      notes,
      addressName,
      lat,
      lng,
      fullAddress
    ] = cells;
    if (String(driver || "").trim()) {
      errors.push(`CSV line ${i + 2}: Assigned Driver Username must be blank when using vehicles.`);
    }
    if (String(addressName || "").trim()) {
      errors.push(`CSV line ${i + 2}: Address Name must be blank for raw lat/lng uploads.`);
    }
    if (!isAllowedSamsaraVehicleName(vehicle || "")) {
      errors.push(`CSV line ${i + 2}: vehicle "${vehicle}" is not on the Samsara roster.`);
    }
    if (!datetimeRe.test(String(arrival || "").trim()) || !datetimeRe.test(String(departure || "").trim())) {
      errors.push(`CSV line ${i + 2}: bad arrival/departure datetime format.`);
    }
    if (!/^-?\d+(\.\d+)?$/.test(String(lat || "").trim()) || !/^-?\d+(\.\d+)?$/.test(String(lng || "").trim())) {
      errors.push(`CSV line ${i + 2}: Latitude/Longitude must be plain numbers.`);
    }
    if (!String(routeName || "").trim() || !String(stopName || "").trim() || !String(fullAddress || "").trim()) {
      errors.push(`CSV line ${i + 2}: Route Name, Stop Name, and Full Address are required.`);
    }
    if (/[^\x20-\x7E]/.test(String(notes || "")) || /\n|\r/.test(String(notes || ""))) {
      errors.push(`CSV line ${i + 2}: Stop Notes must be single-line printable ASCII.`);
    }
  }

  return {
    ok: errors.length === 0,
    report: {
      routeCount: byRoute.size,
      stopCount: params.rows.length,
      headerMatch: errors.every((e) => !/header/i.test(e)),
      operatingDate: params.operatingDate ?? null,
      errors: errors.slice(0, 40),
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
