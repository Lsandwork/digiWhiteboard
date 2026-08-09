import type { NormalizedReportItem } from "@/lib/route-generator/parser";
import type { CanonicalService } from "@/lib/route-generator/flags";
import { isFacilityHouseholdKey } from "@/lib/route-generator/facility";
import type { HouseholdStopGroup } from "@/lib/route-generator/households";
import { civilTimeToUtcMs } from "@/lib/route-generator/samsara-csv";

/** Parse "HH:MM" / "H:MM" / "HH:MM:SS" → minutes from midnight. */
export function parseHhMmToMinutes(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatMinutesAsHhMm(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Round minutes down to a 30-minute band for grouping. */
export function floorToHalfHour(minutes: number): number {
  return Math.floor(minutes / 30) * 30;
}

export function windowBandKey(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startMin = parseHhMmToMinutes(start);
  const endMin = parseHhMmToMinutes(end);
  if (startMin == null && endMin == null) return "open";
  const a = floorToHalfHour(startMin ?? (endMin != null ? endMin - 60 : 7 * 60));
  const b = floorToHalfHour(endMin ?? (startMin != null ? startMin + 120 : 9 * 60));
  return `${formatMinutesAsHhMm(a)}-${formatMinutesAsHhMm(Math.max(a + 30, b))}`;
}

export function serviceSlug(service: string | null | undefined): string {
  const cleaned = String(service || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

/**
 * Home stops must not merge Adventure 7–9am with Group Class noon (or other window bands).
 * Facility keys are already service-split elsewhere.
 */
export function timingHouseholdSuffix(item: Pick<
  NormalizedReportItem,
  "serviceCanonical" | "serviceRaw" | "timeWindowStart" | "timeWindowEnd"
>): string {
  const service = serviceSlug(item.serviceCanonical || item.serviceRaw);
  const band = windowBandKey(item.timeWindowStart, item.timeWindowEnd);
  return `${service}|${band}`;
}

/** Attach service+window to household keys so mixed-class addresses become separate stops. */
export function splitItemsByServiceAndWindow(items: NormalizedReportItem[]): NormalizedReportItem[] {
  return items.map((item) => {
    const baseKey = item.householdKey || item.addressRaw || item.reservationId || item.dogName || "stop";
    const suffix = timingHouseholdSuffix(item);
    // Avoid double-suffix if already applied.
    if (String(baseKey).includes(`::${suffix}`) || String(baseKey).endsWith(`|${suffix}`)) return item;
    if (isFacilityHouseholdKey(baseKey)) {
      // facility:club:adventure-hike|adventure-hike|07:00-09:00
      return { ...item, householdKey: `${baseKey}|${suffix}` };
    }
    return {
      ...item,
      householdKey: `${baseKey}::${suffix}`
    };
  });
}

/** Civil HH:MM on an operating date → UTC ISO for timestamptz columns. */
export function hhMmOnOperatingDateToIso(
  operatingDate: string,
  hhmm: string | null | undefined
): string | null {
  const mins = parseHhMmToMinutes(hhmm);
  const date = String(operatingDate || "").slice(0, 10);
  if (mins == null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const local = `${date}T${formatMinutesAsHhMm(mins)}:00`;
  return new Date(civilTimeToUtcMs(local, "America/Los_Angeles")).toISOString();
}

/** Reload HH:MM from timestamptz ISO, Date, or raw "HH:MM". */
export function extractHhMmFromStored(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const bare = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (bare) {
    const mins = Number(bare[1]) * 60 + Number(bare[2]);
    if (!Number.isFinite(mins)) return null;
    return formatMinutesAsHhMm(mins);
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  // Intl may emit "24" for midnight in some engines — normalize.
  const normalizedHour = hour === 24 ? 0 : hour;
  return formatMinutesAsHhMm(normalizedHour * 60 + minute);
}

export function windowsOverlap(
  aStart: string | null | undefined,
  aEnd: string | null | undefined,
  bStart: string | null | undefined,
  bEnd: string | null | undefined
): boolean {
  const a0 = parseHhMmToMinutes(aStart);
  const a1 = parseHhMmToMinutes(aEnd);
  const b0 = parseHhMmToMinutes(bStart);
  const b1 = parseHhMmToMinutes(bEnd);
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return a0 < b1 && b0 < a1;
}

export type SharedDogTimingConflict = {
  dogId: string;
  dogName: string | null;
  message: string;
  reservationIds: string[];
};

/**
 * Same dog booked on overlapping class windows (or pickup of class B before dropoff of class A)
 * cannot be on two routes at once — surface for management review.
 */
export function detectSharedDogTimingConflicts(items: NormalizedReportItem[]): SharedDogTimingConflict[] {
  const byDog = new Map<string, NormalizedReportItem[]>();
  for (const item of items) {
    const dogId = String(item.dogId || "").trim();
    if (!dogId) continue;
    const list = byDog.get(dogId) ?? [];
    list.push(item);
    byDog.set(dogId, list);
  }

  const conflicts: SharedDogTimingConflict[] = [];
  for (const [dogId, rows] of byDog) {
    if (rows.length < 2) continue;
    const dogName = rows.find((row) => row.dogName)?.dogName ?? null;

    // Same-direction overlapping windows (two pickups / two dropoffs at once).
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i]!;
        const b = rows[j]!;
        if (a.direction !== b.direction) continue;
        if (!windowsOverlap(a.timeWindowStart, a.timeWindowEnd, b.timeWindowStart, b.timeWindowEnd)) {
          continue;
        }
        conflicts.push({
          dogId,
          dogName,
          reservationIds: [a.reservationId, b.reservationId].filter(Boolean) as string[],
          message: `${dogName || "Dog"} has overlapping ${a.direction} windows for ${a.serviceCanonical || a.serviceRaw || "class A"} (${a.timeWindowStart || "?"}-${a.timeWindowEnd || "?"}) and ${b.serviceCanonical || b.serviceRaw || "class B"} (${b.timeWindowStart || "?"}-${b.timeWindowEnd || "?"}).`
        });
      }
    }

    // Cross-class: pickup window for class B overlaps dropoff window for class A.
    const pickups = rows.filter((row) => row.direction === "pickup");
    const dropoffs = rows.filter((row) => row.direction === "dropoff");
    for (const pickup of pickups) {
      for (const dropoff of dropoffs) {
        if (pickup.reservationId && dropoff.reservationId && pickup.reservationId === dropoff.reservationId) {
          continue;
        }
        if (
          !windowsOverlap(
            pickup.timeWindowStart,
            pickup.timeWindowEnd,
            dropoff.timeWindowStart,
            dropoff.timeWindowEnd
          )
        ) {
          continue;
        }
        conflicts.push({
          dogId,
          dogName,
          reservationIds: [pickup.reservationId, dropoff.reservationId].filter(Boolean) as string[],
          message: `${dogName || "Dog"} pickup for ${pickup.serviceCanonical || pickup.serviceRaw || "class"} (${pickup.timeWindowStart || "?"}-${pickup.timeWindowEnd || "?"}) overlaps dropoff for ${dropoff.serviceCanonical || dropoff.serviceRaw || "other class"} (${dropoff.timeWindowStart || "?"}-${dropoff.timeWindowEnd || "?"}).`
        });
      }
    }
  }

  // De-dupe by message
  const seen = new Set<string>();
  return conflicts.filter((row) => {
    if (seen.has(row.message)) return false;
    seen.add(row.message);
    return true;
  });
}

export function groupWindowBounds(group: HouseholdStopGroup): {
  startMin: number | null;
  endMin: number | null;
  start: string | null;
  end: string | null;
} {
  let startMin: number | null = null;
  let endMin: number | null = null;
  for (const item of group.items) {
    const s = parseHhMmToMinutes(item.timeWindowStart);
    const e = parseHhMmToMinutes(item.timeWindowEnd);
    if (s != null) startMin = startMin == null ? s : Math.min(startMin, s);
    if (e != null) endMin = endMin == null ? e : Math.max(endMin, e);
  }
  return {
    startMin,
    endMin,
    start: startMin != null ? formatMinutesAsHhMm(startMin) : null,
    end: endMin != null ? formatMinutesAsHhMm(endMin) : null
  };
}

/** Pickup: hit earliest deadlines first. Dropoff: earliest window starts first. */
export function groupTimelinessSortKey(group: HouseholdStopGroup, direction: "pickup" | "dropoff"): number {
  const bounds = groupWindowBounds(group);
  if (direction === "pickup") {
    return bounds.endMin ?? bounds.startMin ?? 24 * 60;
  }
  return bounds.startMin ?? bounds.endMin ?? 0;
}

export function windowCompatibilityPenalty(
  existing: HouseholdStopGroup[],
  candidate: HouseholdStopGroup,
  direction: "pickup" | "dropoff"
): number {
  if (!existing.length) return 0;
  const cand = groupWindowBounds(candidate);
  if (cand.startMin == null && cand.endMin == null) return 8;

  let penalty = 0;
  for (const stop of existing) {
    const other = groupWindowBounds(stop);
    if (other.startMin == null && other.endMin == null) continue;
    if (
      windowsOverlap(
        cand.start ?? null,
        cand.end ?? null,
        other.start ?? null,
        other.end ?? null
      )
    ) {
      // Overlapping windows on same van are OK if sequenced carefully — small penalty.
      penalty += 2;
      continue;
    }
    if (direction === "pickup" && cand.endMin != null && other.endMin != null) {
      // Prefer vans already working the same deadline band.
      penalty += Math.min(40, Math.abs(cand.endMin - other.endMin) / 3);
    } else if (direction === "dropoff" && cand.startMin != null && other.startMin != null) {
      penalty += Math.min(40, Math.abs(cand.startMin - other.startMin) / 3);
    }
  }
  return penalty;
}

/**
 * Same dog already on this van for another reservation → prefer keeping sequential legs together
 * only when windows do not clash (bonus). Overlapping same-dog windows are a hard clash penalty.
 */
export function sharedDogAffinityBonus(
  existing: HouseholdStopGroup[],
  candidate: HouseholdStopGroup
): number {
  const existingItems = existing.flatMap((stop) => stop.items);
  if (!existingItems.length) return 0;
  let hits = 0;
  for (const item of candidate.items) {
    const dogId = String(item.dogId || "").trim();
    if (!dogId) continue;
    const prior = existingItems.filter((row) => String(row.dogId || "").trim() === dogId);
    if (!prior.length) continue;
    const clashes = prior.some((row) =>
      windowsOverlap(item.timeWindowStart, item.timeWindowEnd, row.timeWindowStart, row.timeWindowEnd)
    );
    if (clashes) continue;
    hits += 1;
  }
  return hits * 18;
}

/** Same dog with overlapping class windows on one van is infeasible — force another van. */
export function sharedDogTimingClashPenalty(
  existing: HouseholdStopGroup[],
  candidate: HouseholdStopGroup
): number {
  const existingItems = existing.flatMap((stop) => stop.items);
  if (!existingItems.length) return 0;
  for (const item of candidate.items) {
    const dogId = String(item.dogId || "").trim();
    if (!dogId) continue;
    for (const row of existingItems) {
      if (String(row.dogId || "").trim() !== dogId) continue;
      if (
        windowsOverlap(item.timeWindowStart, item.timeWindowEnd, row.timeWindowStart, row.timeWindowEnd)
      ) {
        return 500;
      }
    }
  }
  return 0;
}

type StopCoord = { lat: number; lng: number };

function haversineMiles(a: StopCoord, b: StopCoord) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Time-aware stop order: greedy by earliest deadline (pickup) / earliest start (dropoff),
 * breaking ties with proximity to current position.
 */
export function orderStopsForTimeliness<T extends HouseholdStopGroup & { coord: StopCoord | null }>(
  stops: T[],
  depot: StopCoord | null,
  direction: "pickup" | "dropoff",
  rng: () => number
): T[] {
  const remaining = [...stops];
  const ordered: T[] = [];
  let current = depot;
  let currentMinutes =
    direction === "pickup" ? 7 * 60 : direction === "dropoff" ? 10 * 60 + 30 : 8 * 60;

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const stop = remaining[i]!;
      const bounds = groupWindowBounds(stop);
      const deadline =
        direction === "pickup"
          ? (bounds.endMin ?? bounds.startMin ?? 24 * 60)
          : (bounds.startMin ?? bounds.endMin ?? 0);
      const dist = current && stop.coord ? haversineMiles(current, stop.coord) : 40 + rng() * 5;
      const driveMinutes = dist * 3.2;
      const arrive = currentMinutes + driveMinutes;
      // Soft lateness: miss pickup deadline, or arrive after dropoff window closes.
      let lateness = 0;
      if (direction === "pickup" && bounds.endMin != null) {
        lateness = Math.max(0, arrive - bounds.endMin);
      } else if (direction === "dropoff") {
        const dropDeadline = bounds.endMin ?? (bounds.startMin != null ? bounds.startMin + 90 : null);
        if (dropDeadline != null) lateness = Math.max(0, arrive - dropDeadline);
        // Prefer not arriving long before the window opens (idle / early).
        if (bounds.startMin != null && arrive + 5 < bounds.startMin) {
          lateness += Math.min(30, (bounds.startMin - arrive) / 4);
        }
      }
      // Primary: deadline urgency, then lateness, then distance.
      const score = deadline * 10 + lateness * 25 + dist + rng() * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const next = remaining.splice(bestIndex, 1)[0]!;
    ordered.push(next);
    const dist = current && next.coord ? haversineMiles(current, next.coord) : 8;
    currentMinutes += dist * 3.2 + 5;
    current = next.coord ?? current;
  }
  return ordered;
}

export type StopEtaEstimate = {
  arrivalIso: string;
  departureIso: string;
  requestedWindowStart: string | null;
  requestedWindowEnd: string | null;
};

/** Persistable ETAs from window-aware sequencing (America/Los_Angeles civil times → ISO). */
export function estimateCustomerStopEtas(params: {
  ordered: HouseholdStopGroup[];
  direction: "pickup" | "dropoff";
  operatingDate: string;
  vanKey?: string | null;
  coordsByHousehold?: Record<string, StopCoord>;
  startCoord?: StopCoord | null;
}): StopEtaEstimate[] {
  const minutesPerStop = 8;
  let cursorMin =
    params.direction === "pickup"
      ? 7 * 60
      : String(params.vanKey || "").includes("5") || String(params.vanKey || "").includes("6")
        ? 12 * 60
        : 10 * 60 + 30;

  // Seed cursor from earliest window on the route when available.
  const firstBounds = params.ordered[0] ? groupWindowBounds(params.ordered[0]) : null;
  if (params.direction === "pickup" && firstBounds?.startMin != null) {
    cursorMin = Math.min(cursorMin, firstBounds.startMin);
  }
  if (params.direction === "dropoff" && firstBounds?.startMin != null) {
    cursorMin = firstBounds.startMin;
  }

  let prev = params.startCoord ?? null;
  const out: StopEtaEstimate[] = [];
  for (const stop of params.ordered) {
    const bounds = groupWindowBounds(stop);
    const coord = params.coordsByHousehold?.[stop.householdKey] ?? null;
    if (prev && coord) {
      cursorMin += haversineMiles(prev, coord) * 3.2;
    } else {
      cursorMin += minutesPerStop;
    }
    // Don't arrive before window opens when known.
    if (bounds.startMin != null) cursorMin = Math.max(cursorMin, bounds.startMin);
    const arriveMin = cursorMin;
    const departMin = arriveMin + 5;
    cursorMin = departMin;
    prev = coord ?? prev;

    const arrivalLocal = `${params.operatingDate}T${formatMinutesAsHhMm(arriveMin)}:00`;
    const departureLocal = `${params.operatingDate}T${formatMinutesAsHhMm(departMin)}:00`;
    out.push({
      arrivalIso: new Date(civilTimeToUtcMs(arrivalLocal, "America/Los_Angeles")).toISOString(),
      departureIso: new Date(civilTimeToUtcMs(departureLocal, "America/Los_Angeles")).toISOString(),
      requestedWindowStart: bounds.start,
      requestedWindowEnd: bounds.end
    });
  }
  return out;
}

export function primaryService(group: HouseholdStopGroup): CanonicalService | string | null {
  return group.items.find((item) => item.serviceCanonical)?.serviceCanonical ?? group.items[0]?.serviceRaw ?? null;
}
