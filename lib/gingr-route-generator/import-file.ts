/**
 * Import a Gingr reservation CSV or printed PDF into Gingr Route Generator.
 * Rows become GingrReservation-shaped records so existing normalize + transport
 * classifiers stay the source of truth.
 */

import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { parseCsv } from "@/lib/route-generator/parser";
import { extractPdfText, isPdfBuffer } from "@/lib/gingr-route-generator/pdf-text";
import { buildGingrRouteSchedulePayload, type GingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

type MappedRow = {
  dogName: string;
  ownerName: string;
  ownerFirst: string | null;
  ownerLast: string | null;
  animalId: string | null;
  reservationId: string | null;
  reservationType: string | null;
  services: string[];
  addons: string[];
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  notes: string | null;
  comments: string | null;
  date: string | null;
};

function headerKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function pickHeader(headers: string[], patterns: RegExp[]): string | null {
  for (const header of headers) {
    const key = headerKey(header);
    if (patterns.some((pattern) => pattern.test(key))) return header;
  }
  return null;
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\s*[|;,\n]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mapCsvRows(text: string): MappedRow[] {
  const parsed = parseCsv(text);
  if (!parsed.headers.length || !parsed.rows.length) return [];
  const headers = parsed.headers;

  const dogH = pickHeader(headers, [/^animal$/, /^dog$/, /dog name/, /animal name/, /pet name/]);
  const ownerH = pickHeader(headers, [/owner name/, /client name/, /customer name/, /^owner$/, /^client$/]);
  const firstH = pickHeader(headers, [/owner first/, /first name/]);
  const lastH = pickHeader(headers, [/owner last/, /last name/]);
  const animalIdH = pickHeader(headers, [/animal id/, /dog id/]);
  const resIdH = pickHeader(headers, [/reservation id/, /booking id/, /^id$/]);
  const typeH = pickHeader(headers, [/reservation type/, /^type$/, /service type/]);
  const serviceH = pickHeader(headers, [/^service$/, /services/, /class/, /activity/]);
  const addonH = pickHeader(headers, [/addon/, /add on/, /transport/]);
  const addressH = pickHeader(headers, [/^address$/, /full address/, /street address/, /pickup address/]);
  const streetH = pickHeader(headers, [/^street$/, /address 1/, /address1/]);
  const cityH = pickHeader(headers, [/^city$/]);
  const stateH = pickHeader(headers, [/^state$/]);
  const zipH = pickHeader(headers, [/^zip$/, /postal/]);
  const phoneH = pickHeader(headers, [/phone/, /mobile/, /cell/]);
  const notesH = pickHeader(headers, [/^notes$/, /reservation note/, /client note/]);
  const commentsH = pickHeader(headers, [/comment/, /instruction/, /pickup instruction/]);
  const dateH = pickHeader(headers, [/^date$/, /start date/, /reservation date/]);

  if (!dogH) return [];

  return parsed.rows
    .map((row) => {
      const dogName = String(row[dogH] ?? "").trim();
      const ownerName = ownerH ? String(row[ownerH] ?? "").trim() : "";
      const ownerFirst = firstH ? String(row[firstH] ?? "").trim() : "";
      const ownerLast = lastH ? String(row[lastH] ?? "").trim() : "";
      const reservationType = typeH ? String(row[typeH] ?? "").trim() : "";
      const services = splitList(serviceH ? String(row[serviceH] ?? "") : "");
      const addons = splitList(addonH ? String(row[addonH] ?? "") : "");
      return {
        dogName,
        ownerName,
        ownerFirst: ownerFirst || null,
        ownerLast: ownerLast || null,
        animalId: animalIdH ? String(row[animalIdH] ?? "").trim() || null : null,
        reservationId: resIdH ? String(row[resIdH] ?? "").trim() || null : null,
        reservationType: reservationType || services[0] || null,
        services,
        addons,
        address: addressH ? String(row[addressH] ?? "").trim() || null : null,
        street: streetH ? String(row[streetH] ?? "").trim() || null : null,
        city: cityH ? String(row[cityH] ?? "").trim() || null : null,
        state: stateH ? String(row[stateH] ?? "").trim() || null : null,
        zip: zipH ? String(row[zipH] ?? "").trim() || null : null,
        phone: phoneH ? String(row[phoneH] ?? "").trim() || null : null,
        notes: notesH ? String(row[notesH] ?? "").trim() || null : null,
        comments: commentsH ? String(row[commentsH] ?? "").trim() || null : null,
        date: dateH ? String(row[dateH] ?? "").trim() || null : null
      };
    })
    .filter((row) => row.dogName);
}

function mapPdfTable(text: string): MappedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headerIdx = lines.findIndex((line) => /animal|dog name|pet name/i.test(line) && /owner|client/i.test(line));
  if (headerIdx < 0) return [];
  const headerLine = lines[headerIdx]!;
  if (headerLine.includes(",") || headerLine.includes("\t")) {
    return mapCsvRows(lines.slice(headerIdx).join("\n"));
  }
  const csvish = [headerLine.replace(/\s{2,}/g, ","), ...lines.slice(headerIdx + 1).map((line) => line.replace(/\s{2,}/g, ","))].join(
    "\n"
  );
  return mapCsvRows(csvish);
}

function splitOwner(name: string): { first: string | null; last: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0]!, last: null };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

function toReservation(row: MappedRow, date: string, index: number): GingrReservation {
  const owner = splitOwner(row.ownerName);
  const first = row.ownerFirst || owner.first;
  const last = row.ownerLast || owner.last;
  const street = row.street || row.address;
  const serviceNames = Array.from(
    new Set([row.reservationType, ...row.services, ...row.addons].filter((value): value is string => Boolean(value)))
  );
  if (!serviceNames.length) serviceNames.push("Daycare Full Day");

  return {
    id: row.reservationId || `upload-${date}-${index + 1}`,
    animal_id: row.animalId || undefined,
    a_name: row.dogName,
    a_o_first_name: first || undefined,
    a_o_last_name: last || undefined,
    owner_name: row.ownerName || [first, last].filter(Boolean).join(" ") || undefined,
    type: row.reservationType || serviceNames[0],
    start_date: row.date || `${date}T09:00:00`,
    end_date: `${date}T18:00:00`,
    services: serviceNames.map((name) => ({ name, scheduled_at: `${date}T09:00:00` })),
    addons: row.addons.map((name) => ({ name })),
    notes: row.notes ? { reservation_notes: row.notes } : undefined,
    r_comments: row.comments || undefined,
    phone: row.phone || undefined,
    owner: {
      first_name: first || undefined,
      last_name: last || undefined,
      phone: row.phone || undefined,
      address_1: street || undefined,
      city: row.city || undefined,
      state: row.state || undefined,
      postal: row.zip || undefined
    }
  };
}

export function parseGingrUploadText(text: string, date: string): GingrReservation[] {
  const fromCsv = mapCsvRows(text);
  const rows = fromCsv.length ? fromCsv : mapPdfTable(text);
  return rows.map((row, index) => toReservation(row, date, index));
}

export function parseGingrUploadFile(params: {
  buffer: Buffer;
  fileName: string;
  date: string;
}): { reservations: GingrReservation[]; kind: "csv" | "pdf" } {
  if (params.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("Upload must be 8 MB or smaller.");
  }
  const name = params.fileName.toLowerCase();
  if (isPdfBuffer(params.buffer) || name.endsWith(".pdf")) {
    const text = extractPdfText(params.buffer);
    if (!text.trim()) {
      throw new Error("That PDF had no readable reservation text. Export a Gingr CSV instead.");
    }
    const reservations = parseGingrUploadText(text, params.date);
    if (!reservations.length) {
      throw new Error("Could not find dog rows in that PDF. Use a Gingr reservation CSV or a table-style PDF.");
    }
    return { reservations, kind: "pdf" };
  }
  if (!name.endsWith(".csv") && !name.endsWith(".txt")) {
    throw new Error("Upload a Gingr CSV or PDF.");
  }
  const text = params.buffer.toString("utf8");
  const reservations = parseGingrUploadText(text, params.date);
  if (!reservations.length) {
    throw new Error("Could not find dog rows in that CSV. Include an Animal/Dog Name column.");
  }
  return { reservations, kind: "csv" };
}

export function buildScheduleFromGingrUpload(params: {
  buffer: Buffer;
  fileName: string;
  date: string;
}): GingrRouteSchedulePayload {
  const parsed = parseGingrUploadFile(params);
  const payload = buildGingrRouteSchedulePayload(params.date, parsed.reservations, {
    cached: false,
    fetchedAt: new Date().toISOString()
  });
  return {
    ...payload,
    source: "upload",
    uploadFileName: params.fileName
  };
}
