import type { GingrReservation } from "@/lib/integrations/gingr/types";
import type { BodyCheckRosterRow, RosterCounts, RosterFilter, ServiceCategory } from "@/lib/body-checks/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function classifyService(typeName: string | null): ServiceCategory {
  const text = (typeName ?? "").toLowerCase();
  if (text.includes("board")) return "boarding";
  if (text.includes("groom")) return "grooming";
  if (text.includes("train") || text.includes("class")) return "training";
  if (text.includes("hike")) return "hike";
  if (text.includes("outing") || text.includes("excursion") || text.includes("adventure")) return "outing";
  if (text.includes("daycare") || text.includes("day care") || text.includes("playgroup") || text.includes("play group")) {
    return "daycare";
  }
  return "other";
}

export function isAppointmentCategory(category: ServiceCategory, typeName: string | null): boolean {
  if (category === "grooming" || category === "training" || category === "hike" || category === "outing") return true;
  return (typeName ?? "").toLowerCase().includes("appointment");
}

function cancelled(record: Record<string, unknown>): boolean {
  if (record.cancelled_date || record.cancelled_at || record.cancelled) return true;
  const status = pickString(record.status, record.state)?.toLowerCase() ?? "";
  return status.includes("cancel") || status.includes("void");
}

function checkedIn(record: Record<string, unknown>): boolean {
  if (record.check_out_stamp || record.check_out_date || record.checked_out_at) return false;
  if (record.check_in_stamp || record.check_in_date || record.checked_in_at) return true;
  if (record.checked_in === true || record.checked_in === "1" || record.checked_in === "true") return true;
  const status = pickString(record.status, record.status_string, record.state)?.toLowerCase() ?? "";
  return status.includes("checked in") || status === "checked_in";
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

export function mapReservation(row: GingrReservation | unknown, businessDate: string, sourceCheckedIn = false): BodyCheckRosterRow | null {
  const record = asRecord(row);
  if (!record || cancelled(record)) return null;
  const animalField = record.animal ?? record.pet ?? record.dog;
  const animal = asRecord(animalField);
  const owner = asRecord(record.owner || record.client || record.customer);
  const type = asRecord(record.type) || asRecord(record.reservation_type);
  const animalId = pickString(
    animal?.id,
    record.animal_id,
    record.a_id,
    typeof animalField === "string" || typeof animalField === "number" ? animalField : null
  );
  const dogName = pickString(
    animal?.name,
    record.animal_name,
    record.pet_name,
    record.dog_name,
    record.a_name
  );
  if (!animalId || !dogName) return null;
  const reservationId = pickString(record.reservation_id, record.id);
  const serviceType = pickString(type?.name, type?.type, record.type_name, typeof record.type === "string" ? record.type : null, record.reservation_type);
  const category = classifyService(serviceType);
  const startsAt = pickString(record.start_date, record.start, record.appointment_time, record.check_in_date);
  const startDay = dateOnly(startsAt);
  const isIn = sourceCheckedIn || checkedIn(record);
  return {
    key: `${animalId}:${reservationId ?? "none"}`,
    gingrAnimalId: animalId,
    dogName,
    photoUrl: pickString(animal?.image, animal?.image_url, animal?.photo_url, record.photo_url, record.image_url),
    ownerId: pickString(owner?.id, record.owner_id, record.o_id),
    ownerName: pickString(
      owner?.full_name,
      [pickString(owner?.first_name), pickString(owner?.last_name)].filter(Boolean).join(" "),
      record.owner_name,
      [pickString(record.o_first), pickString(record.o_last)].filter(Boolean).join(" ")
    ),
    reservationId,
    serviceType,
    serviceCategory: category,
    startsAt,
    checkedIn: isIn,
    checkedInAt: isIn ? pickString(record.check_in_stamp, record.check_in_date, record.checked_in_at) : null,
    isArrivalToday: startDay === businessDate && !isIn,
    isUpcoming: Boolean(startDay && startDay > businessDate),
    isAppointment: isAppointmentCategory(category, serviceType)
  };
}

export function mergeRosterSources(
  checkedInRows: unknown[],
  rangedRows: unknown[],
  businessDate: string
): { rows: BodyCheckRosterRow[]; droppedMissingIdentity: number } {
  const byKey = new Map<string, BodyCheckRosterRow>();
  let droppedMissingIdentity = 0;
  const ingest = (rows: unknown[], sourceCheckedIn: boolean) => {
    for (const row of rows) {
      const mapped = mapReservation(row, businessDate, sourceCheckedIn);
      if (!mapped) {
        const record = asRecord(row);
        if (record && !cancelled(record)) droppedMissingIdentity += 1;
        continue;
      }
      const existing = byKey.get(mapped.key);
      if (!existing) {
        byKey.set(mapped.key, mapped);
        continue;
      }
      byKey.set(mapped.key, {
        ...existing,
        ...mapped,
        checkedIn: existing.checkedIn || mapped.checkedIn,
        checkedInAt: existing.checkedInAt || mapped.checkedInAt,
        photoUrl: mapped.photoUrl || existing.photoUrl,
        ownerName: mapped.ownerName || existing.ownerName,
        isArrivalToday: (existing.isArrivalToday || mapped.isArrivalToday) && !(existing.checkedIn || mapped.checkedIn),
        isUpcoming: (existing.isUpcoming || mapped.isUpcoming) && !(existing.checkedIn || mapped.checkedIn)
      });
    }
  };
  ingest(checkedInRows, true);
  ingest(rangedRows, false);
  const rows = [...byKey.values()].sort((a, b) => {
    if (a.checkedIn !== b.checkedIn) return a.checkedIn ? -1 : 1;
    if (a.isArrivalToday !== b.isArrivalToday) return a.isArrivalToday ? -1 : 1;
    return a.dogName.localeCompare(b.dogName);
  });
  return { rows, droppedMissingIdentity };
}

export function filterRoster(
  rows: BodyCheckRosterRow[],
  options: { query?: string; filter?: RosterFilter; followUpAnimalIds?: Set<string> }
): BodyCheckRosterRow[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const filter = options.filter ?? "all";
  return rows.filter((row) => {
    if (filter === "checked_in" && !row.checkedIn) return false;
    if (filter === "arriving" && !row.isArrivalToday) return false;
    if (filter === "upcoming" && !row.isUpcoming) return false;
    if (filter === "appointments" && !row.isAppointment) return false;
    if (filter === "follow_up" && !options.followUpAnimalIds?.has(row.gingrAnimalId)) return false;
    if (!query) return true;
    const haystack = [row.dogName, row.ownerName, row.gingrAnimalId, row.reservationId, row.serviceType]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function countRoster(
  rows: BodyCheckRosterRow[],
  extras: { submittedToday: number; unresolvedFollowUps: number }
): RosterCounts {
  const dogs = new Set(rows.map((row) => row.gingrAnimalId));
  const checkedIn = new Set(rows.filter((row) => row.checkedIn).map((row) => row.gingrAnimalId));
  const arrivals = new Set(rows.filter((row) => row.isArrivalToday).map((row) => row.gingrAnimalId));
  const upcoming = new Set(rows.filter((row) => row.isUpcoming).map((row) => row.gingrAnimalId));
  const appointments = rows.filter((row) => row.isAppointment);
  return {
    dogs: dogs.size,
    checkedIn: checkedIn.size,
    arrivals: arrivals.size,
    upcoming: upcoming.size,
    appointments: appointments.length,
    submittedToday: extras.submittedToday,
    unresolvedFollowUps: extras.unresolvedFollowUps
  };
}
