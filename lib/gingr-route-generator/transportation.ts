/**
 * Normalize Gingr transportation from addon/service text.
 * Service (what the dog is doing) stays separate from how they travel.
 */

export type GingrTransportationType =
  | "FITDOG_HOME_PICKUP"
  | "OWNER_CLUB_DROPOFF"
  | "FITDOG_HOME_DROPOFF"
  | "OWNER_CLUB_PICKUP"
  | "BOARDING_CLUB"
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
    /\bdoor to door\b/.test(token) ||
    /\bfitdog to\b/.test(token) ||
    /\bat home\b/.test(token) ||
    /\bfitdog club\b/.test(token) ||
    /\bboarding\b/.test(token)
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
  return isBoardingTypeName(typeName);
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
  // Facility billing line — never a customer home-van taxi.
  return Boolean(token && /\btaxi\b/.test(token) && /\bbusiness only\b/.test(token));
}

export function isBoardingTypeName(raw: unknown): boolean {
  const token = normalizeToken(raw);
  if (!token) return false;
  return (
    /\bovernight\b/.test(token) ||
    /\bboarding\b/.test(token) ||
    /\bdog hotel\b/.test(token) ||
    /\bpetite suite\b/.test(token) ||
    /\bsuite\b/.test(token)
  );
}

export function isTaxiTypeName(raw: unknown): boolean {
  const token = normalizeToken(raw);
  if (!token || /\bbusiness only\b/.test(token)) return false;
  return /\btaxi\b/.test(token) || /\bdoor to door\b/.test(token);
}

export function isCanonicalTravelAddon(raw: unknown): boolean {
  const token = normalizeToken(raw);
  if (!token) return false;
  const classified = classifyTransportationText(raw);
  const atClub = /\bfitdog club\b/.test(token) || /\bat (the )?club\b/.test(token);
  const hasOwner = /\bowners?\b/.test(token);
  const hasFitdogHome = /\bfitdog to\b/.test(token) && /\bhome\b/.test(token);
  if (hasFitdogHome && (classified === "FITDOG_HOME_PICKUP" || classified === "FITDOG_HOME_DROPOFF")) {
    return true;
  }
  if (hasOwner && (classified === "OWNER_CLUB_DROPOFF" || classified === "OWNER_CLUB_PICKUP")) {
    return true;
  }
  if (classified === "BOARDING_CLUB" || (/\bboarding\b/.test(token) && atClub)) return true;
  return false;
}

function isOvernightStay(occupancy: BoardingOccupancy): boolean {
  if (!occupancy.isOvernight) return false;
  if (!occupancy.checkInDate) return occupancy.isOvernight;
  if (!occupancy.checkOutDate) return true;
  return occupancy.checkInDate !== occupancy.checkOutDate;
}

/**
 * Only travel that belongs to `routeDate` counts.
 * Undated reservation-level addons on a multi-day boarding stay are check-in
 * (pickup / owner drop-off) or checkout (drop-off / owner pick-up) only.
 * Nested addons inherit the parent appointment date and apply that day.
 */
function candidateAppliesToRouteDate(
  candidate: TransportCandidate,
  routeDate: string,
  occupancy: BoardingOccupancy
): boolean {
  if (candidate.scheduledDate) return candidate.scheduledDate === routeDate;

  const classified = classifyTransportationText(candidate.text);
  if (classified === "BOARDING_CLUB") return true;

  if (isOvernightStay(occupancy)) {
    if (occupancy.alreadyOnProperty) return false;
    if (occupancy.checkInDate && occupancy.checkInDate === routeDate) {
      return classified === "FITDOG_HOME_PICKUP" || classified === "OWNER_CLUB_DROPOFF";
    }
    if (occupancy.checkOutDate && occupancy.checkOutDate === routeDate) {
      return classified === "FITDOG_HOME_DROPOFF" || classified === "OWNER_CLUB_PICKUP";
    }
    return false;
  }

  return true;
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
    for (const key of [
      "addons",
      "addonData",
      "addon_data",
      "items",
      "services",
      "options",
      "appointment_options",
      "reservation_options"
    ]) {
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
      if (
        classified === "OWNER_CLUB_DROPOFF" ||
        classified === "OWNER_CLUB_PICKUP" ||
        classified === "BOARDING_CLUB"
      ) {
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
  const atHome = /\bat home\b/.test(token);
  const atClub =
    /\bfitdog club\b/.test(token) ||
    /\bat (the )?club\b/.test(token) ||
    /\bclub (drop|pick|arrival|departure)/.test(token);
  const hasOwner = /\bowners?\b/.test(token) || /\bclients?\b/.test(token) || /\bcustomers?\b/.test(token);
  const hasPickup = /\bpick ?ups?\b/.test(token) || /\bpickup\b/.test(token);
  const hasDropoff = /\bdrop ?offs?\b/.test(token) || /\bdropoff\b/.test(token);
  const hasTaxi =
    /\btaxi\b/.test(token) ||
    /\bdoor to door\b/.test(token) ||
    (/\btransport\b/.test(token) && !hasOwner && !hasPickup && !hasDropoff);

  // Canonical Gingr addons (staff-updated names).
  if (/\bfitdog to pick up at home\b/.test(token) || (/\bfitdog to pick up\b/.test(token) && atHome)) {
    return "FITDOG_HOME_PICKUP";
  }
  if (/\bfitdog to drop off at home\b/.test(token) || (/\bfitdog to drop off\b/.test(token) && atHome)) {
    return "FITDOG_HOME_DROPOFF";
  }
  if (hasOwner && hasDropoff && atClub && !hasPickup) return "OWNER_CLUB_DROPOFF";
  if (hasOwner && hasPickup && atClub && !hasDropoff) return "OWNER_CLUB_PICKUP";
  if (/\bboarding\b/.test(token) && atClub && !atHome) return "BOARDING_CLUB";

  if (hasTaxi && !hasOwner && !atHome) return "TAXI";

  if ((hasOwner || atClub) && !atHome) {
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
  /** Owner Pick Up @ Fitdog Club addon — van returns the dog to the club. */
  returnToClub: boolean;
  isBoardingStay: boolean;
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
    returnToClub: false,
    isBoardingStay: false,
    isTaxi: false,
    alreadyOnProperty: false
  };
}

function pacificHour(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = raw.match(/T(\d{2}):/);
  if (match) return Number(match[1]);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(parsed)
  );
  return Number.isFinite(hour) ? hour : null;
}

/** AM taxi = home pickup and stay at club. PM taxi = home drop-off. Both = door-to-door. */
export function taxiVanLegs(
  token: string,
  scheduledAt?: unknown
): { pickup: boolean; dropoff: boolean } {
  const hasAm = /\bam\b/.test(token) || /\bmorning\b/.test(token);
  const hasPm = /\bpm\b/.test(token) || /\bafternoon\b/.test(token);
  const roundTrip = /\bdoor to door\b/.test(token) || /\bround trip\b/.test(token) || /\bboth\b/.test(token);
  const hasPickup = /\bpick ?ups?\b/.test(token) || /\bpickup\b/.test(token);
  const hasDropoff = /\bdrop ?offs?\b/.test(token) || /\bdropoff\b/.test(token);
  if (roundTrip) return { pickup: true, dropoff: true };
  if (hasAm && !hasPm) return { pickup: true, dropoff: false };
  if (hasPm && !hasAm) return { pickup: false, dropoff: true };
  if (hasDropoff && !hasPickup) return { pickup: false, dropoff: true };
  if (hasPickup && !hasDropoff) return { pickup: true, dropoff: false };
  const hour = pacificHour(scheduledAt);
  if (hour != null) {
    return hour < 12 ? { pickup: true, dropoff: false } : { pickup: false, dropoff: true };
  }
  // One taxi with no AM/PM/time stays at the club after the morning pickup.
  return { pickup: true, dropoff: false };
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
  if (type === "OWNER_CLUB_PICKUP") {
    next.ownerClubPickup = true;
    next.returnToClub = true;
  }
  if (type === "BOARDING_CLUB") {
    next.alreadyOnProperty = true;
    next.isBoardingStay = true;
  }
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
    for (const key of [
      "addons",
      "addonData",
      "addon_data",
      "items",
      "services",
      "options",
      "appointment_options",
      "reservation_options"
    ]) {
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
  flags.alreadyOnProperty = occupancy.alreadyOnProperty || flags.alreadyOnProperty;
  return flags;
}

/** Travel addons only — never reservation type. Type is the activity category. */
export function collectReservationTransportTexts(reservation: Record<string, unknown>): string[] {
  return collectReservationTransportCandidates(reservation).map((candidate) => candidate.text);
}

function reservationTypeLabel(reservation: Record<string, unknown>): string {
  const type = asRecord(reservation.reservation_type);
  const raw = type?.type ?? type?.name ?? reservation.type ?? reservation.service ?? reservation.service_type ?? reservation.s_name;
  return raw == null ? "" : String(raw);
}

function listServiceLikeRows(reservation: Record<string, unknown>): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const key of [
    "addons",
    "addon",
    "additional_services",
    "reservation_services",
    "services",
    "options",
    "appointment_options",
    "reservation_options"
  ]) {
    const value = reservation[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const row = asRecord(item);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function collectReservationTransportCandidates(
  reservation: Record<string, unknown>
): TransportCandidate[] {
  try {
    const emptyInherited = { scheduledDate: null as string | null, cost: undefined, assignedTo: undefined };
    return [
      ...collectCandidatesFromValue(reservation.addons, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.addon, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.additional_services, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.reservation_services, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.appointment_options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.reservation_options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.services, "service", emptyInherited)
    ].filter((candidate) => isCanonicalTravelAddon(candidate.text) && !isInternalBoardingTaxiMarker(candidate));
  } catch {
    return [];
  }
}

function taxiRowAppliesToRouteDate(
  row: Record<string, unknown>,
  routeDate: string,
  occupancy: BoardingOccupancy
): boolean {
  const scheduled =
    gingrTimestampDateKey(row.scheduled_at) || gingrTimestampDateKey(row.scheduled_until);
  if (scheduled) return scheduled === routeDate;
  if (occupancy.alreadyOnProperty) return false;
  return true;
}

function applyTypeTravelDefaults(
  flags: TransportationFlags,
  reservation: Record<string, unknown>,
  routeDate: string,
  occupancy: BoardingOccupancy
): TransportationFlags {
  const next = { ...flags };
  const typeName = reservationTypeLabel(reservation);

  if (isBoardingTypeName(typeName) || next.types.includes("BOARDING_CLUB")) {
    next.isBoardingStay = true;
    next.alreadyOnProperty =
      next.alreadyOnProperty ||
      occupancy.alreadyOnProperty ||
      Boolean(
        occupancy.isOvernight &&
          occupancy.checkInDate &&
          occupancy.checkInDate <= routeDate &&
          (occupancy.checkOutDate == null || occupancy.checkOutDate >= routeDate)
      );
    if (!next.types.includes("BOARDING_CLUB")) {
      next.types = [...next.types, "BOARDING_CLUB"];
    }
    if (next.alreadyOnProperty && !next.fitdogHomeDropoff) {
      next.ownerClubPickup = true;
      next.returnToClub = true;
    }
  }

  const taxiRows = listServiceLikeRows(reservation).filter((row) => {
    const name = String(row.name ?? row.service ?? row.type ?? row.s_name ?? "");
    return (
      isTaxiTypeName(name) &&
      !isInternalBoardingTaxiMarker({ text: name, cost: row.cost, assignedTo: row.assigned_to }) &&
      taxiRowAppliesToRouteDate(row, routeDate, occupancy)
    );
  });
  const typeIsTaxi = isTaxiTypeName(typeName) && !occupancy.alreadyOnProperty && !next.isBoardingStay;
  if (typeIsTaxi || taxiRows.length) {
    next.isTaxi = true;
    if (!next.types.includes("TAXI")) next.types = [...next.types, "TAXI"];
    if (taxiRows.length) {
      for (const row of taxiRows) {
        const name = String(row.name ?? row.service ?? row.type ?? row.s_name ?? typeName);
        const scheduled = row.scheduled_at ?? row.scheduled_until;
        const legs = taxiVanLegs(normalizeToken(name), scheduled);
        if (legs.pickup) next.fitdogHomePickup = true;
        if (legs.dropoff) next.fitdogHomeDropoff = true;
      }
    } else if (typeIsTaxi) {
      const legs = taxiVanLegs(normalizeToken(typeName));
      if (legs.pickup) next.fitdogHomePickup = true;
      if (legs.dropoff) next.fitdogHomeDropoff = true;
    }
    if (next.fitdogHomePickup && !next.fitdogHomeDropoff) {
      next.alreadyOnProperty = true;
      next.ownerClubPickup = true;
      next.returnToClub = true;
    }
  }

  return next;
}

export function normalizeReservationTransportation(
  reservation: Record<string, unknown>,
  routeDate: string
): TransportationFlags {
  try {
    const occupancy = resolveBoardingOccupancy(reservation, routeDate);
    const fromAddons = flagsFromCandidates(
      collectReservationTransportCandidates(reservation),
      routeDate,
      occupancy
    );
    return applyTypeTravelDefaults(fromAddons, reservation, routeDate, occupancy);
  } catch {
    return emptyTransportationFlags();
  }
}

export type TransportLifecycle = {
  startLocation: "home" | "club";
  endLocation: "home" | "club";
  homePickup: boolean;
  homeDropoff: boolean;
  /**
   * Boarding @ Fitdog Club (or an in-progress stay) makes Fitdog Club the dog's
   * transportation location. Direction is decided later by the day's activities.
   */
  clubLocation: boolean;
};

/**
 * Home legs come only from Fitdog to Pick Up / Drop Off @ Home (or a dated taxi).
 * Owner club options and boarding describe where the dog is, not who drives.
 */
export function resolveTransportLifecycle(flags: TransportationFlags): TransportLifecycle {
  const homePickup = flags.fitdogHomePickup;
  const homeDropoff = flags.fitdogHomeDropoff;
  return {
    homePickup,
    homeDropoff,
    startLocation: homePickup ? "home" : "club",
    endLocation: homeDropoff ? "home" : "club",
    clubLocation:
      flags.isBoardingStay || flags.alreadyOnProperty || flags.types.includes("BOARDING_CLUB")
  };
}

export function resolveVanStopDestinations(flags: TransportationFlags): {
  pickup: "home" | "club" | null;
  dropoff: "home" | "club" | null;
} {
  const lifecycle = resolveTransportLifecycle(flags);
  return {
    pickup: lifecycle.homePickup ? "home" : null,
    dropoff: lifecycle.homeDropoff ? "home" : null
  };
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
