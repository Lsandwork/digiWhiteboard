import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import { normalizeSmsToE164 } from "@/lib/integrations/sms/provider";

/** Format a phone for Samsara driver notes (full number, not masked). */
export function formatPhoneForDriver(phone: string | null | undefined): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw;
}

export function phoneDigitsE164(phone: string | null | undefined): string | null {
  return normalizeSmsToE164(phone);
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function phoneFromItem(item: NormalizedReportItem): string | null {
  const rawPhone =
    (item.raw?.phone as string | undefined) ||
    (item.raw?.owner_phone as string | undefined) ||
    (item.raw?.Phone as string | undefined) ||
    null;
  return formatPhoneForDriver(rawPhone) || formatPhoneForDriver(item.ownerPhoneMasked?.includes("•") ? null : item.ownerPhoneMasked);
}

/**
 * Build Samsara Stop Notes for drivers: dogs, owner phone, and pickup/drop-off instructions.
 * Notes may include newlines in-memory; CSV export flattens them with ASCII " | "
 * for Samsara upload safety (never middle-dot · — non-ASCII / ISE risk).
 */
export function buildCustomerStopNotes(params: {
  items: NormalizedReportItem[];
  direction: "pickup" | "dropoff";
  isFacility?: boolean;
  facilityLabel?: string | null;
}): string {
  const { items, direction, isFacility, facilityLabel } = params;
  const dogNames = uniqueNonEmpty(items.map((item) => item.dogName));
  const phones = uniqueNonEmpty(items.map((item) => phoneFromItem(item)));
  const instructions = uniqueNonEmpty(
    items.flatMap((item) => [item.driverNotes, item.specialNotes, item.raw?.location_notes as string | undefined])
  );
  const reservationNotes = uniqueNonEmpty(items.map((item) => item.reservationNotes));

  const lines: string[] = [];
  if (isFacility && direction === "dropoff") {
    lines.push("Dogs:");
    if (dogNames.length) {
      for (const name of dogNames) lines.push(`- ${name}`);
    } else {
      lines.push("- dogs");
    }
    if (facilityLabel) lines.push(`Location: ${facilityLabel}`);
  } else if (isFacility) {
    lines.push(
      `Fitdog facility stop - ${dogNames.length || items.length} dog(s) already on-site: ${dogNames.join(", ") || "dogs"}`
    );
    if (facilityLabel) lines.push(`Location: ${facilityLabel}`);
  } else {
    lines.push(`${dogNames.length || items.length} dog(s): ${dogNames.join(", ") || "dogs"}`);
  }

  if (phones.length) {
    lines.push(`Phone: ${phones.join(" | ")}`);
  }

  const instructionLabel = direction === "pickup" ? "Pickup instructions" : "Drop-off instructions";
  for (const note of instructions) {
    // Skip facility boilerplate we already stated.
    if (isFacility && /^facility stop:/i.test(note)) continue;
    if (isFacility && /^at fitdog/i.test(note)) continue;
    lines.push(`${instructionLabel}: ${note}`);
  }

  for (const note of reservationNotes) {
    lines.push(`Reservation notes: ${note}`);
  }

  return lines.join("\n");
}

/** Rebuild notes from persisted report rows (for export safety net). */
export function buildCustomerStopNotesFromReportRows(
  rows: Array<Record<string, unknown>>,
  direction: "pickup" | "dropoff",
  options?: { isFacility?: boolean; facilityLabel?: string | null }
): string {
  const items = rows.map(
    (row) =>
      ({
        direction,
        reservationId: row.reservation_id != null ? String(row.reservation_id) : null,
        customerId: row.customer_id != null ? String(row.customer_id) : null,
        ownerFirstName: (row.owner_first_name as string) ?? null,
        ownerLastName: (row.owner_last_name as string) ?? null,
        ownerFullName: (row.owner_full_name as string) ?? null,
        dogId: row.dog_id != null ? String(row.dog_id) : null,
        dogName: (row.dog_name as string) ?? null,
        serviceRaw: (row.service_raw as string) ?? null,
        serviceCanonical: (row.service_canonical as never) ?? null,
        addressRaw: (row.address_raw as string) ?? null,
        addressStreet: (row.address_street as string) ?? null,
        addressUnit: (row.address_unit as string) ?? null,
        addressCity: (row.address_city as string) ?? null,
        addressState: (row.address_state as string) ?? null,
        addressZip: (row.address_zip as string) ?? null,
        ownerPhoneMasked: (row.owner_phone_masked as string) ?? null,
        timeWindowStart: null,
        timeWindowEnd: null,
        dogSize: (row.dog_size as string) ?? null,
        specialNotes: (row.special_notes as string) ?? null,
        driverNotes: (row.driver_notes as string) ?? null,
        reservationNotes: (row.reservation_notes as string) ?? null,
        householdKey: null,
        validationStatus: "ok",
        validationReasons: [],
        raw: (row.raw as Record<string, string>) || {}
      }) satisfies NormalizedReportItem
  );
  return buildCustomerStopNotes({
    items,
    direction,
    isFacility: options?.isFacility,
    facilityLabel: options?.facilityLabel
  });
}
