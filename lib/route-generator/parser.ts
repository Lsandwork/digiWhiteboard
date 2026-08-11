import { parseAddress, householdKey } from "@/lib/route-generator/address";
import { classifyDirection, normalizeServiceName } from "@/lib/route-generator/services";
import type { CanonicalService } from "@/lib/route-generator/flags";
import type { LocationType } from "@/lib/route-generator/destination";

export type RawReportRow = Record<string, string>;

export type NormalizedReportItem = {
  direction: "pickup" | "dropoff";
  reservationId: string | null;
  customerId: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerFullName: string | null;
  dogId: string | null;
  dogName: string | null;
  serviceRaw: string | null;
  serviceCanonical: CanonicalService | null;
  /** Explicit destination for THIS leg — never inferred from the opposite wave. */
  locationType?: LocationType | null;
  addressRaw: string | null;
  addressStreet: string | null;
  addressUnit: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  ownerPhoneMasked: string | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  dogSize: string | null;
  specialNotes: string | null;
  driverNotes: string | null;
  reservationNotes: string | null;
  householdKey: string | null;
  validationStatus: "ok" | "warning" | "error";
  validationReasons: string[];
  raw: RawReportRow;
};

export type FieldMapping = Partial<{
  reservation_id: string;
  customer_id: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_full_name: string;
  dog_id: string;
  dog_name: string;
  service_name: string;
  pickup_requested: string;
  dropoff_requested: string;
  pickup_address: string;
  dropoff_address: string;
  address: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  owner_phone: string;
  pickup_window_start: string;
  pickup_window_end: string;
  dropoff_window_start: string;
  dropoff_window_end: string;
  dog_size: string;
  special_notes: string;
  driver_notes: string;
  reservation_notes: string;
}>;

const AUTO_MAP: Array<[keyof FieldMapping, RegExp]> = [
  ["reservation_id", /reservation|booking|res[#_\s-]*id/i],
  ["customer_id", /customer[#_\s-]*id|client[#_\s-]*id/i],
  ["owner_first_name", /owner.*first|first.?name/i],
  ["owner_last_name", /owner.*last|last.?name/i],
  ["owner_full_name", /owner.*name|customer.?name|client.?name/i],
  ["dog_id", /dog[#_\s-]*id|animal[#_\s-]*id/i],
  ["dog_name", /dog.?name|pet.?name|animal.?name/i],
  ["service_name", /service|class|hike|excursion/i],
  ["pickup_requested", /pickup.?request|needs.?pickup|pick.?up\??$/i],
  ["dropoff_requested", /drop.?off.?request|needs.?drop/i],
  ["pickup_address", /pickup.?address|pick.?up.?addr/i],
  ["dropoff_address", /drop.?off.?address|dropoff.?addr/i],
  ["address", /^address$|full.?address|street.?address/i],
  ["street", /^street$/i],
  ["unit", /unit|apt|apartment|suite/i],
  ["city", /^city$/i],
  ["state", /^state$/i],
  ["zip", /zip|postal/i],
  ["owner_phone", /phone|mobile|cell/i],
  ["pickup_window_start", /pickup.*(start|from|window.?start)/i],
  ["pickup_window_end", /pickup.*(end|to|window.?end)/i],
  ["dropoff_window_start", /drop.*(start|from|window.?start)/i],
  ["dropoff_window_end", /drop.*(end|to|window.?end)/i],
  ["dog_size", /size|weight.?class/i],
  ["special_notes", /special|transport/i],
  ["driver_notes", /driver.?note/i],
  ["reservation_notes", /reservation.?note|notes?/i]
];

export function looksLikeLoginPage(htmlOrText: string): boolean {
  const text = htmlOrText.toLowerCase();
  return (
    text.includes("sign in") ||
    text.includes("log in") ||
    text.includes('name="password"') ||
    text.includes("forgot password") ||
    (text.includes("<form") && text.includes("password"))
  );
}

export function autoMapHeaders(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  for (const header of headers) {
    for (const [field, pattern] of AUTO_MAP) {
      if (mapping[field]) continue;
      if (pattern.test(header)) mapping[field] = header;
    }
  }
  return mapping;
}

export function parseCsv(text: string): { headers: string[]; rows: RawReportRow[] } {
  if (looksLikeLoginPage(text)) {
    throw new Error("Fitdog returned a login page instead of report data. A Super Admin must reconnect the integration.");
  }
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]!);
  const headers = splitCsvLine(lines[0]!, delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line, delimiter);
    const row: RawReportRow = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > commas && tabs > semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

export function maskPhone(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return phone ? "•••" : null;
  return `•••-•••-${digits.slice(-4)}`;
}

export function normalizeReportRows(params: {
  rows: RawReportRow[];
  mapping: FieldMapping;
  defaultDirection?: "pickup" | "dropoff";
  aliases?: Record<string, CanonicalService>;
}): { items: NormalizedReportItem[]; formatChanged: boolean; missingMappedFields: string[] } {
  const { rows, mapping, defaultDirection, aliases } = params;
  const missingMappedFields: string[] = [];
  for (const [field, header] of Object.entries(mapping)) {
    if (!header) continue;
    if (rows.length && !(header in rows[0]!)) missingMappedFields.push(field);
  }
  const formatChanged = missingMappedFields.length > 0;

  const items: NormalizedReportItem[] = [];
  for (const row of rows) {
    const get = (field: keyof FieldMapping) => {
      const header = mapping[field];
      return header ? String(row[header] ?? "").trim() : "";
    };

    const serviceRaw = get("service_name") || null;
    const serviceCanonical = normalizeServiceName(serviceRaw, aliases);
    const pickupReq = get("pickup_requested");
    const dropoffReq = get("dropoff_requested");
    let direction = classifyDirection({
      pickupRequested: pickupReq,
      dropoffRequested: dropoffReq,
      explicit: defaultDirection ?? null
    });

    const both = Boolean(pickupReq) && Boolean(dropoffReq) && coerceYes(pickupReq) && coerceYes(dropoffReq);
    const directions: Array<"pickup" | "dropoff"> = both
      ? ["pickup", "dropoff"]
      : direction
        ? [direction]
        : defaultDirection
          ? [defaultDirection]
          : [];

    if (!directions.length) {
      items.push(
        buildItem({
          row,
          direction: defaultDirection ?? "pickup",
          mapping,
          serviceRaw,
          serviceCanonical,
          forcedReasons: ["Missing pickup/drop-off classification."]
        })
      );
      continue;
    }

    for (const dir of directions) {
      items.push(
        buildItem({
          row,
          direction: dir,
          mapping,
          serviceRaw,
          serviceCanonical
        })
      );
    }
  }

  return { items, formatChanged, missingMappedFields };
}

function coerceYes(value: string): boolean {
  const s = value.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "x";
}

function buildItem(params: {
  row: RawReportRow;
  direction: "pickup" | "dropoff";
  mapping: FieldMapping;
  serviceRaw: string | null;
  serviceCanonical: CanonicalService | null;
  forcedReasons?: string[];
}): NormalizedReportItem {
  const get = (field: keyof FieldMapping) => {
    const header = params.mapping[field];
    return header ? String(params.row[header] ?? "").trim() : "";
  };

  const addressRaw =
    (params.direction === "pickup" ? get("pickup_address") : get("dropoff_address")) ||
    get("address") ||
    [get("street"), get("city"), get("state"), get("zip")].filter(Boolean).join(", ");

  const parsed = parseAddress(addressRaw);
  const ownerFull =
    get("owner_full_name") ||
    [get("owner_first_name"), get("owner_last_name")].filter(Boolean).join(" ").trim() ||
    null;

  const reasons = [...(params.forcedReasons ?? [])];
  if (!addressRaw) reasons.push("Missing address");
  if (!params.serviceCanonical) reasons.push(params.serviceRaw ? "Unknown service alias" : "Missing service type");
  if (!get("dog_name")) reasons.push("Missing dog name");
  if (!get("dog_size")) reasons.push("Missing dog size");

  const validationStatus = reasons.some((r) => /missing address|unknown service|missing service/i.test(r))
    ? "error"
    : reasons.length
      ? "warning"
      : "ok";

  return {
    direction: params.direction,
    reservationId: get("reservation_id") || null,
    customerId: get("customer_id") || null,
    ownerFirstName: get("owner_first_name") || null,
    ownerLastName: get("owner_last_name") || null,
    ownerFullName: ownerFull,
    dogId: get("dog_id") || null,
    dogName: get("dog_name") || null,
    serviceRaw: params.serviceRaw,
    serviceCanonical: params.serviceCanonical,
    addressRaw: addressRaw || null,
    addressStreet: parsed.street || get("street") || null,
    addressUnit: parsed.unit || get("unit") || null,
    addressCity: parsed.city || get("city") || null,
    addressState: parsed.state || get("state") || null,
    addressZip: parsed.zip || get("zip") || null,
    ownerPhoneMasked: maskPhone(get("owner_phone")),
    timeWindowStart:
      (params.direction === "pickup" ? get("pickup_window_start") : get("dropoff_window_start")) || null,
    timeWindowEnd: (params.direction === "pickup" ? get("pickup_window_end") : get("dropoff_window_end")) || null,
    dogSize: get("dog_size") || null,
    specialNotes: get("special_notes") || null,
    driverNotes: get("driver_notes") || null,
    reservationNotes: get("reservation_notes") || null,
    householdKey: addressRaw ? householdKey(parsed) : null,
    validationStatus,
    validationReasons: reasons,
    raw: params.row
  };
}
