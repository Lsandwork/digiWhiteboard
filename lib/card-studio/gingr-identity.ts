/**
 * Gingr / RuffOps identifier map for Card Studio.
 *
 * Confirmed from this repo + Gingr's published barcode articles — not guessed:
 *
 * 1. Gingr client/owner ID
 *    Gingr `owner.id`. Stored as `ruffly_contacts.gingr_owner_id` and webhook `owner_id`.
 *    See lib/integrations/gingr/mappers/contact.ts and lib/integrations/gingr/webhooks/process.ts.
 *
 * 2. Gingr pet/animal ID
 *    Gingr `animal.id`. Stored as `ops_dogs.gingr_animal_id` (unique). Animal profile URLs are
 *    /index.php/animals/view/{id} (lib/ruffops-checklist/gingr-links.ts). This is RuffOps' dog key.
 *
 * 3. Official Gingr barcode check-in (documented)
 *    Gingr Support: "Assign a Barcode to an Owner" — barcodes are assigned PER OWNER, not per pet.
 *    Staff scan a purchased key tag into the owner Barcode field, then scan that tag into
 *    Dashboard Search (keyboard-wedge). The encoded value is whatever string was saved on the owner.
 *    RuffOps does not currently persist that owner barcode field. Package scanners skip `barcode`
 *    keys (lib/package-group-walks/gingr-packages.ts). There is no other Gingr barcode encoder
 *    in RuffOps besides Card Studio.
 *
 * 4. RuffOps "member ID" on physical cards
 *    `card_studio_cards.card_number` is FIT-########, generated at issue time for uniqueness.
 *    It is NOT a Gingr identifier and must never be the barcode payload.
 *
 * 5. Card UUID
 *    RuffOps verification token for /card-studio/verify/{uuid}. Not a Gingr ID.
 *
 * 6. Symbology
 *    Gingr docs do not name Code 128 vs Code 39. Check-in is a keyboard-wedge into Dashboard Search,
 *    so any scanner-readable 1D payload that types the stored string works. Card Studio uses Code 128
 *    because it encodes the numeric Gingr IDs and typical key-tag strings without a check-digit scheme.
 *
 * Production Fitdog VIP cards are per-dog (photo + dog name). Default barcode source is therefore
 * the Gingr animal ID from RuffOps sync — the same ID staff already use to open the pet in Gingr.
 * That is a Dashboard Search payload. It is NOT the official owner key-tag field unless that field
 * happens to equal the animal ID.
 *
 * Do not label a print as "Gingr barcode field verified" unless live Gingr owner.barcode was read
 * and matched. Local ops_dogs / ruffly lookups are LOCAL BARCODE VALIDATION / GINGR RECORD CACHE.
 */

import type { MemberCardContext } from "@/lib/card-studio/types";

export const BARCODE_SOURCES = [
  "gingr_animal_id",
  "gingr_owner_id",
  "gingr_owner_barcode",
  "card_number",
  "custom"
] as const;

export type BarcodeSource = (typeof BARCODE_SOURCES)[number];

export const DEFAULT_PRODUCTION_BARCODE_SOURCE: BarcodeSource = "gingr_animal_id";
export const DEFAULT_PRODUCTION_BARCODE_SYMBOLOGY = "code128" as const;

export const BARCODE_SOURCE_LABELS: Record<BarcodeSource, string> = {
  gingr_animal_id: "Gingr pet / animal ID",
  gingr_owner_id: "Gingr client / owner ID",
  gingr_owner_barcode: "Gingr owner barcode field",
  card_number: "RuffOps card number (FIT-)",
  custom: "Custom value"
};

const FD_PREFIX = /^(?:FD-|GINGR-)/i;

export function normalizeGingrNumericId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^FIT-/i.test(trimmed)) return null;
  const stripped = trimmed.replace(FD_PREFIX, "").trim();
  if (!/^\d+$/.test(stripped)) return null;
  return stripped;
}

export function barcodeValueLooksLikeInternalCardNumber(value: string): boolean {
  return /^FIT-\d+/i.test(value.trim()) || /^FD-FD-/i.test(value.trim());
}

/** Owner barcode fields may be alphanumeric key-tag strings, not only digits. */
export function normalizeOwnerBarcodeField(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (barcodeValueLooksLikeInternalCardNumber(trimmed)) return null;
  if (trimmed.length > 64) return null;
  return trimmed;
}

export function extractGingrOwnerBarcode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const direct = ["barcode", "owner_barcode", "a_barcode", "barcode_id", "keytag", "key_tag"];
  for (const key of direct) {
    const found = normalizeOwnerBarcodeField(record[key] != null ? String(record[key]) : null);
    if (found) return found;
  }
  const nested = record.form_data ?? record.data ?? record.owner ?? record.fields;
  if (nested && nested !== payload) {
    const nestedFound = extractGingrOwnerBarcode(nested);
    if (nestedFound) return nestedFound;
  }
  return null;
}

export function resolveBarcodeFromSource(
  member: Pick<MemberCardContext, "gingrAnimalId" | "memberNumber"> & Partial<MemberCardContext>,
  source: BarcodeSource | string | null | undefined,
  customValue?: string | null
): { source: BarcodeSource; value: string | null; label: string } {
  const resolvedSource = (BARCODE_SOURCES as readonly string[]).includes(String(source))
    ? (source as BarcodeSource)
    : DEFAULT_PRODUCTION_BARCODE_SOURCE;
  let value: string | null = null;
  if (resolvedSource === "gingr_animal_id") {
    value = normalizeGingrNumericId(member.gingrAnimalId);
  } else if (resolvedSource === "gingr_owner_id") {
    value = normalizeGingrNumericId(member.gingrOwnerId);
  } else if (resolvedSource === "gingr_owner_barcode") {
    value = normalizeOwnerBarcodeField(member.gingrOwnerBarcode);
  } else if (resolvedSource === "card_number") {
    value = member.cardNumber && !barcodeValueLooksLikeInternalCardNumber(member.cardNumber) ? member.cardNumber : null;
  } else if (resolvedSource === "custom") {
    value = normalizeOwnerBarcodeField(customValue ?? member.customField);
  }
  return { source: resolvedSource, value, label: BARCODE_SOURCE_LABELS[resolvedSource] };
}

/**
 * Production encoder: Gingr animal ID from sync, unless the element opted into another source.
 * Never falls back to FIT- card numbers.
 */
export function gingrBarcodeValue(
  member: Pick<MemberCardContext, "gingrAnimalId" | "memberNumber"> & Partial<MemberCardContext>,
  source?: BarcodeSource | string | null,
  customValue?: string | null
): string | null {
  const fromSource = resolveBarcodeFromSource(member, source ?? member.barcodeSource ?? DEFAULT_PRODUCTION_BARCODE_SOURCE, customValue);
  if (fromSource.value) return fromSource.value;
  return normalizeGingrNumericId(member.gingrAnimalId) || normalizeGingrNumericId(member.memberNumber);
}

export function isPrintableGingrBarcodeValue(value: string | null | undefined): boolean {
  if (!value) return false;
  if (barcodeValueLooksLikeInternalCardNumber(value)) return false;
  return Boolean(normalizeGingrNumericId(value) || normalizeOwnerBarcodeField(value));
}

export function barcodeCompatibilityNote(source: BarcodeSource): string {
  if (source === "gingr_owner_barcode") {
    return "Official Gingr scanner workflow: owner Barcode field (key tags, not pets).";
  }
  if (source === "gingr_animal_id") {
    return "Encodes the Gingr animal ID from RuffOps sync. A wedge scanner types this into Gingr Dashboard Search. This is not the official owner key-tag field unless that field matches.";
  }
  if (source === "gingr_owner_id") {
    return "Encodes the Gingr owner/client ID. Dashboard Search may find the owner; Gingr's documented barcode field is a separate owner key-tag string.";
  }
  if (source === "card_number") {
    return "RuffOps FIT- card number. This will not identify a Gingr record.";
  }
  return "Custom payload. Only use if it matches a value already stored in Gingr.";
}

export type GingrLookupKind = "none" | "local_cache" | "gingr_api";

export type GingrLookupResult = {
  kind: GingrLookupKind;
  ok: boolean;
  dogName: string | null;
  ownerName: string | null;
  gingrAnimalId: string | null;
  gingrOwnerId: string | null;
  gingrOwnerBarcode: string | null;
  message: string;
};
