/**
 * Gingr / RuffOps identifier map for Card Studio.
 *
 * Confirmed from this repo + Gingr's published API/barcode articles:
 *
 * 1. Gingr client/owner ID
 *    Gingr `owner.id`. Stored as `ruffly_contacts.gingr_owner_id`.
 *
 * 2. Gingr pet/animal ID
 *    Gingr `animal.id`. Stored as `ops_dogs.gingr_animal_id`.
 *    Used as visible member ID on the card. NEVER the printed barcode payload.
 *
 * 3. Official Gingr owner barcode (Key Tag)
 *    Gingr Support API sample for GET /api/v1/owners includes owner field `"barcode"`.
 *    Gingr Support: barcodes are assigned PER OWNER (Key Tag Barcode), not per pet.
 *    Dashboard Search / check-in scans that owner barcode.
 *
 * 4. RuffOps FIT-######## is an internal card_number only. Never a barcode payload.
 */

import { evaluateUpcA } from "@/lib/card-studio/upc-a";
import type { MemberCardContext } from "@/lib/card-studio/types";

export const BARCODE_SOURCES = [
  "gingr_owner_barcode",
  "gingr_owner_id",
  "gingr_animal_id",
  "card_number",
  "custom"
] as const;

export type BarcodeSource = (typeof BARCODE_SOURCES)[number];

export const DEFAULT_PRODUCTION_BARCODE_SOURCE: BarcodeSource = "gingr_owner_barcode";
export const DEFAULT_PRODUCTION_BARCODE_SYMBOLOGY = "upca" as const;

export const BARCODE_SOURCE_LABELS: Record<BarcodeSource, string> = {
  gingr_owner_barcode: "Gingr owner barcode field (owner.barcode)",
  gingr_owner_id: "Gingr client / owner ID",
  gingr_animal_id: "Gingr pet / animal ID",
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

function gingrOwnerRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = "data" in root && root.data !== undefined ? root.data : payload;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    return data[0] as Record<string, unknown>;
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if ("barcode" in record || "first_name" in record || "id" in record) return record;
    const nestedOwner = record.owner;
    if (nestedOwner && typeof nestedOwner === "object") return nestedOwner as Record<string, unknown>;
    const firstObject = Object.values(record).find((value) => value && typeof value === "object" && !Array.isArray(value));
    if (firstObject && typeof firstObject === "object" && "barcode" in (firstObject as Record<string, unknown>)) {
      return firstObject as Record<string, unknown>;
    }
    return record;
  }
  return null;
}

/**
 * Documented Gingr owner Key Tag field is `barcode` on the owner record.
 * Leading zeros are preserved. Animal fields such as a_barcode are ignored.
 */
export function extractGingrOwnerBarcode(payload: unknown): string | null {
  const record = gingrOwnerRecord(payload);
  if (!record) return null;
  const candidates: unknown[] = [record.barcode];
  if (record.owner && typeof record.owner === "object") {
    candidates.push((record.owner as Record<string, unknown>).barcode);
  }
  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      const asString = String(candidate);
      if (!asString || barcodeValueLooksLikeInternalCardNumber(asString)) continue;
      return asString;
    }
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") continue;
    if (barcodeValueLooksLikeInternalCardNumber(trimmed)) continue;
    if (trimmed.length > 64) continue;
    return trimmed;
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
  if (resolvedSource === "gingr_owner_barcode") {
    value = extractGingrOwnerBarcode({ barcode: member.gingrOwnerBarcode }) ?? (member.gingrOwnerBarcode?.trim() || null);
    if (value && barcodeValueLooksLikeInternalCardNumber(value)) value = null;
  } else if (resolvedSource === "gingr_owner_id") {
    value = normalizeGingrNumericId(member.gingrOwnerId);
  } else if (resolvedSource === "gingr_animal_id") {
    value = normalizeGingrNumericId(member.gingrAnimalId);
  } else if (resolvedSource === "card_number") {
    value = member.cardNumber && !barcodeValueLooksLikeInternalCardNumber(member.cardNumber) ? member.cardNumber : null;
  } else if (resolvedSource === "custom") {
    const custom = (customValue ?? member.customField ?? "").trim();
    value = custom && !barcodeValueLooksLikeInternalCardNumber(custom) ? custom : null;
  }
  return { source: resolvedSource, value, label: BARCODE_SOURCE_LABELS[resolvedSource] };
}

/**
 * Production encoder: Gingr owner.barcode only.
 * Never falls back to animal ID, owner ID, email, phone, name, or FIT- numbers.
 */
export function gingrBarcodeValue(
  member: Pick<MemberCardContext, "gingrAnimalId" | "memberNumber"> & Partial<MemberCardContext>,
  source?: BarcodeSource | string | null,
  customValue?: string | null
): string | null {
  const resolved = source ?? member.barcodeSource ?? DEFAULT_PRODUCTION_BARCODE_SOURCE;
  if (resolved === "custom") {
    return resolveBarcodeFromSource(member, "custom", customValue).value;
  }
  return resolveBarcodeFromSource(member, "gingr_owner_barcode", customValue).value;
}

export function isPrintableGingrBarcodeValue(value: string | null | undefined): boolean {
  return evaluateUpcA(value).status === "VALID";
}

export function barcodeCompatibilityNote(source: BarcodeSource): string {
  if (source === "gingr_owner_barcode") {
    return "Printed barcode is the Gingr owner Key Tag field (owner.barcode), encoded as UPC-A. Scanning identifies the owner and the owner's pets in Gingr.";
  }
  if (source === "gingr_animal_id") {
    return "This source encodes the Gingr animal ID. Production Fitdog cards must not use it as the printed barcode.";
  }
  if (source === "gingr_owner_id") {
    return "This source encodes the Gingr owner/client ID, which is not the owner Key Tag barcode field.";
  }
  if (source === "card_number") {
    return "RuffOps FIT- card number. This will not identify a Gingr record.";
  }
  return "Custom payload. Only use if it matches a value already stored in Gingr owner.barcode.";
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
