import type { MemberCardContext } from "@/lib/card-studio/types";

const FD_PREFIX = /^(?:FD-|GINGR-)/i;

/** Gingr dashboard search / animal profile IDs are numeric animal ids. */
export function normalizeGingrAnimalId(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^FIT-/i.test(trimmed)) return null;
  const stripped = trimmed.replace(FD_PREFIX, "").trim();
  if (!/^\d+$/.test(stripped)) return null;
  return stripped;
}

/**
 * Value encoded on the card and typed into Gingr when a front-desk scanner
 * wedges into Dashboard Search. Always the raw Gingr animal id — never FD-/FIT- prefixes.
 */
export function gingrBarcodeValue(member: Pick<MemberCardContext, "gingrAnimalId" | "memberNumber">): string | null {
  return normalizeGingrAnimalId(member.gingrAnimalId) || normalizeGingrAnimalId(member.memberNumber);
}

export function isGingrCompatibleBarcodePayload(value: string | null | undefined): boolean {
  return Boolean(normalizeGingrAnimalId(value));
}

export function barcodeValueLooksLikeInternalCardNumber(value: string): boolean {
  return /^FIT-\d+/i.test(value.trim()) || /^FD-FD-/i.test(value.trim());
}
