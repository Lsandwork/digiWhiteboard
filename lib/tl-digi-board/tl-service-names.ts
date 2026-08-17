import { normalizeServiceName } from "@/lib/ops-command-center/gingr-service-names";

/** Canonical TL board additional service labels (Gingr catalog names). */
export const TL_BOARD_REQUIRED_ADDITIONAL_SERVICES = [
  "Private Walk",
  "Group Walk",
  "Daily Enrichment (3pm) - Business Only",
  "Snack time - business only",
  "Puzzle Playtime",
  "Birthday Party",
  "Assessment Hike - Business Only",
  "Flea Preventative",
  "Bordetella - Business Only",
  "Taxi Service - Business Only"
] as const;

export type TlBoardRequiredAdditionalService = (typeof TL_BOARD_REQUIRED_ADDITIONAL_SERVICES)[number];

/**
 * Team Lead Digi Board additional services — exact Gingr service names the TL
 * board tracks. Only incomplete rows (per Gingr completion) are shown.
 */
const TL_BOARD_ADDITIONAL_SERVICE_PATTERNS: Array<(token: string) => boolean> = [
  (t) => /\bprivate\s+walks?\b/.test(t),
  (t) => /\bgroup\s+walks?\b/.test(t),
  (t) => t.includes("daily enrichment") && t.includes("business only"),
  (t) => t.includes("snack time") && t.includes("business only"),
  (t) => t.includes("puzzle playtime"),
  (t) => t.includes("birthday party"),
  (t) => t.includes("assessment hike") && t.includes("business only"),
  (t) => t.includes("flea preventative"),
  (t) => t.includes("bordetella") && t.includes("business only"),
  (t) => t.includes("taxi service") && t.includes("business only")
];

/** True when this Gingr service name belongs on the TL Additional Services table. */
export function isTlBoardAdditionalService(name?: string | null): boolean {
  const token = normalizeServiceName(name);
  if (!token) return false;
  return TL_BOARD_ADDITIONAL_SERVICE_PATTERNS.some((match) => match(token));
}

/** Map a Gingr service name to the canonical TL required label when matched. */
export function canonicalTlBoardServiceName(name?: string | null): TlBoardRequiredAdditionalService | null {
  if (!isTlBoardAdditionalService(name)) return null;
  const token = normalizeServiceName(name);
  for (const label of TL_BOARD_REQUIRED_ADDITIONAL_SERVICES) {
    if (normalizeServiceName(label) === token) return label;
  }
  // Fuzzy: return first required label whose pattern would match.
  for (const label of TL_BOARD_REQUIRED_ADDITIONAL_SERVICES) {
    if (isTlBoardAdditionalService(label) && normalizeServiceName(label) === token) return label;
  }
  // Pattern-based best match for display grouping in audits.
  if (/\bprivate\s+walks?\b/.test(token)) return "Private Walk";
  if (/\bgroup\s+walks?\b/.test(token)) return "Group Walk";
  if (token.includes("daily enrichment")) return "Daily Enrichment (3pm) - Business Only";
  if (token.includes("snack time")) return "Snack time - business only";
  if (token.includes("puzzle playtime")) return "Puzzle Playtime";
  if (token.includes("birthday party")) return "Birthday Party";
  if (token.includes("assessment hike")) return "Assessment Hike - Business Only";
  if (token.includes("flea preventative")) return "Flea Preventative";
  if (token.includes("bordetella")) return "Bordetella - Business Only";
  if (token.includes("taxi service")) return "Taxi Service - Business Only";
  return null;
}
