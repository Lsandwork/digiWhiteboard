export type SamsaraTemplate = {
  headers: string[];
  delimiter: string;
  encoding: string;
  mappings: Record<string, string | null>; // samsara column -> route field
};

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
  stop_address: (r) => r.stopAddress,
  address: (r) => r.stopAddress,
  scheduled_arrival: (r) => r.scheduledArrival,
  scheduled_departure: (r) => r.scheduledDeparture,
  route_date: (r) => r.routeDate,
  stop_order: (r) => r.stopOrder,
  latitude: (r) => r.latitude,
  longitude: (r) => r.longitude
};

export function autoMapSamsaraHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const header of headers) {
    const h = header.toLowerCase();
    if (/route.?name/.test(h)) mapping[header] = "route_name";
    else if (/route.?note/.test(h)) mapping[header] = "route_notes";
    else if (/vehicle/.test(h)) mapping[header] = "assigned_vehicle";
    else if (/driver/.test(h)) mapping[header] = "assigned_driver";
    else if (/stop.?name|name/.test(h) && /stop/.test(h)) mapping[header] = "stop_name";
    else if (/stop.?note/.test(h)) mapping[header] = "stop_notes";
    else if (/address/.test(h)) mapping[header] = "stop_address";
    else if (/arrival/.test(h)) mapping[header] = "scheduled_arrival";
    else if (/departure/.test(h)) mapping[header] = "scheduled_departure";
    else if (/date/.test(h)) mapping[header] = "route_date";
    else if (/order|sequence/.test(h)) mapping[header] = "stop_order";
    else if (/lat/.test(h)) mapping[header] = "latitude";
    else if (/lng|lon/.test(h)) mapping[header] = "longitude";
    else mapping[header] = null;
  }
  return mapping;
}

/** Escape CSV cell; neutralize formula injection. */
export function escapeCsvCell(value: unknown, delimiter = ","): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
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
  const parsedHeaders = headerLine.split(params.template.delimiter).map((h) => h.replace(/^"|"$/g, ""));
  if (parsedHeaders.join("|") !== params.template.headers.join("|")) {
    errors.push("Header names/order do not match the active Samsara template.");
  }
  if (!params.rows.length) errors.push("Export has no stop rows.");

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
