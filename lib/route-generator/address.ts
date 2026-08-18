export type ParsedAddress = {
  original: string;
  normalized: string;
  street: string;
  unit: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

const UNIT_RE = /\b(?:apt|apartment|unit|ste|suite|#)\s*([a-z0-9-]+)\b/i;
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const STATE_RE = /\b([A-Z]{2})\b(?:\s+\d{5})?/;

export function parseAddress(raw: string | null | undefined): ParsedAddress {
  const original = String(raw ?? "").trim();
  if (!original) {
    return { original: "", normalized: "", street: "", unit: null, city: null, state: null, zip: null };
  }

  const unitMatch = original.match(UNIT_RE);
  const zipMatch = original.match(ZIP_RE);
  const withoutUnit = original.replace(UNIT_RE, "").replace(/,\s*,/g, ",").trim();
  const parts = withoutUnit.split(",").map((part) => part.trim()).filter(Boolean);

  let street = parts[0] ?? withoutUnit;
  let city: string | null = parts.length >= 2 ? parts[1] : null;
  let state: string | null = null;

  const stateZip = parts[parts.length - 1] ?? "";
  const stateMatch = stateZip.match(STATE_RE);
  if (stateMatch) state = stateMatch[1]!.toUpperCase();
  if (!city && parts.length === 1) {
    // "123 Main St Santa Monica CA 90401"
    const loose = street.match(/^(.*)\s+([A-Za-z .]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (loose) {
      street = loose[1]!.trim();
      city = loose[2]!.trim();
      state = loose[3]!.toUpperCase();
    }
  }

  const zip = zipMatch?.[1] ?? null;
  const normalized = [street, city, state, zip].filter(Boolean).join(", ");

  return {
    original,
    normalized,
    street,
    unit: unitMatch?.[1] ?? null,
    city,
    state,
    zip
  };
}

export function addressCacheKey(address: string): string {
  return parseAddress(address)
    .normalized.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function householdKey(address: ParsedAddress): string {
  return [address.street, address.unit, address.city, address.state, address.zip]
    .map((part) => String(part ?? "").toLowerCase().trim())
    .filter(Boolean)
    .join("|");
}

/** True when a string is a usable postal address, not a UI label like "Baxter Drop Off". */
export function looksLikePostalAddress(value: string | null | undefined): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (!/\d/.test(text)) return false;
  if (/^[A-Za-z][A-Za-z\s'+.-]{1,40}$/.test(text)) return false;
  return true;
}

export function formatCanonicalPostalAddress(parts: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  fallback?: string | null;
}): string | null {
  const street = String(parts.street || "").trim();
  const city = String(parts.city || "").trim();
  const state = String(parts.state || "").trim();
  const postalCode = String(parts.postalCode || "").trim();
  const locality = [city, [state, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const formatted = [street || null, locality || null, street || locality ? "USA" : null].filter(Boolean).join(", ");
  if (looksLikePostalAddress(formatted)) return formatted;
  const fallback = String(parts.fallback || "").trim();
  return looksLikePostalAddress(fallback) ? fallback : formatted || null;
}
