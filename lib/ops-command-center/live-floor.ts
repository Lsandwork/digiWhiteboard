import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";

export type FloorCategory = "boarding" | "daycare" | "training" | "grooming" | "outing" | "other";

export type FloorDog = {
  reservationId: string;
  animalId: string;
  dogName: string;
  breed: string | null;
  ownerName: string | null;
  serviceType: string;
  category: FloorCategory;
  startsAt: string | null;
  endsAt: string | null;
  checkedInAt: string | null;
  allergies: string | null;
  medicines: string | null;
  hasNotes: boolean;
};

export type FloorPickup = FloorDog & { minutesLate: number; overstay: boolean };
export type FloorArrival = FloorDog & { minutesLate: number };

export type LiveFloor = {
  businessDate: string;
  tomorrowDate: string;
  syncedAt: string | null;
  stale: boolean;
  error: string | null;
  onSite: FloorDog[];
  onSiteByCategory: Record<FloorCategory, number>;
  pickupsRemaining: FloorPickup[];
  overduePickups: FloorPickup[];
  arrivalsExpected: FloorArrival[];
  lateArrivals: FloorArrival[];
  leftToday: number;
  arrivedToday: number;
  medicalWatch: FloorDog[];
  tomorrow: {
    arrivals: number;
    byCategory: Record<FloorCategory, number>;
    unconfirmed: number;
    boardingArrivals: FloorDog[];
  };
};

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const PICKUP_GRACE_MINUTES = 15;
const ARRIVAL_GRACE_MINUTES = 30;
const EMPTY_WARNING = /^(none|no|na|n\/a|nka|nkda|no allergies|no known allergies|none known|unknown|-|\.)$/i;

let cache: { at: number; businessDate: string; floor: LiveFloor } | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  const out = String(value).trim();
  return out ? out : null;
}

export function pacificDate(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(at);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Gingr stores allergy and medicine fields as HTML, and most dogs say "none" or "n/a". */
export function cleanWarning(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const plain = raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (!plain || EMPTY_WARNING.test(plain.replace(/[.!]+$/, ""))) return null;
  return plain.slice(0, 240);
}

export function floorCategory(serviceType: string | null): FloorCategory {
  const t = (serviceType || "").toLowerCase();
  if (/overnight|board|suite|den/.test(t)) return "boarding";
  if (/daycare|day care|hourly|play/.test(t)) return "daycare";
  if (/train|class|focus|recall/.test(t)) return "training";
  if (/groom|bath|nail/.test(t)) return "grooming";
  if (/hike|excursion|outing|adventure|beach/.test(t)) return "outing";
  return "other";
}

function emptyCategories(): Record<FloorCategory, number> {
  return { boarding: 0, daycare: 0, training: 0, grooming: 0, outing: 0, other: 0 };
}

function dayOf(value: string | null): string | null {
  return value?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function minutesBetween(from: string | null, now: number): number {
  if (!from) return 0;
  const at = Date.parse(from);
  return Number.isNaN(at) ? 0 : Math.floor((now - at) / 60_000);
}

export function mapFloorDog(row: unknown): FloorDog | null {
  const record = asRecord(row);
  if (!record || record.cancelled_date) return null;
  const animal = asRecord(record.animal);
  const owner = asRecord(record.owner);
  const type = asRecord(record.reservation_type);
  const warnings = asRecord(record.warnings);
  const notes = asRecord(record.notes);
  const animalId = text(animal?.id ?? record.animal_id);
  const dogName = text(animal?.name ?? record.animal_name);
  const reservationId = text(record.reservation_id ?? record.id);
  if (!animalId || !dogName || !reservationId) return null;
  const serviceType = text(type?.type ?? type?.name) ?? "Reservation";
  const ownerName = [text(owner?.first_name), text(owner?.last_name)].filter(Boolean).join(" ") || null;
  return {
    reservationId,
    animalId,
    dogName,
    breed: text(animal?.breed),
    ownerName,
    serviceType,
    category: floorCategory(serviceType),
    startsAt: text(record.start_date),
    endsAt: text(record.end_date),
    checkedInAt: text(record.check_in_date),
    allergies: cleanWarning(warnings?.allergies),
    medicines: cleanWarning(warnings?.medicines),
    hasNotes: Boolean(text(notes?.reservation_notes) || text(notes?.animal_notes))
  };
}

function byTime(field: "startsAt" | "endsAt") {
  return (a: FloorDog, b: FloorDog) => String(a[field] ?? "9999").localeCompare(String(b[field] ?? "9999"));
}

function uniqueByReservation<T extends FloorDog>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.reservationId) ? false : (seen.add(row.reservationId), true)));
}

export function buildLiveFloor(input: {
  checkedIn: unknown[];
  today: unknown[];
  tomorrow: unknown[];
  businessDate: string;
  now: number;
  syncedAt?: string | null;
}): LiveFloor {
  const { businessDate, now } = input;
  const tomorrowDate = addDays(businessDate, 1);
  const onSite = uniqueByReservation(
    input.checkedIn
      .map((row) => {
        const record = asRecord(row);
        if (!record || record.check_out_date) return null;
        return mapFloorDog(row);
      })
      .filter((row): row is FloorDog => Boolean(row))
  ).sort((a, b) => a.dogName.localeCompare(b.dogName));

  const onSiteByCategory = emptyCategories();
  for (const dog of onSite) onSiteByCategory[dog.category] += 1;

  const pickups: FloorPickup[] = onSite
    .filter((dog) => {
      const day = dayOf(dog.endsAt);
      return Boolean(day && day <= businessDate);
    })
    .map((dog) => {
      const late = minutesBetween(dog.endsAt, now);
      return { ...dog, minutesLate: late, overstay: (dayOf(dog.endsAt) ?? businessDate) < businessDate };
    })
    .sort(byTime("endsAt"));
  const overduePickups = pickups.filter((dog) => dog.overstay || dog.minutesLate > PICKUP_GRACE_MINUTES);
  const pickupsRemaining = pickups.filter((dog) => !overduePickups.includes(dog));

  const todayRows = input.today.map((row) => ({ row: asRecord(row), dog: mapFloorDog(row) }));
  const startingToday = todayRows.filter((item) => item.dog && dayOf(item.dog.startsAt) === businessDate);
  const onSiteReservations = new Set(onSite.map((dog) => dog.reservationId));
  const arrivals: FloorArrival[] = uniqueByReservation(
    startingToday
      .filter((item) => !item.row?.check_in_date && !onSiteReservations.has(item.dog!.reservationId))
      .map((item) => ({ ...item.dog!, minutesLate: minutesBetween(item.dog!.startsAt, now) }))
  ).sort(byTime("startsAt"));
  const lateArrivals = arrivals.filter((dog) => dog.minutesLate > ARRIVAL_GRACE_MINUTES);
  const arrivalsExpected = arrivals.filter((dog) => !lateArrivals.includes(dog));
  const arrivedToday = startingToday.filter((item) => item.row?.check_in_date).length;
  const leftToday = todayRows.filter(
    (item) => item.row?.check_out_date && dayOf(text(item.row.check_out_date)) === businessDate
  ).length;

  const confirmedTomorrow = new Set<string>();
  const tomorrowDogs = uniqueByReservation(
    input.tomorrow
      .map((row) => {
        const dog = mapFloorDog(row);
        if (!dog || dayOf(dog.startsAt) !== tomorrowDate) return null;
        if (asRecord(row)?.confirmed_date) confirmedTomorrow.add(dog.reservationId);
        return dog;
      })
      .filter((dog): dog is FloorDog => Boolean(dog))
  );
  const tomorrowByCategory = emptyCategories();
  for (const dog of tomorrowDogs) tomorrowByCategory[dog.category] += 1;

  return {
    businessDate,
    tomorrowDate,
    syncedAt: input.syncedAt ?? new Date(now).toISOString(),
    stale: false,
    error: null,
    onSite,
    onSiteByCategory,
    pickupsRemaining,
    overduePickups,
    arrivalsExpected,
    lateArrivals,
    leftToday,
    arrivedToday,
    medicalWatch: onSite.filter((dog) => dog.allergies || dog.medicines),
    tomorrow: {
      arrivals: tomorrowDogs.length,
      byCategory: tomorrowByCategory,
      unconfirmed: tomorrowDogs.filter((dog) => !confirmedTomorrow.has(dog.reservationId)).length,
      boardingArrivals: tomorrowDogs.filter((dog) => dog.category === "boarding").sort(byTime("startsAt"))
    }
  };
}

async function postReservations(fields: Record<string, string>): Promise<unknown[]> {
  const client = createGingrClient();
  if (!client.config.apiKey) throw new Error("GINGR_API_KEY is not configured on this environment.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${client.config.baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body: new URLSearchParams({ key: client.config.apiKey, location_id: client.config.locationId, ...fields }),
      cache: "no-store",
      signal: controller.signal
    });
    if (response.status === 429) throw new Error("Gingr rate limited the request. Try again shortly.");
    if (!response.ok) throw new Error(`Gingr reservations returned ${response.status}.`);
    return normalizeGingrReservationList(await response.json()) as unknown[];
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      throw new Error(`Gingr did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadLiveFloor(options?: { force?: boolean }): Promise<LiveFloor> {
  const businessDate = pacificDate();
  if (!options?.force && cache && cache.businessDate === businessDate && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.floor;
  }
  try {
    const tomorrowDate = addDays(businessDate, 1);
    const [checkedIn, today, tomorrow] = await Promise.all([
      postReservations({ checked_in: "true" }),
      postReservations({ checked_in: "false", start_date: businessDate, end_date: businessDate }),
      postReservations({ checked_in: "false", start_date: tomorrowDate, end_date: tomorrowDate })
    ]);
    const now = Date.now();
    const floor = buildLiveFloor({ checkedIn, today, tomorrow, businessDate, now });
    cache = { at: now, businessDate, floor };
    return floor;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gingr could not be reached.";
    if (cache && cache.businessDate === businessDate) {
      return { ...cache.floor, stale: true, error: message };
    }
    return {
      ...buildLiveFloor({ checkedIn: [], today: [], tomorrow: [], businessDate, now: Date.now(), syncedAt: null }),
      syncedAt: null,
      stale: true,
      error: message
    };
  }
}
