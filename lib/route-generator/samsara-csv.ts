/**
 * Canonical Samsara dashboard bulk-upload headers (columns A–K).
 * Exact match to cloud.samsara.com "Create Routes Through Bulk CSV Upload" templates
 * (Address Book + Lat/Long/Full Address samples). Editing these names fails upload.
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

/** Headers that cause Samsara "column headers are not supported". */
export const SAMSARA_UNSUPPORTED_HEADERS = [
  "Notes",
  "Scheduled Arrival Time",
  "Scheduled Departure Time",
  "Route Notes",
  "Assigned Vehicle",
  "Assigned Driver",
  "Stop Address",
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

/** Format a Date for Samsara route CSV upload in org-local wall time. */
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

/**
 * Build spaced stop arrival/departure times for a route when ETAs were not persisted.
 * Pickup defaults to 07:00 PT; drop-off defaults to 15:30 PT.
 */
export function synthesizeStopSchedule(params: {
  operatingDate: string; // YYYY-MM-DD
  direction: "pickup" | "dropoff";
  stopIndex: number;
  stopCount: number;
  minutesPerStop?: number;
}): { arrival: string; departure: string } {
  const minutesPerStop = params.minutesPerStop ?? 8;
  const startHour = params.direction === "pickup" ? 7 : 15;
  const startMinute = params.direction === "pickup" ? 0 : 30;
  const localStamp = `${params.operatingDate}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;
  const startMs = civilTimeToUtcMs(localStamp, "America/Los_Angeles");
  const arriveMs = startMs + params.stopIndex * minutesPerStop * 60_000;
  const departMs =
    arriveMs + (params.stopIndex === params.stopCount - 1 ? 0 : Math.min(5, minutesPerStop) * 60_000);
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
    if (!row.scheduledArrival?.trim() || !row.scheduledDeparture?.trim()) {
      errors.push(`Missing scheduled arrival/departure on route ${row.routeName}`);
    }
    if (!row.stopAddress?.trim() && (!row.latitude || !row.longitude)) {
      errors.push(`Stop "${row.stopName}" on ${row.routeName} needs Full Address or lat/lng.`);
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
