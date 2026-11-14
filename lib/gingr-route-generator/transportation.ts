/**
 * Gingr transportation: appointment options → per-dog transport plan.
 *
 * Each appointment option is read for its outing phase (Before / After /
 * Boarding), who is responsible (owner or Fitdog), the physical action, and
 * the place. The plan then decides the dog's starting location and final
 * destination as two separate decisions, and which Fitdog driver stops follow.
 * Service (what the dog is doing) stays separate from how they travel.
 */

import { DEFAULT_FITDOG_LOCATIONS } from "@/lib/route-generator/locations";

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

/** Option names only. Free-text descriptions can mention pick-ups without being one. */
const OPTION_NAME_KEYS = NAME_KEYS.filter((key) => key !== "description");

const NESTED_OPTION_KEYS = [
  "addons",
  "addonData",
  "addon_data",
  "items",
  "services",
  "options",
  "appointment_options",
  "reservation_options"
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

function idText(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).trim();
  return text || null;
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
    /\bboarding\b/.test(token) ||
    /\b(before|after) (the )?outing\b/.test(token)
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

/**
 * Overnight stay dates. Gingr fills check_in_date / check_out_date when staff
 * check the dog in or out; before that the booked start / end dates stand in.
 */
export function resolveBoardingOccupancy(
  reservation: Record<string, unknown>,
  routeDate: string
): BoardingOccupancy {
  const type = asRecord(reservation.reservation_type);
  const isOvernight = overnightFromTypeName(
    type?.type ?? type?.name ?? reservation.type ?? reservation.service ?? reservation.service_type ?? reservation.s_name
  );
  const checkInDate =
    gingrTimestampDateKey(reservation.check_in_date) ??
    (isOvernight ? gingrTimestampDateKey(reservation.start_date) : null);
  const checkOutDate =
    gingrTimestampDateKey(reservation.check_out_date) ??
    (isOvernight ? gingrTimestampDateKey(reservation.end_date) : null);
  const alreadyOnProperty =
    isOvernight &&
    checkInDate != null &&
    checkInDate < routeDate &&
    (checkOutDate == null || checkOutDate > routeDate);
  return { isOvernight, alreadyOnProperty, checkInDate, checkOutDate };
}

type TransportCandidate = {
  text: string;
  /** Gingr id of the option / service row the text came from. */
  optionId: string | null;
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

function isOvernightStay(occupancy: BoardingOccupancy): boolean {
  if (!occupancy.isOvernight) return false;
  if (!occupancy.checkInDate) return occupancy.isOvernight;
  if (!occupancy.checkOutDate) return true;
  return occupancy.checkInDate !== occupancy.checkOutDate;
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
    for (const key of NESTED_OPTION_KEYS) {
      if (record[key] != null) out.push(...collectGingrTextValues(record[key], depth + 1));
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Coarse transportation type of a Gingr addon/service label.
 * Owner wording always wins over generic pick up / drop off. Routing uses
 * `classifyAppointmentOption`; this stays for activity matching.
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
  const atHome =
    /\bat home\b/.test(token) ||
    (/\bhome\b/.test(token) && /\bfitdog to (pick up|drop off)\b/.test(token));
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
  const beforeOuting = /\bbefore (the )?outing\b/.test(token);
  const afterOuting =
    /\bafter (the )?outing\b/.test(token) ||
    /\bafter (the )?(hike|beach|excursion)\b/.test(token);

  // Sport / outing appointment options: before = arrive, after = leave.
  if (beforeOuting) {
    if (hasOwner || (hasDropoff && !hasPickup && !/\bfitdog to\b/.test(token))) {
      return "OWNER_CLUB_DROPOFF";
    }
    if (hasPickup || /\bfitdog to pick\b/.test(token)) return "FITDOG_HOME_PICKUP";
  }
  if (afterOuting) {
    if (hasOwner || (hasPickup && !hasDropoff && !/\bfitdog to\b/.test(token))) {
      return "OWNER_CLUB_PICKUP";
    }
    if (hasDropoff || /\bfitdog to drop\b/.test(token) || /\bstaff\b/.test(token)) {
      return "FITDOG_HOME_DROPOFF";
    }
  }

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

// --- Structured appointment options ---------------------------------------

/** Before = getting to the outing, After = leaving it. Not who transports. */
export type GingrOutingPhase = "BEFORE" | "AFTER" | "BOARDING" | "UNKNOWN";
export type GingrOptionFilter = "PICKUP" | "DROPOFF" | "BOARDING" | "UNKNOWN";
export type GingrResponsibleParty = "OWNER" | "FITDOG" | "UNKNOWN";
export type GingrPhysicalAction = "PICKUP" | "DROPOFF" | "NONE" | "UNKNOWN";
export type GingrPlaceType = "HOME" | "FITDOG_CLUB" | "UNKNOWN";
export type GingrOptionSource = "gingr" | "overnight_stay" | "taxi" | "fitdog_signup";
export type GingrStayDay = "check_in" | "mid_stay" | "checkout";

export type GingrAppointmentOption = {
  /** Gingr id of the option / service row, when the payload carries one. */
  optionId: string | null;
  /** The option exactly as booked. */
  optionName: string;
  /** Canonical wording for what the option means. */
  label: string;
  source: GingrOptionSource;
  reservationId: string | null;
  phase: GingrOutingPhase;
  /** True when the option has no Before / After wording and the phase comes from its action. */
  phaseInferred: boolean;
  filter: GingrOptionFilter;
  responsibleParty: GingrResponsibleParty;
  action: GingrPhysicalAction;
  location: GingrPlaceType;
  isBoarding: boolean;
  /** Where the route date falls in an overnight stay. */
  stayDay: GingrStayDay | null;
  transportationType: GingrTransportationType;
  /** Why this option cannot be routed without a person checking it. */
  issue: string | null;
};

const PICKUP_RE = /\bpick ?ups?\b|\bpickup\b/;
const DROPOFF_RE = /\bdrop ?offs?\b|\bdropoff\b/;

type OptionReading = {
  taxi: boolean;
  phase: GingrOutingPhase;
  phaseInferred: boolean;
  responsibleParty: GingrResponsibleParty;
  action: GingrPhysicalAction;
  location: GingrPlaceType;
  isBoarding: boolean;
  issue: string | null;
};

function impliedPhase(party: GingrResponsibleParty, action: GingrPhysicalAction): GingrOutingPhase {
  if (party === "FITDOG" && action === "PICKUP") return "BEFORE";
  if (party === "FITDOG" && action === "DROPOFF") return "AFTER";
  if (party === "OWNER" && action === "DROPOFF") return "BEFORE";
  if (party === "OWNER" && action === "PICKUP") return "AFTER";
  return "UNKNOWN";
}

function readOptionToken(name: string, token: string): OptionReading | null {
  const boarding = /\bboarding\b/.test(token);
  const taxi = /\btaxi\b/.test(token) || /\bdoor to door\b/.test(token);
  const before = /\bbefore\b/.test(token);
  const after = /\bafter\b/.test(token);
  const pickup = PICKUP_RE.test(token);
  const dropoff = DROPOFF_RE.test(token);
  const home = /\bhome\b/.test(token);
  const club = /\bclub\b/.test(token);
  const owner = /\b(owners?|clients?|customers?|parents?)\b/.test(token);
  // "Fitdog Club" is a place. Fitdog only transports when named outside it.
  const fitdog = /\b(fitdog|staff|driver|van)\b/.test(token.replace(/\bfitdog club\b/g, " "));
  const hasAction = pickup || dropoff;

  const isOption =
    boarding ||
    taxi ||
    (hasAction && (owner || fitdog || home || club || before || after)) ||
    ((before || after) && /\bouting\b/.test(token));
  if (!isOption) return null;

  if (taxi && !owner) {
    // Taxi legs come from the visit and AM / PM rules.
    return {
      taxi: true,
      phase: "UNKNOWN",
      phaseInferred: true,
      responsibleParty: "FITDOG",
      action: "UNKNOWN",
      location: "HOME",
      isBoarding: false,
      issue: null
    };
  }

  const problems: string[] = [];
  if (owner && fitdog) problems.push("names both the owner and Fitdog");
  if (pickup && dropoff) problems.push("names both a pick-up and a drop-off");
  if (home && club) problems.push("names both home and Fitdog Club");

  const responsibleParty: GingrResponsibleParty =
    owner && fitdog ? "UNKNOWN" : owner ? "OWNER" : fitdog ? "FITDOG" : boarding && !hasAction ? "FITDOG" : "UNKNOWN";
  const action: GingrPhysicalAction =
    pickup && dropoff ? "UNKNOWN" : pickup ? "PICKUP" : dropoff ? "DROPOFF" : boarding ? "NONE" : "UNKNOWN";
  let location: GingrPlaceType = home && club ? "UNKNOWN" : home ? "HOME" : club ? "FITDOG_CLUB" : "UNKNOWN";
  if (location === "UNKNOWN" && !(home && club)) {
    // The owner hands off at the Club; Fitdog's own pick-up / drop-off is at the owner's home.
    if (boarding && action === "NONE") location = "FITDOG_CLUB";
    else if (responsibleParty === "OWNER" && hasAction) location = "FITDOG_CLUB";
    else if (responsibleParty === "FITDOG" && hasAction) location = "HOME";
  }

  let phase: GingrOutingPhase = "UNKNOWN";
  let phaseInferred = false;
  if (boarding && action === "NONE") phase = "BOARDING";
  else if (before && after) problems.push("says both Before and After");
  else if (before) phase = "BEFORE";
  else if (after) phase = "AFTER";
  else {
    phaseInferred = true;
    phase = impliedPhase(responsibleParty, action);
  }

  if (!problems.length && phase !== "BOARDING") {
    if (responsibleParty === "UNKNOWN") {
      problems.push("does not say whether the owner or Fitdog is responsible");
    } else if (action !== "PICKUP" && action !== "DROPOFF") {
      problems.push("does not say whether it is a pick-up or a drop-off");
    } else if (phase === "BEFORE" && responsibleParty === "FITDOG" && action === "DROPOFF") {
      problems.push("puts a Fitdog drop-off before the outing");
    } else if (phase === "BEFORE" && responsibleParty === "OWNER" && action === "PICKUP") {
      problems.push("puts an owner pick-up before the outing");
    } else if (phase === "AFTER" && responsibleParty === "FITDOG" && action === "PICKUP") {
      problems.push("puts a Fitdog pick-up after the outing");
    } else if (phase === "AFTER" && responsibleParty === "OWNER" && action === "DROPOFF") {
      problems.push("puts an owner drop-off after the outing");
    } else if (responsibleParty === "OWNER" && location !== "FITDOG_CLUB") {
      problems.push("has the owner handing off somewhere other than Fitdog Club");
    }
  }

  return {
    taxi: false,
    phase,
    phaseInferred,
    responsibleParty,
    action,
    location,
    isBoarding: boarding,
    issue: problems.length ? `"${name}" ${problems[0]}.` : null
  };
}

function optionFilterForPhase(phase: GingrOutingPhase): GingrOptionFilter {
  if (phase === "BEFORE") return "PICKUP";
  if (phase === "AFTER") return "DROPOFF";
  if (phase === "BOARDING") return "BOARDING";
  return "UNKNOWN";
}

function legacyTransportationType(reading: OptionReading): GingrTransportationType {
  if (reading.taxi) return "TAXI";
  if (reading.issue) return "UNKNOWN";
  if (reading.phase === "BOARDING") return "BOARDING_CLUB";
  if (reading.responsibleParty === "OWNER") {
    return reading.action === "DROPOFF" ? "OWNER_CLUB_DROPOFF" : "OWNER_CLUB_PICKUP";
  }
  if (reading.location === "HOME") {
    return reading.action === "PICKUP" ? "FITDOG_HOME_PICKUP" : "FITDOG_HOME_DROPOFF";
  }
  return "UNKNOWN";
}

function canonicalOptionLabel(name: string, reading: OptionReading): string {
  if (reading.taxi) return "Taxi Service";
  if (reading.issue) return name;
  if (reading.phase === "BOARDING") return "Boarding @ Fitdog Club";
  const place = reading.location === "HOME" ? "Home" : "Fitdog Club";
  const core =
    reading.responsibleParty === "OWNER"
      ? reading.action === "DROPOFF"
        ? `Owner To Drop Off @ ${place}`
        : `Owner Pick Up @ ${place}`
      : reading.action === "PICKUP"
        ? `Fitdog to Pick Up @ ${place}`
        : `Fitdog to Drop Off @ ${place}`;
  const withBoarding = reading.isBoarding ? `Boarding - ${core}` : core;
  if (reading.phaseInferred) return withBoarding;
  return `${reading.phase === "BEFORE" ? "Before Outing" : "After Outing"} - ${withBoarding}`;
}

/**
 * Read one booked appointment option for its full meaning. Returns null when
 * the text is not a transportation or boarding option (an activity name, a note).
 */
export function classifyAppointmentOption(
  raw: unknown,
  meta: {
    optionId?: string | null;
    source?: GingrOptionSource;
    reservationId?: string | null;
    stayDay?: GingrStayDay | null;
  } = {}
): GingrAppointmentOption | null {
  const name = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  const token = normalizeToken(name);
  if (!token) return null;
  const reading = readOptionToken(name, token);
  if (!reading) return null;
  return {
    optionId: meta.optionId ?? null,
    optionName: name,
    label: canonicalOptionLabel(name, reading),
    source: meta.source ?? "gingr",
    reservationId: meta.reservationId ?? null,
    phase: reading.phase,
    phaseInferred: reading.phaseInferred,
    filter: optionFilterForPhase(reading.phase),
    responsibleParty: reading.responsibleParty,
    action: reading.action,
    location: reading.location,
    isBoarding: reading.isBoarding,
    stayDay: reading.isBoarding ? meta.stayDay ?? null : null,
    transportationType: legacyTransportationType(reading),
    issue: reading.issue
  };
}

function isCompleteOptionSegment(segment: string): boolean {
  const option = classifyAppointmentOption(segment);
  if (!option || option.issue) return false;
  return (
    option.transportationType === "TAXI" ||
    option.phase === "BOARDING" ||
    option.action === "PICKUP" ||
    option.action === "DROPOFF"
  );
}

/**
 * Split Gingr "appointment options" cells that list multiple choices in one
 * string. A pipe separates choices only when every side is a full option on its
 * own; "Owner Drop Off | Fitdog Club" stays one option.
 */
export function splitAppointmentOptionParts(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const parts = text
    .split(/\s*[,;\n]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts.length ? parts : [text]) {
    const segments = part
      .split(/\s*\|\s*/)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length > 1 && segments.every(isCompleteOptionSegment)) out.push(...segments);
    else out.push(part);
  }
  return out;
}

/** Human-readable Gingr appointment option label for UI (canonical when recognized). */
export function appointmentOptionLabel(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  for (const part of splitAppointmentOptionParts(trimmed)) {
    const option = classifyAppointmentOption(part);
    if (option) return option.label;
  }
  return null;
}

// --- Visits and taxi -------------------------------------------------------

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

export type GingrVisitKind = "stay_and_play" | "half_day" | "full_day" | "overnight";

/** Stay and Play, half-day, full-day, and overnight are the visits a taxi can attach to. */
export function classifyGingrVisit(raw: unknown): GingrVisitKind | null {
  const token = normalizeToken(raw);
  if (!token) return null;
  if (/\bstay (and|n) play\b/.test(token) || /\bstay play\b/.test(token)) return "stay_and_play";
  if (/\bhalf day\b/.test(token)) return "half_day";
  if (/\bfull day\b/.test(token)) return "full_day";
  if (isBoardingTypeName(raw)) return "overnight";
  return null;
}

export function classifyHalfDayPeriod(
  raw: unknown,
  scheduledAt?: unknown
): "morning" | "afternoon" | null {
  const token = normalizeToken(raw);
  if (/\bmorning\b/.test(token) || /\bam\b/.test(token)) return "morning";
  if (/\bafternoon\b/.test(token) || /\bevening\b/.test(token) || /\bpm\b/.test(token)) return "afternoon";
  const hour = pacificHour(scheduledAt);
  if (hour == null) return null;
  return hour < 12 ? "morning" : "afternoon";
}

export function formatGingrVisitLabel(input: {
  visit: GingrVisitKind | null;
  halfPeriod: "morning" | "afternoon" | null;
  routeDate: string;
  checkInDate: string | null;
  checkOutDate: string | null;
}): string | null {
  if (input.visit === "stay_and_play") return "Stay and Play";
  if (input.visit === "full_day") return "Full-day daycare";
  if (input.visit === "half_day") {
    if (input.halfPeriod === "afternoon") return "Half-day daycare · afternoon";
    if (input.halfPeriod === "morning") return "Half-day daycare · morning";
    return "Half-day daycare";
  }
  if (input.visit === "overnight") {
    if (input.checkInDate === input.routeDate) return "Overnight boarding · check-in";
    if (input.checkOutDate === input.routeDate) return "Overnight boarding · checkout";
    return "Overnight boarding · mid-stay";
  }
  return null;
}

/**
 * A taxi attached to Stay and Play, half-day, or full-day covers both ends of
 * that visit. Overnight taxi is a check-in pickup or a checkout drop-off.
 * A taxi with no visit keeps the AM / PM / door-to-door reading.
 */
export function visitTaxiLegs(input: {
  visit: GingrVisitKind | null;
  routeDate: string;
  occupancy: BoardingOccupancy;
  taxiText: string;
  scheduledAt?: unknown;
}): { pickup: boolean; dropoff: boolean } {
  if (input.visit === "full_day" || input.visit === "stay_and_play" || input.visit === "half_day") {
    return { pickup: true, dropoff: true };
  }
  if (input.visit === "overnight" || input.occupancy.isOvernight) {
    if (input.occupancy.checkInDate === input.routeDate) return { pickup: true, dropoff: false };
    if (input.occupancy.checkOutDate === input.routeDate) return { pickup: false, dropoff: true };
    return { pickup: false, dropoff: false };
  }
  return taxiVanLegs(normalizeToken(input.taxiText), input.scheduledAt);
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

// --- Reservation payloads --------------------------------------------------

function collectCandidatesFromValue(
  value: unknown,
  source: TransportCandidate["source"],
  inherited: { optionId: string | null; scheduledDate: string | null; cost: unknown; assignedTo: unknown },
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
          optionId: inherited.optionId,
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
    const optionId =
      idText(record.id) ??
      idText(record.option_id) ??
      idText(record.addon_id) ??
      idText(record.service_id) ??
      inherited.optionId;
    const nextInherited = { optionId, scheduledDate, cost, assignedTo };
    const out: TransportCandidate[] = [];
    for (const key of OPTION_NAME_KEYS) {
      if (record[key] != null) {
        out.push(...collectCandidatesFromValue(record[key], source, nextInherited, depth + 1));
      }
    }
    for (const key of NESTED_OPTION_KEYS) {
      if (record[key] != null) {
        out.push(...collectCandidatesFromValue(record[key], source, nextInherited, depth + 1));
      }
    }
    return out;
  } catch {
    return [];
  }
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

/** Every appointment-option-like text on the reservation (never the reservation type). */
export function collectReservationTransportCandidates(
  reservation: Record<string, unknown>
): TransportCandidate[] {
  try {
    const emptyInherited = {
      optionId: null as string | null,
      scheduledDate: null as string | null,
      cost: undefined,
      assignedTo: undefined
    };
    return [
      ...collectCandidatesFromValue(reservation.addons, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.addon, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.additional_services, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.reservation_services, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.appointment_options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.reservation_options, "addon", emptyInherited),
      ...collectCandidatesFromValue(reservation.services, "service", emptyInherited)
    ].filter((candidate) => !isInternalBoardingTaxiMarker(candidate));
  } catch {
    return [];
  }
}

/** Travel addons only — never reservation type. Type is the activity category. */
export function collectReservationTransportTexts(reservation: Record<string, unknown>): string[] {
  return collectReservationTransportCandidates(reservation).map((candidate) => candidate.text);
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

/**
 * Gingr books real taxis as "Taxi Service - Business Only" rows dated to the
 * ride (check-in morning, checkout evening, or a daycare morning). Dated to the
 * route date, that row is the day's taxi; undated, it is only a billing line.
 */
export function isTaxiRowForRouteDate(
  row: Record<string, unknown>,
  routeDate: string,
  occupancy: BoardingOccupancy
): boolean {
  const name = String(row.name ?? row.service ?? row.type ?? row.s_name ?? "");
  if (isInternalBoardingTaxiMarker({ text: name })) {
    const scheduled =
      gingrTimestampDateKey(row.scheduled_at) || gingrTimestampDateKey(row.scheduled_until);
    return scheduled === routeDate;
  }
  return isTaxiTypeName(name) && taxiRowAppliesToRouteDate(row, routeDate, occupancy);
}

function overnightStayDay(occupancy: BoardingOccupancy, routeDate: string): GingrStayDay | null {
  if (!occupancy.isOvernight) return null;
  if (occupancy.checkInDate === routeDate) return "check_in";
  if (occupancy.checkOutDate === routeDate) return "checkout";
  if (occupancy.checkInDate && occupancy.checkInDate < routeDate) return "mid_stay";
  return null;
}

/**
 * Does an option belong to the route date?
 * A dated option belongs to its own date. On a multi-day stay an undated option
 * belongs to the stay, so Before / After wording applies on the stay's activity
 * day, and an undated pick-up / drop-off with no wording is check-in / checkout.
 * Returns an issue when the date cannot be told.
 */
function optionAppliesToRouteDate(
  option: GingrAppointmentOption,
  scheduledDate: string | null,
  context: {
    routeDate: string;
    multiDayStay: boolean;
    occupancy: BoardingOccupancy;
    qualifyingServiceOnDate: boolean;
    activityDays: Set<string>;
  }
): boolean | string {
  if (scheduledDate) return scheduledDate === context.routeDate;
  if (option.transportationType === "TAXI") return !context.multiDayStay;
  if (option.phase === "BOARDING") return true;
  if (!context.multiDayStay) return true;
  if ((option.phase === "BEFORE" || option.phase === "AFTER") && !option.phaseInferred) {
    if (!context.qualifyingServiceOnDate) return false;
    if (context.activityDays.size > 1) {
      return `"${option.optionName}" has no date, and this stay has activities on ${context.activityDays.size} days.`;
    }
    return true;
  }
  if (option.phase === "BEFORE") return context.occupancy.checkInDate === context.routeDate;
  if (option.phase === "AFTER") return context.occupancy.checkOutDate === context.routeDate;
  return context.qualifyingServiceOnDate;
}

function taxiLegOption(
  leg: "PICKUP" | "DROPOFF",
  rowName: string,
  meta: { optionId: string | null; reservationId: string | null }
): GingrAppointmentOption {
  const pickup = leg === "PICKUP";
  return {
    optionId: meta.optionId,
    optionName: rowName,
    label: pickup ? "Taxi Service - Fitdog to Pick Up @ Home" : "Taxi Service - Fitdog to Drop Off @ Home",
    source: "taxi",
    reservationId: meta.reservationId,
    phase: pickup ? "BEFORE" : "AFTER",
    phaseInferred: true,
    filter: pickup ? "PICKUP" : "DROPOFF",
    responsibleParty: "FITDOG",
    action: leg,
    location: "HOME",
    isBoarding: false,
    stayDay: null,
    transportationType: "TAXI",
    issue: null
  };
}

export type GingrReservationRouteOptions = {
  /** Options that apply to the route date: as booked, plus taxi legs and overnight boarding. */
  options: GingrAppointmentOption[];
  isTaxi: boolean;
  occupancy: BoardingOccupancy;
};

/**
 * Every appointment option on this reservation that applies to `routeDate`,
 * each classified on its own. An overnight stay adds Boarding @ Fitdog Club;
 * a taxi adds its Fitdog home legs.
 */
export function collectReservationRouteOptions(
  reservation: Record<string, unknown>,
  routeDate: string,
  context: { qualifyingServiceOnDate?: boolean; qualifyingServiceDates?: string[] } = {}
): GingrReservationRouteOptions {
  const occupancy = resolveBoardingOccupancy(reservation, routeDate);
  try {
    const reservationId = idText(reservation.reservation_id) ?? idText(reservation.id);
    const stayDay = overnightStayDay(occupancy, routeDate);
    const dateContext = {
      routeDate,
      multiDayStay: isOvernightStay(occupancy),
      occupancy,
      qualifyingServiceOnDate: context.qualifyingServiceOnDate ?? true,
      activityDays: new Set(context.qualifyingServiceDates ?? [])
    };
    const options: GingrAppointmentOption[] = [];
    let taxiBooked = false;

    for (const candidate of collectReservationTransportCandidates(reservation)) {
      for (const part of splitAppointmentOptionParts(candidate.text)) {
        const option = classifyAppointmentOption(part, {
          optionId: candidate.optionId,
          source: "gingr",
          reservationId,
          stayDay
        });
        if (!option) continue;
        const applies = optionAppliesToRouteDate(option, candidate.scheduledDate, dateContext);
        if (applies === false) continue;
        if (option.transportationType === "TAXI") {
          taxiBooked = true;
          continue;
        }
        options.push(typeof applies === "string" ? { ...option, issue: option.issue ?? applies } : option);
      }
    }

    const typeName = reservationTypeLabel(reservation);
    if (occupancy.isOvernight && !options.some((option) => option.phase === "BOARDING")) {
      options.push({
        optionId: null,
        optionName: typeName || "Overnight stay",
        label: "Boarding @ Fitdog Club",
        source: "overnight_stay",
        reservationId,
        phase: "BOARDING",
        phaseInferred: true,
        filter: "BOARDING",
        responsibleParty: "FITDOG",
        action: "NONE",
        location: "FITDOG_CLUB",
        isBoarding: true,
        stayDay,
        transportationType: "BOARDING_CLUB",
        issue: null
      });
    }

    const visit = classifyGingrVisit(typeName);
    const boardingStay = occupancy.isOvernight || options.some((option) => option.isBoarding);
    const taxiRows = listServiceLikeRows(reservation).filter((row) =>
      isTaxiRowForRouteDate(row, routeDate, occupancy)
    );
    const typeIsTaxi = isTaxiTypeName(typeName) && !occupancy.alreadyOnProperty && !boardingStay;
    const legs = new Map<"PICKUP" | "DROPOFF", GingrAppointmentOption>();
    const addLegs = (found: { pickup: boolean; dropoff: boolean }, rowName: string, optionId: string | null) => {
      if (found.pickup && !legs.has("PICKUP")) {
        legs.set("PICKUP", taxiLegOption("PICKUP", rowName, { optionId, reservationId }));
      }
      if (found.dropoff && !legs.has("DROPOFF")) {
        legs.set("DROPOFF", taxiLegOption("DROPOFF", rowName, { optionId, reservationId }));
      }
    };
    if (taxiRows.length) {
      for (const row of taxiRows) {
        const name = String(row.name ?? row.service ?? row.type ?? row.s_name ?? typeName);
        addLegs(
          visitTaxiLegs({
            visit: visit || classifyGingrVisit(name),
            routeDate,
            occupancy,
            taxiText: name,
            scheduledAt: row.scheduled_at ?? row.scheduled_until
          }),
          name,
          idText(row.id)
        );
      }
    } else if (typeIsTaxi) {
      addLegs(visitTaxiLegs({ visit, routeDate, occupancy, taxiText: typeName }), typeName, null);
    }
    options.push(...legs.values());

    return {
      options,
      isTaxi: typeIsTaxi || taxiRows.length > 0 || taxiBooked,
      occupancy
    };
  } catch {
    return { options: [], isTaxi: false, occupancy };
  }
}

/** One entry per distinct option meaning, keeping the first as booked. */
export function dedupeAppointmentOptions(options: GingrAppointmentOption[]): GingrAppointmentOption[] {
  const seen = new Map<string, GingrAppointmentOption>();
  for (const option of options) {
    const key = [
      option.source,
      option.phase,
      option.responsibleParty,
      option.action,
      option.location,
      option.isBoarding ? "boarding" : "",
      option.issue ?? ""
    ].join("|");
    const existing = seen.get(key);
    if (!existing) seen.set(key, option);
    else if (!existing.stayDay && option.stayDay) seen.set(key, { ...existing, stayDay: option.stayDay });
  }
  return Array.from(seen.values());
}

// --- Per-dog transport plan ------------------------------------------------

/** Activity = class / outing / sport (the van carries the dog to it); club_visit = taxi to daycare or boarding. */
export type GingrJourney = "activity" | "club_visit";
export type GingrPickupStopType = "HOME_PICKUP" | "CLUB_PICKUP";
export type GingrDropoffStopType = "HOME_DROPOFF" | "CLUB_DROPOFF";
export type GingrClassificationStatus = "OK" | "NEEDS_REVIEW";

export type GingrTransportEnd = {
  locationType: GingrPlaceType;
  address: string | null;
  /** Who has the dog at this end: the owner handing over / collecting, or Fitdog. */
  responsibleParty: GingrResponsibleParty;
  action: GingrPhysicalAction;
  /** Option or rule that decided this end. */
  basis: string | null;
  transportationType: GingrTransportationType;
};

export type GingrTransportPlan = {
  status: GingrClassificationStatus;
  issues: string[];
  journey: GingrJourney;
  isBoarding: boolean;
  /** Where the dog is when its day with Fitdog transport starts. */
  startingLocation: GingrTransportEnd;
  /** Where the dog ends the day. Decided separately from the start. */
  finalDestination: GingrTransportEnd;
  driverPickupRequired: boolean;
  driverDropoffRequired: boolean;
  pickupStopType: GingrPickupStopType | null;
  dropoffStopType: GingrDropoffStopType | null;
  fitdogTransports: boolean;
  filters: {
    beforePickup: boolean;
    afterDropoff: boolean;
    boarding: boolean;
    ownerManaged: boolean;
  };
};

export const FITDOG_CLUB_ADDRESS = DEFAULT_FITDOG_LOCATIONS.club.address;

const UNKNOWN_END: GingrTransportEnd = {
  locationType: "UNKNOWN",
  address: null,
  responsibleParty: "UNKNOWN",
  action: "UNKNOWN",
  basis: null,
  transportationType: "UNKNOWN"
};

function boardingEnd(): GingrTransportEnd {
  return {
    locationType: "FITDOG_CLUB",
    address: FITDOG_CLUB_ADDRESS,
    responsibleParty: "FITDOG",
    action: "NONE",
    basis: "Boarding @ Fitdog Club",
    transportationType: "BOARDING_CLUB"
  };
}

/**
 * Decide one dog's day from its appointment options:
 *
 * 1. Boarding sets the defaults: the dog starts at Fitdog Club and returns there.
 * 2. A Before option decides the starting location.
 * 3. An After option decides the final destination, so an explicit home
 *    drop-off replaces the boarding return to the Club.
 * 4. Fitdog Club is a place: the owner handing off there is not Fitdog transport.
 * 5. Missing or conflicting options leave that end unknown and flag the dog.
 *
 * Driver stops follow from the two ends: a Fitdog home pick-up / drop-off is a
 * home stop; a dog that starts or ends at the Club on an activity day is a
 * Club stop.
 */
export function resolveGingrTransportPlan(input: {
  journey: GingrJourney;
  options: GingrAppointmentOption[];
  homeAddress: string | null;
  addressStatus: "ok" | "missing" | "incomplete";
}): GingrTransportPlan {
  const { journey, options } = input;
  const issues: string[] = [];
  for (const option of options) {
    if (option.issue && !issues.includes(option.issue)) issues.push(option.issue);
  }

  const isBoarding = options.some((option) => option.isBoarding);

  const endFromOption = (option: GingrAppointmentOption): GingrTransportEnd => ({
    locationType: option.location,
    address:
      option.location === "HOME"
        ? input.homeAddress
        : option.location === "FITDOG_CLUB"
          ? FITDOG_CLUB_ADDRESS
          : null,
    responsibleParty: option.responsibleParty,
    action: option.action,
    basis: option.label,
    transportationType: option.transportationType
  });

  const resolvePhase = (phase: "BEFORE" | "AFTER"): { end: GingrTransportEnd | null; blocked: boolean } => {
    const inPhase = options.filter((option) => option.phase === phase);
    if (inPhase.some((option) => option.issue)) return { end: null, blocked: true };
    const distinct = new Map<string, GingrAppointmentOption>();
    for (const option of inPhase) {
      const key = `${option.location}|${option.responsibleParty}|${option.action}`;
      if (!distinct.has(key)) distinct.set(key, option);
    }
    if (distinct.size > 1) {
      const labels = Array.from(distinct.values()).map((option) => option.label);
      issues.push(
        `${phase === "BEFORE" ? "Before Outing" : "After Outing"} options conflict: ${labels.join(" vs. ")}.`
      );
      return { end: null, blocked: true };
    }
    const only = distinct.values().next().value as GingrAppointmentOption | undefined;
    return { end: only ? endFromOption(only) : null, blocked: false };
  };

  const before = resolvePhase("BEFORE");
  const after = resolvePhase("AFTER");

  let startingLocation: GingrTransportEnd;
  if (before.blocked) {
    startingLocation = UNKNOWN_END;
  } else if (before.end) {
    startingLocation = before.end;
  } else if (isBoarding) {
    startingLocation = boardingEnd();
  } else if (journey === "club_visit") {
    startingLocation = {
      locationType: "FITDOG_CLUB",
      address: FITDOG_CLUB_ADDRESS,
      responsibleParty: "OWNER",
      action: "DROPOFF",
      basis: "No Fitdog pick-up on this visit",
      transportationType: "UNKNOWN"
    };
  } else {
    startingLocation = UNKNOWN_END;
  }

  let finalDestination: GingrTransportEnd;
  if (after.blocked) {
    finalDestination = UNKNOWN_END;
  } else if (after.end) {
    finalDestination = after.end;
  } else if (isBoarding) {
    finalDestination = boardingEnd();
  } else if (journey === "club_visit") {
    finalDestination = {
      locationType: "FITDOG_CLUB",
      address: FITDOG_CLUB_ADDRESS,
      responsibleParty: "OWNER",
      action: "PICKUP",
      basis: "No Fitdog drop-off on this visit",
      transportationType: "UNKNOWN"
    };
  } else {
    finalDestination = UNKNOWN_END;
  }

  if (journey === "activity" && !isBoarding) {
    const noBefore = !before.blocked && !before.end;
    const noAfter = !after.blocked && !after.end;
    if (noBefore && noAfter) {
      issues.push(
        "No Before Outing, After Outing, or Boarding option on this booking, so the starting location and final destination are unknown."
      );
    } else if (noBefore) {
      issues.push("No Before Outing option, so the starting location is unknown.");
    } else if (noAfter) {
      issues.push("No After Outing option, so the final destination is unknown.");
    }
  }

  const pickupStopType: GingrPickupStopType | null =
    startingLocation.locationType === "HOME" && startingLocation.responsibleParty === "FITDOG"
      ? "HOME_PICKUP"
      : startingLocation.locationType === "FITDOG_CLUB" && journey === "activity"
        ? "CLUB_PICKUP"
        : null;
  const dropoffStopType: GingrDropoffStopType | null =
    finalDestination.locationType === "HOME" && finalDestination.responsibleParty === "FITDOG"
      ? "HOME_DROPOFF"
      : finalDestination.locationType === "FITDOG_CLUB" && journey === "activity"
        ? "CLUB_DROPOFF"
        : null;

  if (
    (pickupStopType === "HOME_PICKUP" || dropoffStopType === "HOME_DROPOFF") &&
    (input.addressStatus !== "ok" || !input.homeAddress)
  ) {
    issues.push(
      input.addressStatus === "incomplete"
        ? "Home address is incomplete, so the home stop cannot be routed."
        : "Home address is missing, so the home stop cannot be routed."
    );
  }

  return {
    status: issues.length ? "NEEDS_REVIEW" : "OK",
    issues,
    journey,
    isBoarding,
    startingLocation,
    finalDestination,
    driverPickupRequired: pickupStopType != null,
    driverDropoffRequired: dropoffStopType != null,
    pickupStopType,
    dropoffStopType,
    fitdogTransports: pickupStopType != null || dropoffStopType != null,
    filters: {
      beforePickup: options.some((option) => option.phase === "BEFORE"),
      afterDropoff: options.some((option) => option.phase === "AFTER"),
      boarding: isBoarding,
      ownerManaged: options.some((option) => !option.issue && option.responsibleParty === "OWNER")
    }
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
