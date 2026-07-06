import { normalizeBoardDog, type BoardDogSource } from "@/lib/board-dog";
import { extractPhotoUrl } from "@/lib/board-utils";
import { loadStoredAnimalPhotoMap } from "@/lib/animal-photo-store";
import type { GingrBackOfHouseRecord } from "@/lib/gingr-board-sync";
import { getCachedBackOfHouseBoard } from "@/lib/gingr-request-guard";
import type { LiveDog } from "@/lib/types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export type GroomingPushDogStatus = "checked_in" | "reservation" | "appointment" | "grooming_appointment";

export type GroomingPushDogGroup =
  | "checked_in"
  | "grooming_appointments"
  | "reservations"
  | "other_appointments";

export type GroomingPushActiveDog = {
  dogId: string;
  dogName: string;
  ownerName?: string;
  dogPhotoUrl?: string;
  status: GroomingPushDogStatus;
  displayStatus: string;
  group: GroomingPushDogGroup;
  reservationId?: string;
  appointmentId?: string;
  checkedInAt?: string;
  appointmentTime?: string;
  reservationType?: string;
  gingrAnimalId?: string;
};

type MutableDog = GroomingPushActiveDog & {
  checkedIn: boolean;
  grooming: boolean;
  reservation: boolean;
  appointment: boolean;
};

const GROUP_SORT: Record<GroomingPushDogGroup, number> = {
  checked_in: 0,
  grooming_appointments: 1,
  reservations: 2,
  other_appointments: 3
};

const STATUS_SORT: Record<GroomingPushDogStatus, number> = {
  checked_in: 0,
  grooming_appointment: 1,
  reservation: 2,
  appointment: 3
};

function isActiveCheckinRecord(record: GingrBackOfHouseRecord) {
  const status = record.status_string?.trim().toLowerCase();
  return Boolean(record.check_in_stamp) || status === "checked in" || status === "checked_in";
}

function isGroomingType(value: string | null | undefined) {
  const token = String(value ?? "").toLowerCase();
  return token.includes("groom");
}

function isBoardingType(value: string | null | undefined) {
  const token = String(value ?? "").toLowerCase();
  return token.includes("board") || token.includes("overnight");
}

function isDaycareType(value: string | null | undefined) {
  const token = String(value ?? "").toLowerCase();
  return token.includes("daycare") || token.includes("day care");
}

function reservationCategoryLabel(type: string | null | undefined) {
  if (isGroomingType(type)) return "Grooming Appointment";
  if (isBoardingType(type)) return "Boarding";
  if (isDaycareType(type)) return "Daycare";
  if (type?.trim()) return type.trim();
  return "Reservation";
}

function parseGingrDate(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const trimmed = String(value).trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalDay(date: Date, now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(date) === fmt.format(now);
}

function isRecordRelevantToday(record: GingrBackOfHouseRecord, now: Date, timeZone: string) {
  const candidates = [record.start_date, record.check_in_stamp, record.event_time].map(parseGingrDate).filter(Boolean) as Date[];
  if (!candidates.length) return true;
  return candidates.some((date) => isSameLocalDay(date, now, timeZone));
}

function buildOwnerNameFromRecord(record: GingrBackOfHouseRecord) {
  const parts = [record.o_first, record.o_last].map((part) => String(part ?? "").trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return parts[0] ?? null;
}

function buildDogNameFromRecord(record: GingrBackOfHouseRecord) {
  const normalized = normalizeBoardDog({
    record,
    reservation_id: record.id,
    animal_id: record.animal_id
  } as BoardDogSource);
  return normalized.animal_name;
}

function photoFromRecord(record: GingrBackOfHouseRecord) {
  return record.photo_url ?? extractPhotoUrl(record as Record<string, unknown>) ?? null;
}

function dedupeKey(animalId: string | null, reservationId: string | null, dogName: string, ownerName: string | null) {
  if (animalId) return `animal:${animalId}`;
  if (reservationId) return `res:${reservationId}`;
  return `name:${dogName.toLowerCase()}::${(ownerName ?? "").toLowerCase()}`;
}

function mergeDog(map: Map<string, MutableDog>, incoming: MutableDog) {
  const key = dedupeKey(incoming.gingrAnimalId ?? null, incoming.reservationId ?? null, incoming.dogName, incoming.ownerName ?? null);
  const existing = map.get(key);
  if (!existing) {
    map.set(key, incoming);
    return;
  }

  existing.checkedIn = existing.checkedIn || incoming.checkedIn;
  existing.grooming = existing.grooming || incoming.grooming;
  existing.reservation = existing.reservation || incoming.reservation;
  existing.appointment = existing.appointment || incoming.appointment;
  existing.dogPhotoUrl = existing.dogPhotoUrl ?? incoming.dogPhotoUrl;
  existing.ownerName = existing.ownerName ?? incoming.ownerName;
  existing.reservationId = existing.reservationId ?? incoming.reservationId;
  existing.appointmentId = existing.appointmentId ?? incoming.appointmentId;
  existing.checkedInAt = existing.checkedInAt ?? incoming.checkedInAt;
  existing.appointmentTime = existing.appointmentTime ?? incoming.appointmentTime;
  existing.reservationType = existing.reservationType ?? incoming.reservationType;
  existing.gingrAnimalId = existing.gingrAnimalId ?? incoming.gingrAnimalId;
  if (!existing.dogPhotoUrl && incoming.dogPhotoUrl) existing.dogPhotoUrl = incoming.dogPhotoUrl;
}

function finalizeDog(dog: MutableDog): GroomingPushActiveDog {
  let status: GroomingPushDogStatus = "appointment";
  let displayStatus = "Appointment";
  let group: GroomingPushDogGroup = "other_appointments";

  if (dog.checkedIn && dog.grooming) {
    status = "checked_in";
    displayStatus = "Checked In + Grooming Appointment";
    group = "checked_in";
  } else if (dog.checkedIn) {
    status = "checked_in";
    displayStatus = "Checked In to Gingr";
    group = "checked_in";
  } else if (dog.grooming) {
    status = "grooming_appointment";
    displayStatus = "Grooming Appointment";
    group = "grooming_appointments";
  } else if (dog.reservation) {
    status = "reservation";
    displayStatus = reservationCategoryLabel(dog.reservationType);
    group = "reservations";
  } else if (dog.appointment) {
    status = "appointment";
    displayStatus = dog.reservationType?.trim() ? `${dog.reservationType} Appointment` : "Appointment";
    group = "other_appointments";
  }

  return {
    dogId: dog.dogId,
    dogName: dog.dogName,
    ownerName: dog.ownerName,
    dogPhotoUrl: dog.dogPhotoUrl,
    status,
    displayStatus,
    group,
    reservationId: dog.reservationId,
    appointmentId: dog.appointmentId,
    checkedInAt: dog.checkedInAt,
    appointmentTime: dog.appointmentTime,
    reservationType: dog.reservationType,
    gingrAnimalId: dog.gingrAnimalId
  };
}

function liveDogToMutable(dog: LiveDog): MutableDog {
  const reservationType = dog.reservation_type ?? undefined;
  const grooming = isGroomingType(reservationType);
  return {
    dogId: dog.gingr_animal_id ?? dog.gingr_reservation_id ?? dog.id,
    dogName: dog.animal_name,
    ownerName: dog.owner_name ?? undefined,
    dogPhotoUrl: dog.photo_url ?? undefined,
    status: "checked_in",
    displayStatus: "Checked In to Gingr",
    group: "checked_in",
    reservationId: dog.gingr_reservation_id ?? undefined,
    checkedInAt: dog.status_started_at ?? undefined,
    appointmentTime: undefined,
    reservationType,
    gingrAnimalId: dog.gingr_animal_id ?? undefined,
    checkedIn: true,
    grooming,
    reservation: !grooming && Boolean(reservationType),
    appointment: false
  };
}

function recordToMutable(record: GingrBackOfHouseRecord, now: Date, timeZone: string): MutableDog | null {
  if (!isRecordRelevantToday(record, now, timeZone)) return null;

  const reservationId = record.id != null ? String(record.id) : undefined;
  const gingrAnimalId = record.animal_id != null ? String(record.animal_id) : undefined;
  const dogName = buildDogNameFromRecord(record);
  const ownerName = buildOwnerNameFromRecord(record) ?? undefined;
  const reservationType = record.type ?? undefined;
  const grooming = isGroomingType(reservationType);
  const checkedIn = isActiveCheckinRecord(record);
  const appointmentTime =
    parseGingrDate(record.start_date)?.toISOString() ??
    parseGingrDate(record.event_time)?.toISOString() ??
    undefined;

  if (!checkedIn && !grooming && !reservationType && !appointmentTime) return null;

  return {
    dogId: gingrAnimalId ?? reservationId ?? `${dogName}-${ownerName ?? "unknown"}`,
    dogName,
    ownerName,
    dogPhotoUrl: photoFromRecord(record) ?? undefined,
    status: checkedIn ? "checked_in" : grooming ? "grooming_appointment" : "reservation",
    displayStatus: checkedIn ? "Checked In to Gingr" : reservationCategoryLabel(reservationType),
    group: checkedIn ? "checked_in" : grooming ? "grooming_appointments" : "reservations",
    reservationId,
    appointmentId: grooming ? reservationId : undefined,
    checkedInAt: checkedIn ? parseGingrDate(record.check_in_stamp)?.toISOString() ?? appointmentTime : undefined,
    appointmentTime,
    reservationType,
    gingrAnimalId,
    checkedIn,
    grooming,
    reservation: !grooming && Boolean(reservationType || appointmentTime),
    appointment: !grooming && !checkedIn && Boolean(appointmentTime)
  };
}

export async function loadActiveDogsForGroomingPush(
  supabase: SupabaseClient,
  options?: { timeZone?: string }
) {
  const timeZone = options?.timeZone ?? "America/Los_Angeles";
  const now = new Date();
  const map = new Map<string, MutableDog>();

  const { data: liveRows, error: liveError } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .eq("hidden", false)
    .eq("display_status", "checking_in")
    .order("animal_name", { ascending: true });

  if (!liveError) {
    for (const row of (liveRows ?? []) as LiveDog[]) {
      mergeDog(map, liveDogToMutable(row));
    }
  }

  const cachedBoard = getCachedBackOfHouseBoard(Date.now(), true);
  if (cachedBoard) {
    for (const record of cachedBoard.checking_in as GingrBackOfHouseRecord[]) {
      const mutable = recordToMutable(record, now, timeZone);
      if (mutable) mergeDog(map, mutable);
    }
  }

  const dogs = [...map.values()].map(finalizeDog);
  const animalIds = dogs.map((dog) => dog.gingrAnimalId).filter(Boolean) as string[];
  const photoMap = await loadStoredAnimalPhotoMap(supabase, animalIds).catch(() => new Map<string, string>());

  const enriched = dogs.map((dog) => {
    if (dog.dogPhotoUrl || !dog.gingrAnimalId) return dog;
    const stored = photoMap.get(dog.gingrAnimalId);
    return stored ? { ...dog, dogPhotoUrl: stored } : dog;
  });

  enriched.sort((a, b) => {
    const groupDiff = GROUP_SORT[a.group] - GROUP_SORT[b.group];
    if (groupDiff !== 0) return groupDiff;
    const statusDiff = STATUS_SORT[a.status] - STATUS_SORT[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.dogName.localeCompare(b.dogName);
  });

  return {
    dogs: enriched,
    meta: {
      source: cachedBoard ? "cache_and_supabase" : "supabase_only",
      cached_gingr_records: cachedBoard?.checking_in.length ?? 0,
      live_transition_rows: liveRows?.length ?? 0
    }
  };
}
