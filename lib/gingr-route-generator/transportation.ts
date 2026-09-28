/**
 * Normalize Gingr transportation from addon/service text.
 * Service (what the dog is doing) stays separate from how they travel.
 */

export type GingrTransportationType =
  | "FITDOG_HOME_PICKUP"
  | "OWNER_CLUB_DROPOFF"
  | "FITDOG_HOME_DROPOFF"
  | "OWNER_CLUB_PICKUP"
  | "TAXI"
  | "UNKNOWN";

export type GingrRouteDirection = "PICKUP" | "DROPOFF" | "NONE";

const NAME_KEYS = [
  "name",
  "service",
  "type",
  "addon",
  "addon_name",
  "s_name",
  "title",
  "label",
  "service_name",
  "service_type",
  "display_name",
  "description"
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeToken(value: unknown): string {
  if (value == null || typeof value === "object") return "";
  try {
    return String(value)
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function looksLikeTransportToken(token: string): boolean {
  if (!token) return false;
  return (
    /\bowners?\b/.test(token) ||
    /\bpick ?ups?\b/.test(token) ||
    /\bpickup\b/.test(token) ||
    /\bdrop ?offs?\b/.test(token) ||
    /\bdropoff\b/.test(token) ||
    /\btaxi\b/.test(token) ||
    /\btransport\b/.test(token) ||
    /\bdoor to door\b/.test(token)
  );
}

/** Calendar date (YYYY-MM-DD) from a Gingr ISO/local timestamp. */
export function gingrTimestampDateKey(value: unknown): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  const isoDay = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDay) return isoDay[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(parsed);
  } catch {
    return null;
  }
}

export type BoardingOccupancy = {
  isOvernight: boolean;
  alreadyOnProperty: boolean;
  checkInDate: string | null;
  checkOutDate: string | null;
};

function overnightFromTypeName(typeName: unknown): boolean {
  const token = normalizeToken(typeName);
  if (!token) return false;
  return /\bovernight\b/.test(token) || /\bboarding\b/.test(token) || /\bdog hotel\b/.test(token);
}

export function resolveBoardingOccupancy(
  reservation: Record<string, unknown>,
  routeDate: string
): BoardingOccupancy {
  const type = asRecord(reservation.reservation_type);
  const isOvernight = overnightFromTypeName(
    type?.type ?? type?.name ?? reservation.type ?? reservation.service ?? reservation.service_type ?? reservation.s_name
  );
  const checkInDate = gingrTimestampDateKey(reservation.check_in_date);
  const checkOutDate = gingrTimestampDateKey(reservation.check_out_date);
  const alreadyOnProperty =
    isOvernight &&
    checkInDate != null &&
    checkInDate < routeDate &&
    (checkOutDate == null || checkOutDate > routeDate);
  return { isOvernight, alreadyOnProperty, checkInDate, checkOutDate };
}

type TransportCandidate = {
  text: string;
  scheduledDate: string | null;
  source: "addon" | "service" | "reservation_type";
  cost: unknown;
  assignedTo: unknown;
};

/**
 * $0 unassigned "Taxi Service - Business Only" is a stay-level/internal
 * boarding marker, not a customer door-to-door taxi for the van.
 */
export function isInternalBoardingTaxiMarker(candidate: {
  text: string;
  cost?: unknown;
  assignedTo?: unknown;
}): boolean {
  const token = normalizeToken(candidate.text);
  if (!token || !/\btaxi\b/.test(token) || !/\bbusiness only\b/.test(token)) return false;
  const costNum = Number(candidate.cost);
  const zeroCost =
    candidate.cost == null || candidate.cost === "" || (Number.isFinite(costNum) && costNum === 0);
  const unassigned =
    candidate.assignedTo == null || String(candidate.assignedTo).trim() === "";
  return zeroCost && unassigned;
}

function candidateAppliesToRouteDate(
  candidate: TransportCandidate,
  routeDate: string,
  occupancy: BoardingOccupancy
): boolean {
  if (candidate.scheduledDate) return candidate.scheduledDate === routeDate;
  if (!occupancy.alreadyOnProperty) return true;
  const classified = classifyTransportationText(candidate.text);
  if (classified === "OWNER_CLUB_DROPOFF" || classified === "OWNER_CLUB_PICKUP") {
    return candidate.source === "addon";
  }
  return false;
}

/** Pull display strings from Gingr addon/service payloads of unknown shape. */
export function collectGingrTextValues(value: unknown, depth = 0): string[] {
  if (value == null || depth > 5) return [];
  try {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).trim();
      return text && text !== "[object Object]" ? [text] : [];
    }
    if (Array.isArray(value)) {
      const out: string[] = [];
      for (const item of value) {
        out.push(...collectGingrTextValues(item, depth + 1));
      }
      return out;
    }
    const record = asRecord(value);
    if (!record) return [];
    const out: string[] = [];
    for (const key of NAME_KEYS) {
      const nested = record[key];
      if (typeof nested === "string" || typeof nested === "number") {
        const text = String(nested).trim();
        if (text) out.push(text);
      } else if (nested && typeof nested === "object") {
        out.push(...collectGingrTextValues(nested, depth + 1));
      }
    }
    for (const key of ["addons", "addonData", "addon_data", "items", "services"]) {
      if (record[key] != null) out.push(...collectGingrTextValues(record[key], depth + 1));
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Classify a single Gingr addon/service label.
 * Owner wording always wins over generic pick up / drop off.
 */
export function classifyTransportationText(raw: unknown): GingrTransportationType {
  try {
    const texts =
      typeof raw === "string" || typeof raw === "number"
        ? [String(raw)]
        : collectGingrTextValues(raw);
    if (!texts.length) return "UNKNOWN";

    let found: GingrTransportationType = "UNKNOWN";
    for (const text of texts) {
      const token = normalizeToken(text);
      if (!token || !looksLikeTransportToken(token)) continue;
      const classified = classifyTransportToken(token);
      if (classified === "UNKNOWN") continue;
      if (classified === "OWNER_CLUB_DROPOFF" || classified === "OWNER_CLUB_PICKUP") {
        return classified;
      }
      if (found === "UNKNOWN") found = classified;
    }
    return found;
  } catch {
    return "UNKNOWN";
  }
}

function classifyTransportToken(token: string): GingrTransportationType {
  const hasOwner = /\bowners?\b/.test(token) || /\bclients?\b/.test(token) || /\bcustomers?\b/.test(token);
  const hasPickup = /\bpick ?ups?\b/.test(token) || /\bpickup\b/.test(token);
  const hasDropoff = /\bdrop ?offs?\b/.test(token) || /\bdropoff\b/.test(token);
  const atClub = /\bat (the )?club\b/.test(token) || /\bclub (drop|pick|arrival|departure)/.test(token);
  const hasTaxi =
    /\btaxi\b/.test(token) ||
    /\bdoor to door\b/.test(token) ||
    (/\btransport\b/.test(token) && !hasOwner && !hasPickup && !hasDropoff);

  if (hasTaxi && !hasOwner) return "TAXI";

  if (hasOwner || atClub) {
    if (hasDropoff && !hasPickup) return "OWNER_CLUB_DROPOFF";
    if (hasPickup && !hasDropoff) return "OWNER_CLUB_PICKUP";
    if (hasDropoff && hasPickup) return "UNKNOWN";
    if (/\bdrop\b/.test(token)) return "OWNER_CLUB_DROPOFF";
    if (/\bpick\b/.test(token)) return "OWNER_CLUB_PICKUP";
  }

  if (hasDropoff && !hasPickup) return "FITDOG_HOME_DROPOFF";
  if (hasPickup && !hasDropoff) return "FITDOG_HOME_PICKUP";
  return "UNKNOWN";
}

export function routeDirectionForTransportation(
  type: GingrTransportationType
): GingrRouteDirection {
  if (type === "FITDOG_HOME_PICKUP" || type === "OWNER_CLUB_DROPOFF") return "PICKUP";
  if (type === "FITDOG_HOME_DROPOFF" || type === "OWNER_CLUB_PICKUP") return "DROPOFF";
  if (type === "TAXI") return "PICKUP";
  return "NONE";
}

export function isFitdogVehicleTransportation(type: GingrTransportationType): boolean {
  return type === "FITDOG_HOME_PICKUP" || type === "FITDOG_HOME_DROPOFF" || type === "TAXI";
}

export type TransportationFlags = {
  types: GingrTransportationType[];
  fitdogHomePickup: boolean;
  fitdogHomeDropoff: boolean;
  ownerClubDropoff: boolean;
  ownerClubPickup: boolean;
  isTaxi: boolean;
  alreadyOnProperty: boolean;
};

export function emptyTransportationFlags(): TransportationFlags {
  return {
    types: [],
    fitdogHomePickup: false,
    fitdogHomeDropoff: false,
    ownerClubDropoff: false,
    ownerClubPickup: false,
    isTaxi: false,
    alreadyOnProperty: false
  };
}

function taxiVanLegs(token: string): { pickup: boolean; dropoff: boolean } {
  const hasPickup = /\bpick ?ups?\b/.test(token) || /\bpickup\b/.test(token);
  const hasDropoff = /\bdrop ?offs?\b/.test(token) || /\bdropoff\b/.test(token);
  if (hasDropoff && !hasPickup) return { pickup: false, dropoff: true };
  if (hasPickup && !hasDropoff) return { pickup: true, dropoff: false };
  return { pickup: true, dropoff: true };
}

export function mergeTransportationFlags(
  current: TransportationFlags,
  type: GingrTransportationType,
  sourceText = ""
): TransportationFlags {
  if (type === "UNKNOWN") return current;
  const types = current.types.includes(type) ? current.types : [...current.types, type];
  const next = { ...current, types };
  if (type === "FITDOG_HOME_PICKUP") next.fitdogHomePickup = true;
  if (type === "FITDOG_HOME_DROPOFF") next.fitdogHomeDropoff = true;
  if (type === "OWNER_CLUB_DROPOFF") next.ownerClubDropoff = true;
  if (type === "OWNER_CLUB_PICKUP") next.ownerClubPickup = true;
  if (type === "TAXI") {
    next.isTaxi = true;
    const legs = taxiVanLegs(normalizeToken(sourceText));
    if (legs.pickup) next.fitdogHomePickup = true;
    if (legs.dropoff) next.fitdogHomeDropoff = true;
  }
  return next;
}

function collectCandidatesFromValue(
  value: unknown,
  source: TransportCandidate["source"],
  inherited: { scheduledDate: string | null; cost: unknown; assignedTo: unknown },
  depth = 0
): TransportCandidate[] {
  if (value == null || depth > 5) return [];
  try {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      const text = String(value).trim();
      if (!text || !looksLikeTransportToken(normalizeToken(text))) return [];
      return [
        {
          text,
          scheduledDate: inherited.scheduledDate,
          source,
          cost: inherited.cost,
          assignedTo: inherited.assignedTo
        }
      ];
    }
    if (Array.isArray(value)) {
      const out: TransportCandidate[] = [];
      for (const item of value) {
        out.push(...collectCandidatesFromValue(item, source, inherited, depth + 1));
      }
      return out;
    }
    const record = asRecord(value);
    if (!record) return [];
    const scheduledDate =
      gingrTimestampDateKey(record.scheduled_at) ||
      gingrTimestampDateKey(record.scheduled_until) ||
      inherited.scheduledDate;
    const cost = record.cost !== undefined ? record.cost : inherited.cost;
    const assignedTo = record.assigned_to !== undefined ? record.assigned_to : inherited.assignedTo;
    const nextInherited = { scheduledDate, cost, assignedTo };
    const out: TransportCandidate[] = [];
    for (const key of NAME_KEYS) {
      if (record[key] != null) {
        out.push(...collectCandidatesFromValue(record[key], source, nextInherited, depth + 1));
      }
    }
    for (const key of ["addons", "addonData", "addon_data", "items", "services"]) {
      if (record[key] != null) {
        out.push(...collectCandidatesFromValue(record[key], source, nextInherited, depth + 1));
      }
    }
    return out;
  } catch {
    return [];
  }
}

function flagsFromCandidates(
  candidates: TransportCandidate[],
  routeDate: string,
  occupancy: BoardingOccupancy
): TransportationFlags {
  let flags = emptyTransportationFlags();
  flags.alreadyOnProperty = occupancy.alreadyOnProperty;
  for (const candidate of candidates) {
    if (isInternalBoardingTaxiMarker(candidate)) continue;
    if (!candidateAppliesToRouteDate(candidate, routeDate, occupancy)) continue;
    flags = mergeTransportationFlags(flags, classifyTransportationText(candidate.text), candidate.text);
  }
  flags.alreadyOnProperty = occupancy.alreadyOnProperty;
  return flags;
}

/** Addon / additional-service labels first; primary service names only as fallback. */
export function collectReservationTransportTexts(reservation: Record<string, unknown>): string[] {
  return collectReservationTransportCandidates(reservation).map((candidate) => candidate.text);
}

export function collectReservationTransportCandidates(
  reservation: Record<string, unknown>
): TransportCandidate[] {
  try {
    const emptyInherited = { scheduledDate: null as string | null, cost: undefined, assignedTo: undefined };
    const addonCandidates = [
      ...collectCandidatesFromValue(reservation.addons, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.addon, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.additional_services, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.reservation_services, "addon", emptyInherited)
    ];
    if (addonCandidates.length) return addonCandidates;

    const type = asRecord(reservation.reservation_type);
    return [
      ...collectCandidatesFromValue(reservation.services, "service", emptyInherited),
      ...collectCandidatesFromValue(type?.type, "reservation_type", emptyInherited),
      ...collectCandidatesFromValue(type?.name, "reservation_type", emptyInherited),
      ...collectCandidatesFromValue(reservation.type, "reservation_type", emptyInherited),
      ...collectCandidatesFromValue(reservation.service, "reservation_type", emptyInherited),
      ...collectCandidatesFromValue(reservation.service_type, "reservation_type", emptyInherited),
      ...collectCandidatesFromValue(reservation.s_name, "reservation_type", emptyInherited)
    ];
  } catch {
    return [];
  }
}

export function normalizeReservationTransportation(
  reservation: Record<string, unknown>,
  routeDate: string
): TransportationFlags {
  try {
    const occupancy = resolveBoardingOccupancy(reservation, routeDate);
    return flagsFromCandidates(
      collectReservationTransportCandidates(reservation),
      routeDate,
      occupancy
    );
  } catch {
    return emptyTransportationFlags();
  }
}

export function logTransportationClassification(input: {
  appointmentId?: string | number | null;
  service?: string | null;
  addon?: string | null;
  transportation: GingrTransportationType;
}) {
  if (process.env.GINGR_ROUTE_GENERATOR_DEBUG !== "1") return;
  console.debug(
    `[RouteGenerator] appointmentId=${input.appointmentId ?? ""} service=${JSON.stringify(input.service ?? "")} addon=${JSON.stringify(input.addon ?? "")} transportation=${input.transportation}`
  );
}
