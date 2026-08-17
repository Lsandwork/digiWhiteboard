import { TL_DEFAULT_LODGING_LABELS } from "./constants";
import type { TlDigiBoardConfig, TlOvernightLodgingArea } from "./config";

export type ParsedRunName = {
  areaKey: TlOvernightLodgingArea | null;
  /** Run / suite number or code (e.g. "B63", "4"). */
  runLabel: string | null;
  /** Display label like "SUITE • 4". */
  lodgingLabel: string | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse back_of_house run_name values such as "Den: B63", "Suite: 4", "Petite Suite: 2".
 */
export function parseRunName(runName: string | null | undefined): ParsedRunName {
  const raw = normalizeWhitespace(String(runName ?? ""));
  if (!raw) {
    return { areaKey: null, runLabel: null, lodgingLabel: null };
  }

  const lower = raw.toLowerCase();
  let areaKey: TlOvernightLodgingArea | null = null;
  let runLabel: string | null = null;

  const petiteMatch = raw.match(/^\s*petite\s*suites?\s*[:\-–]?\s*(.+)?$/i);
  const denMatch = raw.match(/^\s*dens?\s*[:\-–]?\s*(.+)?$/i);
  const suiteMatch = raw.match(/^\s*suites?\s*[:\-–]?\s*(.+)?$/i);

  if (petiteMatch || lower.includes("petite suite") || lower.includes("petite_suite")) {
    areaKey = "petite_suite";
    if (petiteMatch?.[1]) runLabel = normalizeWhitespace(petiteMatch[1]);
    else {
      const after = raw.split(/[:\-–]/).slice(1).join(":").trim();
      runLabel = after || null;
    }
  } else if (denMatch || lower.startsWith("den")) {
    areaKey = "den";
    if (denMatch?.[1]) runLabel = normalizeWhitespace(denMatch[1]);
    else {
      const after = raw.split(/[:\-–]/).slice(1).join(":").trim();
      runLabel = after || null;
    }
  } else if (suiteMatch || lower.startsWith("suite")) {
    areaKey = "suite";
    if (suiteMatch?.[1]) runLabel = normalizeWhitespace(suiteMatch[1]);
    else {
      const after = raw.split(/[:\-–]/).slice(1).join(":").trim();
      runLabel = after || null;
    }
  }

  if (!areaKey) {
    return { areaKey: null, runLabel: raw, lodgingLabel: raw.toUpperCase() };
  }

  const areaLabel = TL_DEFAULT_LODGING_LABELS[areaKey];
  const lodgingLabel = runLabel ? `${areaLabel} • ${runLabel}` : areaLabel;
  return { areaKey, runLabel, lodgingLabel };
}

export function isApprovedOvernightLodging(
  areaKey: TlOvernightLodgingArea | null | undefined,
  config: TlDigiBoardConfig
): boolean {
  if (!areaKey) return false;
  return config.lodging.approvedAreaKeys.includes(areaKey);
}

/**
 * Match overnight lodging area from reservation type name and/or configurable type ids.
 * Petite Suite is checked before Suite so "Overnight: Petite Suite" does not match Suite.
 */
export function matchOvernightLodgingArea(
  reservationTypeName: string | null | undefined,
  reservationTypeId: string | number | null | undefined,
  config: TlDigiBoardConfig
): TlOvernightLodgingArea | null {
  const typeId = reservationTypeId == null ? null : String(reservationTypeId).trim();
  if (typeId) {
    const byId = config.lodging.overnightReservationTypes.find((row) => row.id === typeId);
    if (byId) return byId.areaKey;
  }

  const name = normalizeWhitespace(String(reservationTypeName ?? "")).toLowerCase();
  if (!name) return null;

  // Sort matchers so longer / more specific labels win (Petite Suite before Suite).
  const matchers = [...config.lodging.overnightReservationTypes].sort(
    (a, b) => b.labelContains.length - a.labelContains.length
  );

  for (const matcher of matchers) {
    const needle = matcher.labelContains.toLowerCase();
    if (needle && name.includes(needle)) return matcher.areaKey;
  }

  return null;
}

export function isOvernightReservationType(
  reservationTypeName: string | null | undefined,
  reservationTypeId: string | number | null | undefined,
  config: TlDigiBoardConfig
): boolean {
  return matchOvernightLodgingArea(reservationTypeName, reservationTypeId, config) != null;
}

export function lodgingLabelForArea(
  areaKey: TlOvernightLodgingArea | null,
  runLabel?: string | null
): string | null {
  if (!areaKey) return null;
  const areaLabel = TL_DEFAULT_LODGING_LABELS[areaKey];
  const run = runLabel?.trim();
  return run ? `${areaLabel} • ${run}` : areaLabel;
}
