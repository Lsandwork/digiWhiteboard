import { createGingrClient, unwrapGingrData } from "@/lib/integrations/gingr/client";
import type { GingrAnimal, GingrReservation } from "@/lib/integrations/gingr/types";
import { fetchCurrentlyCheckedInDogsRobust, todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  additionalServicesFromReservation,
  type GingrAdditionalService
} from "@/lib/ops-command-center/groomer-additional-services";
import { isDeskMyShiftFacilityService } from "@/lib/ops-command-center/gingr-service-names";
import type { OpsWorkItem } from "@/lib/ops-command-center/adapters/staff-ops-feed";

export const MY_SHIFT_FACILITY_SYNC_START_HOUR = 6;
export const MY_SHIFT_FACILITY_SYNC_END_HOUR = 19;
export const MY_SHIFT_FACILITY_TIMEZONE = "America/Los_Angeles";

export type FacilityBirthdayPresence = "checked_in" | "scheduled";

export type FacilityBirthdayDog = {
  id: string;
  animalId: string;
  dogName: string;
  ownerName: string | null;
  birthdate: string;
  age: number | null;
  presence: FacilityBirthdayPresence;
  reservationId: string | null;
};

export type MyShiftFacilityFeed = {
  date: string;
  services: GingrAdditionalService[];
  birthdays: FacilityBirthdayDog[];
  syncedAt: string | null;
};

const EMPTY_FEED: MyShiftFacilityFeed = {
  date: "",
  services: [],
  birthdays: [],
  syncedAt: null
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function losAngelesHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MY_SHIFT_FACILITY_TIMEZONE,
    hour: "numeric",
    hourCycle: "h23"
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  return hour === 24 ? 0 : hour;
}

/** Hourly Gingr refresh window: 6:00am–7:00pm Pacific, 7 days a week. */
export function isMyShiftFacilitySyncWindow(now = new Date()): boolean {
  const hour = losAngelesHour(now);
  return hour >= MY_SHIFT_FACILITY_SYNC_START_HOUR && hour <= MY_SHIFT_FACILITY_SYNC_END_HOUR;
}

export function parseGingrBirthdate(value?: unknown): string | null {
  const text = pickString(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return null;
}

export function birthdateFromAnimalRecord(record?: Record<string, unknown> | null): string | null {
  if (!record) return null;
  return parseGingrBirthdate(
    record.birthdate ??
      record.birthday ??
      record.date_of_birth ??
      record.dob ??
      record.birth_date ??
      record.a_birthday ??
      record.a_birthdate ??
      record.a_dob
  );
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isBirthdayOnDate(birthdate?: string | null, dateYmd?: string | null): boolean {
  const bd = parseGingrBirthdate(birthdate);
  const date = String(dateYmd || "");
  if (!bd || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [, birthMonth, birthDay] = bd.split("-");
  const [year, month, day] = date.split("-");
  if (birthMonth === month && birthDay === day) return true;
  return (
    birthMonth === "02" &&
    birthDay === "29" &&
    month === "02" &&
    day === "28" &&
    !isLeapYear(Number(year))
  );
}

export function ageOnDate(birthdate?: string | null, dateYmd?: string | null): number | null {
  const bd = parseGingrBirthdate(birthdate);
  const date = String(dateYmd || "");
  if (!bd || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [birthYear, birthMonth, birthDay] = bd.split("-").map(Number);
  const [year, month, day] = date.split("-").map(Number);
  let age = year - birthYear;
  const observedToday = birthMonth === month && birthDay === day;
  const leapObserved = birthMonth === 2 && birthDay === 29 && month === 2 && day === 28 && !isLeapYear(year);
  if (!observedToday && !leapObserved && (month < birthMonth || (month === birthMonth && day < birthDay))) age -= 1;
  return age >= 0 ? age : null;
}

function reservationCancelled(reservation: GingrReservation) {
  const record = reservation as Record<string, unknown>;
  if (record.cancelled_date || record.cancelled_at || record.cancelled) return true;
  const status = pickString(record.status, record.state)?.toLowerCase() || "";
  return status.includes("cancel") || status.includes("void");
}

function animalIdFromReservation(reservation: GingrReservation): string | null {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  const animalField = reservation.animal ?? reservation.pet ?? reservation.dog;
  return pickString(
    animal.id,
    reservation.animal_id,
    reservation.a_id,
    typeof animalField === "string" || typeof animalField === "number" ? animalField : null
  );
}

function dogNameFromReservation(reservation: GingrReservation): string | null {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  return pickString(
    animal.name,
    animal.first_name,
    reservation.animal_name,
    reservation.pet_name,
    reservation.dog_name
  );
}

function ownerNameFromReservation(reservation: GingrReservation): string | null {
  const owner = asRecord(reservation.owner || reservation.client || reservation.customer);
  return pickString(
    owner.full_name,
    [pickString(owner.first_name, owner.o_first), pickString(owner.last_name, owner.o_last)].filter(Boolean).join(" "),
    reservation.owner_name,
    reservation.client_name
  );
}

function birthdateFromReservation(reservation: GingrReservation): string | null {
  const animal = asRecord(reservation.animal || reservation.pet || reservation.dog);
  return (
    birthdateFromAnimalRecord(animal) ||
    parseGingrBirthdate(reservation.animal_birthdate || reservation.birthday || reservation.birthdate)
  );
}

function normalizeGingrAnimal(payload: unknown, animalId?: string): GingrAnimal | null {
  let data: unknown = payload;
  try {
    data = unwrapGingrData(payload);
  } catch {
    data = payload;
  }
  if (!data) return null;
  if (Array.isArray(data)) {
    const rows = data as GingrAnimal[];
    if (animalId) {
      return rows.find((row) => String(row.id) === String(animalId)) || rows[0] || null;
    }
    return rows[0] || null;
  }
  if (typeof data === "object") {
    const rec = data as Record<string, unknown>;
    if (rec.id || rec.name || rec.birthdate || rec.birthday || rec.dob) return rec as GingrAnimal;
    if (animalId && rec[String(animalId)] && typeof rec[String(animalId)] === "object") {
      return rec[String(animalId)] as GingrAnimal;
    }
    const nested = Object.values(rec).find((value) => value && typeof value === "object" && !Array.isArray(value));
    return nested ? (nested as GingrAnimal) : null;
  }
  return null;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function facilityFeedToWorkItems(feed: MyShiftFacilityFeed): OpsWorkItem[] {
  const birthdays: OpsWorkItem[] = feed.birthdays.map((row) => ({
    id: `birthday:${row.animalId}`,
    kind: "birthday",
    title: `Birthday today · ${row.dogName}`,
    detail: [
      row.age != null ? `Turns ${row.age}` : null,
      row.ownerName,
      row.presence === "checked_in" ? "Checked in" : "Scheduled today",
      row.birthdate
    ]
      .filter(Boolean)
      .join(" · ") || null,
    priority: "high",
    statusLabel: "Birthday",
    dueAt: null,
    dogName: row.dogName,
    ownerName: row.ownerName,
    hrefTab: "my_shift",
    completable: false
  }));

  const services: OpsWorkItem[] = feed.services.map((row) => ({
    id: row.id.startsWith("facility:") ? row.id : `facility:${row.id}`,
    kind: "facility_service",
    title: row.serviceName,
    detail: [row.dogName, row.ownerName, row.scheduledAt, row.reservationType].filter(Boolean).join(" · ") || null,
    priority: "attention",
    statusLabel: "Facility calendar",
    dueAt: row.scheduledAt,
    dogName: row.dogName,
    ownerName: row.ownerName,
    hrefTab: "my_shift",
    completable: false
  }));

  return [...birthdays, ...services];
}

export async function loadCachedMyShiftFacilityFeed(now = new Date()): Promise<MyShiftFacilityFeed> {
  const date = todayInLosAngeles(now);
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ops_my_shift_facility_feed")
      .select("feed_date, services, birthdays, synced_at")
      .eq("feed_date", date)
      .maybeSingle();
    if (error || !data) return { ...EMPTY_FEED, date };
    return {
      date: String(data.feed_date || date),
      services: Array.isArray(data.services) ? (data.services as GingrAdditionalService[]) : [],
      birthdays: Array.isArray(data.birthdays) ? (data.birthdays as FacilityBirthdayDog[]) : [],
      syncedAt: data.synced_at ? String(data.synced_at) : null
    };
  } catch {
    return { ...EMPTY_FEED, date };
  }
}

export async function syncMyShiftFacilityFeed(options?: {
  now?: Date;
  force?: boolean;
}): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  date: string;
  serviceCount: number;
  birthdayCount: number;
  animalLookups: number;
  error?: string;
}> {
  const now = options?.now ?? new Date();
  const date = todayInLosAngeles(now);
  if (!options?.force && !isMyShiftFacilitySyncWindow(now)) {
    return {
      ok: true,
      skipped: true,
      reason: "outside_6am_7pm_pacific",
      date,
      serviceCount: 0,
      birthdayCount: 0,
      animalLookups: 0
    };
  }

  const gingr = createGingrClient();
  const supabase = getServiceSupabase();

  const [reservations, checkedIn] = await Promise.all([
    gingr.listReservationsByDate(date).catch(() => [] as GingrReservation[]),
    fetchCurrentlyCheckedInDogsRobust({ now }).catch(() => ({ dogs: [] as Array<{ animalId: string; dogName: string; ownerName: string | null; reservationId: string | null }> }))
  ]);

  const activeReservations = reservations.filter((reservation) => !reservationCancelled(reservation));
  const services = activeReservations
    .flatMap((reservation) =>
      additionalServicesFromReservation(reservation, date, { includeService: isDeskMyShiftFacilityService })
    )
    .sort(
      (a, b) =>
        String(a.scheduledAt || "").localeCompare(String(b.scheduledAt || "")) || a.serviceName.localeCompare(b.serviceName)
    )
    .slice(0, 150);

  type AnimalCandidate = {
    animalId: string;
    dogName: string;
    ownerName: string | null;
    reservationId: string | null;
    presence: FacilityBirthdayPresence;
    birthdate: string | null;
  };

  const candidates = new Map<string, AnimalCandidate>();
  for (const reservation of activeReservations) {
    const animalId = animalIdFromReservation(reservation);
    const dogName = dogNameFromReservation(reservation);
    if (!animalId || !dogName) continue;
    const existing = candidates.get(animalId);
    candidates.set(animalId, {
      animalId,
      dogName: existing?.dogName || dogName,
      ownerName: existing?.ownerName || ownerNameFromReservation(reservation),
      reservationId: existing?.reservationId || pickString(reservation.reservation_id, reservation.id),
      presence: existing?.presence || "scheduled",
      birthdate: existing?.birthdate || birthdateFromReservation(reservation)
    });
  }
  for (const dog of checkedIn.dogs) {
    const animalId = String(dog.animalId || "").trim();
    if (!animalId) continue;
    const existing = candidates.get(animalId);
    candidates.set(animalId, {
      animalId,
      dogName: existing?.dogName || dog.dogName,
      ownerName: existing?.ownerName || dog.ownerName,
      reservationId: existing?.reservationId || dog.reservationId,
      presence: "checked_in",
      birthdate: existing?.birthdate || null
    });
  }

  const missingIds = [...candidates.values()].filter((row) => !row.birthdate).map((row) => row.animalId);
  if (missingIds.length) {
    const { data: cachedBirthdays } = await supabase
      .from("ops_gingr_animal_birthdates")
      .select("gingr_animal_id, birthdate")
      .in("gingr_animal_id", missingIds);
    for (const row of cachedBirthdays || []) {
      const animalId = String(row.gingr_animal_id || "");
      const birthdate = parseGingrBirthdate(row.birthdate);
      const candidate = candidates.get(animalId);
      if (candidate && birthdate) candidate.birthdate = birthdate;
    }
  }

  const stillMissing = [...candidates.values()].filter((row) => !row.birthdate);
  let animalLookups = 0;
  await mapWithConcurrency(stillMissing, 4, async (candidate) => {
    try {
      animalLookups += 1;
      const payload = await gingr.getAnimal(candidate.animalId);
      const animal = normalizeGingrAnimal(payload, candidate.animalId);
      const birthdate = birthdateFromAnimalRecord(animal as Record<string, unknown> | null);
      if (birthdate) {
        candidate.birthdate = birthdate;
        await supabase.from("ops_gingr_animal_birthdates").upsert(
          {
            gingr_animal_id: candidate.animalId,
            birthdate,
            dog_name: candidate.dogName,
            owner_name: candidate.ownerName,
            updated_at: new Date().toISOString()
          },
          { onConflict: "gingr_animal_id" }
        );
      }
    } catch {
      // Keep going — missing DOB just omits that dog from birthday list.
    }
  });

  const birthdays: FacilityBirthdayDog[] = [...candidates.values()]
    .filter((row) => row.birthdate && isBirthdayOnDate(row.birthdate, date))
    .map((row) => ({
      id: `birthday:${row.animalId}`,
      animalId: row.animalId,
      dogName: row.dogName,
      ownerName: row.ownerName,
      birthdate: row.birthdate as string,
      age: ageOnDate(row.birthdate, date),
      presence: row.presence,
      reservationId: row.reservationId
    }))
    .sort((a, b) => a.dogName.localeCompare(b.dogName));

  const syncedAt = new Date().toISOString();
  const { error } = await supabase.from("ops_my_shift_facility_feed").upsert(
    {
      feed_date: date,
      services,
      birthdays,
      synced_at: syncedAt,
      error: null,
      updated_at: syncedAt
    },
    { onConflict: "feed_date" }
  );

  if (error) {
    return {
      ok: false,
      date,
      serviceCount: services.length,
      birthdayCount: birthdays.length,
      animalLookups,
      error: error.message
    };
  }

  return {
    ok: true,
    date,
    serviceCount: services.length,
    birthdayCount: birthdays.length,
    animalLookups
  };
}
