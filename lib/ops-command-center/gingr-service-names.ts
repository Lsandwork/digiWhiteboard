export function normalizeServiceName(name?: string | null) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Free Walk / Free Daily Walk — never show on desk or groomer My Shift. */
export function isFreeDailyWalkService(name?: string | null) {
  const token = normalizeServiceName(name);
  if (!token) return false;
  return /\bfree\b.*\b(daily\s+)?walks?\b/.test(token);
}

export function isGroomingFacilityService(name?: string | null) {
  const token = normalizeServiceName(name);
  if (!token) return false;
  return /\b(baths?|bathe|nail|nails|trims?|clips?|grooms?|grooming|haircuts?|hair cut|desheds?|de shed|brush(?:ing|es)?|teeth|tooth|ear(?:s| clean(?:ing)?)?|sanitary|blow ?outs?|furminator|dremel|paw|pads?|anal glands?|full groom|mini groom|spa|conditioner|shampoo)\b/.test(
    token
  );
}

export function isYardClubFacilityService(name?: string | null) {
  const token = normalizeServiceName(name);
  if (!token) return false;
  if (/\bgroup\s+walks?\b/.test(token)) return true;
  if (token.includes("puzzle playtime")) return true;
  if (token.includes("private training")) return true;
  if (token.includes("daily enrichment")) return true;
  if (token.includes("club food")) return true;
  if (token.includes("taxi service") || (/\btaxi\b/.test(token) && token.includes("business only"))) return true;
  return false;
}

/** Team Lead / Coordinator My Shift Needs Attention facility-calendar services. */
export function isDeskMyShiftFacilityService(name?: string | null) {
  if (!name) return false;
  if (isFreeDailyWalkService(name)) return false;
  return isYardClubFacilityService(name) || isGroomingFacilityService(name);
}

/** Yard/club add-ons that should not appear on Groomer My Shift. */
export function isExcludedGroomerAdditionalService(name?: string | null) {
  const token = normalizeServiceName(name);
  if (!token) return false;
  if (/\bfree\b.*\bwalks?\b/.test(token)) return true;
  if (/\bgroup\s+walks?\b/.test(token)) return true;
  if (token.includes("puzzle playtime")) return true;
  if (token.includes("private training") && token.includes("business only")) return true;
  if (token.includes("daily enrichment") && token.includes("business only")) return true;
  if (token.includes("club food") && token.includes("business only")) return true;
  if (token.includes("taxi service") && token.includes("business only")) return true;
  return false;
}
