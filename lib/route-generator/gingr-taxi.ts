import { createGingrClient } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { maskPhone, type NormalizedReportItem } from "@/lib/route-generator/parser";
import { householdKey, parseAddress } from "@/lib/route-generator/address";
import type { CanonicalService } from "@/lib/route-generator/flags";

export type GingrTaxiServiceRow = {
  reservationId: string;
  dogId: string | null;
  dogName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  serviceRaw: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  phone: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function looksLikeTaxi(reservation: GingrReservation): boolean {
  const blob = JSON.stringify(reservation).toLowerCase();
  if (/\btaxi\b|transport|door.to.door|pickup.?service|drop.?off.?service/.test(blob)) return true;
  const type = String(reservation.type || reservation.type_id || "").toLowerCase();
  return type.includes("taxi") || type.includes("transport");
}

function normalizeReservationList(payload: unknown): GingrReservation[] {
  if (Array.isArray(payload)) return payload as GingrReservation[];
  const record = asRecord(payload);
  for (const key of ["data", "reservations", "results", "items"]) {
    if (Array.isArray(record[key])) return record[key] as GingrReservation[];
  }
  return [];
}

export function mapGingrReservationToTaxiRow(reservation: GingrReservation): GingrTaxiServiceRow {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  const address = asRecord(reservation.address || reservation.pickup_address || reservation.location);
  return {
    reservationId: String(reservation.id),
    dogId: pickString(reservation.animal_id, animal.id),
    dogName: pickString(animal.name, reservation.animal_name, reservation.pet_name, reservation.dog_name),
    ownerId: pickString(reservation.owner_id, owner.id),
    ownerName: pickString(
      owner.full_name,
      [owner.first_name, owner.last_name].filter(Boolean).join(" "),
      reservation.owner_name,
      reservation.client_name
    ),
    serviceRaw: pickString(reservation.type, reservation.service, reservation.service_type, "Taxi") || "Taxi",
    address: pickString(
      address.address,
      address.street,
      address.line1,
      reservation.address_line_1,
      reservation.street
    ),
    city: pickString(address.city, reservation.city),
    zip: pickString(address.zip, address.postcode, reservation.zip, reservation.postcode),
    phone: pickString(owner.phone, owner.cell_phone, reservation.phone),
    status: pickString(reservation.status),
    startDate: pickString(reservation.start_date, reservation.date),
    endDate: pickString(reservation.end_date),
    raw: reservation as Record<string, unknown>
  };
}

export async function listGingrTaxiServicesByDate(date: string): Promise<{
  configured: boolean;
  services: GingrTaxiServiceRow[];
  error?: string;
}> {
  try {
    const client = createGingrClient();
    if (!client.config.apiKey) {
      return { configured: false, services: [], error: "GINGR_API_KEY is not configured." };
    }
    const payload = await client.listReservationsByDate(date);
    const rows = normalizeReservationList(payload)
      .filter(looksLikeTaxi)
      .map(mapGingrReservationToTaxiRow);
    return { configured: true, services: rows };
  } catch (error) {
    return {
      configured: true,
      services: [],
      error: error instanceof Error ? error.message : "Unable to load Gingr taxi services."
    };
  }
}

export function taxiRowToReportItems(params: {
  row: GingrTaxiServiceRow;
  vanKey?: string | null;
  serviceCanonical?: CanonicalService;
}): NormalizedReportItem[] {
  const serviceCanonical = params.serviceCanonical || "Taxi Service";
  const addressRaw = [params.row.address, params.row.city, params.row.zip].filter(Boolean).join(", ");
  const parsed = parseAddress(addressRaw);
  const reasons: string[] = [];
  if (!addressRaw) reasons.push("Missing address");
  if (!params.row.dogName) reasons.push("Missing dog name");

  const base = {
    reservationId: `gingr-taxi-${params.row.reservationId}`,
    customerId: params.row.ownerId,
    ownerFirstName: null as string | null,
    ownerLastName: null as string | null,
    ownerFullName: params.row.ownerName,
    dogId: params.row.dogId,
    dogName: params.row.dogName,
    serviceRaw: params.row.serviceRaw || "Taxi",
    serviceCanonical,
    addressRaw: addressRaw || null,
    addressStreet: parsed.street || params.row.address,
    addressUnit: parsed.unit,
    addressCity: parsed.city || params.row.city,
    addressState: parsed.state || "CA",
    addressZip: parsed.zip || params.row.zip,
    ownerPhoneMasked: maskPhone(params.row.phone),
    timeWindowStart: null as string | null,
    timeWindowEnd: null as string | null,
    dogSize: "Unknown" as string | null,
    specialNotes: "Imported from Gingr Taxi",
    driverNotes: null as string | null,
    reservationNotes: params.row.status,
    householdKey: addressRaw ? householdKey(parsed) : `gingr-taxi-${params.row.reservationId}`,
    validationStatus: (reasons.some((r) => /missing address/i.test(r)) ? "error" : reasons.length ? "warning" : "ok") as
      | "ok"
      | "warning"
      | "error",
    validationReasons: reasons,
    raw: {
      ...params.row.raw,
      source: "gingr_taxi",
      locked_van: params.vanKey || "",
      service: params.row.serviceRaw || "Taxi"
    }
  };

  return [
    { ...base, direction: "pickup" as const },
    { ...base, direction: "dropoff" as const }
  ];
}

export function manualTaxiToReportItems(params: {
  dogName: string;
  ownerName?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  notes?: string | null;
  vanKey?: string | null;
  reservationId?: string | null;
}): NormalizedReportItem[] {
  const addressRaw = [params.address, params.city, params.state || "CA", params.zip].filter(Boolean).join(", ");
  const parsed = parseAddress(addressRaw);
  const ownerParts = String(params.ownerName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const reservationId = params.reservationId || `manual-taxi-${Date.now()}`;
  const reasons: string[] = [];
  if (!params.address.trim()) reasons.push("Missing address");
  if (!params.dogName.trim()) reasons.push("Missing dog name");

  const base = {
    reservationId,
    customerId: null as string | null,
    ownerFirstName: ownerParts[0] || null,
    ownerLastName: ownerParts.length > 1 ? ownerParts.slice(1).join(" ") : null,
    ownerFullName: params.ownerName?.trim() || null,
    dogId: null as string | null,
    dogName: params.dogName.trim(),
    serviceRaw: "Taxi",
    serviceCanonical: "Taxi Service" as CanonicalService,
    addressRaw: addressRaw || null,
    addressStreet: parsed.street || params.address,
    addressUnit: parsed.unit,
    addressCity: parsed.city || params.city || null,
    addressState: parsed.state || params.state || "CA",
    addressZip: parsed.zip || params.zip || null,
    ownerPhoneMasked: maskPhone(params.phone),
    timeWindowStart: null as string | null,
    timeWindowEnd: null as string | null,
    dogSize: "Unknown" as string | null,
    specialNotes: params.notes?.trim() || "Manual Taxi entry",
    driverNotes: params.notes?.trim() || null,
    reservationNotes: null as string | null,
    householdKey: addressRaw ? householdKey(parsed) : `manual-taxi-${reservationId}`,
    validationStatus: (reasons.some((r) => /missing address/i.test(r)) ? "error" : reasons.length ? "warning" : "ok") as
      | "ok"
      | "warning"
      | "error",
    validationReasons: reasons,
    raw: {
      source: "manual_taxi",
      locked_van: params.vanKey || "",
      service: "Taxi"
    }
  };

  return [
    { ...base, direction: "pickup" as const },
    { ...base, direction: "dropoff" as const }
  ];
}
