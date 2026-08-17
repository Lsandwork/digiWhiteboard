import { normalizeServiceName } from "@/lib/ops-command-center/gingr-service-names";

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
