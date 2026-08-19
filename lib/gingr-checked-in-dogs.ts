import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";
import type { CheckedInGingrDog } from "@/lib/gingr-custom-animal-icons";

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

/** Business-day calendar date for Fitdog (America/Los_Angeles). */
export function todayInLosAngeles(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function isCheckedInReservation(record: Record<string, unknown>): boolean {
  if (record.cancelled_date || record.cancelled_at) return false;
  if (record.check_out_stamp || record.check_out_date || record.checked_out_at) return false;
  if (record.check_in_stamp || record.check_in_date || record.checked_in_at) return true;
  const status = pickString(record.status, record.status_string, record.state)?.toLowerCase() || "";
  return status === "checked in" || status === "checked_in" || status.includes("checked in");
}

function mapReservationRow(row: unknown): CheckedInGingrDog | null {
  const record = asRecord(row);
  if (!record) return null;

  const animalField = record.animal ?? record.pet ?? record.dog;
  const animal =
    asRecord(animalField) ||
    (typeof animalField === "string" || typeof animalField === "number"
      ? { id: animalField }
      : null);
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
    animal?.first_name,
    record.animal_name,
    record.pet_name,
    record.dog_name,
    record.a_name,
    [pickString(animal?.a_first, record.a_first), pickString(animal?.a_last, record.a_last)]
      .filter(Boolean)
      .join(" ")
  );
  if (!animalId || !dogName) return null;

  const ownerName = pickString(
    owner?.full_name,
    [pickString(owner?.first_name, owner?.o_first), pickString(owner?.last_name, owner?.o_last)]
      .filter(Boolean)
      .join(" "),
    record.owner_name,
    record.client_name,
    [pickString(record.o_first), pickString(record.o_last)].filter(Boolean).join(" ")
  );

  const photoUrl = pickString(
    animal?.image,
    animal?.image_url,
    animal?.photo_url,
    record.a_image,
    record.photo_url,
    record.image_url
  );

  return {
    animalId,
    dogName,
    ownerName,
    reservationId: pickString(record.reservation_id, record.id),
    reservationType: pickString(type?.name, type?.type, record.type_name, record.type, record.reservation_type),
    photoUrl,
    checkedInAt: pickString(record.check_in_stamp, record.check_in_date, record.checked_in_at)
  };
}

function dedupeDogs(dogs: CheckedInGingrDog[]): CheckedInGingrDog[] {
  const seen = new Set<string>();
  const out: CheckedInGingrDog[] = [];
  for (const dog of dogs) {
    if (seen.has(dog.animalId)) continue;
    seen.add(dog.animalId);
    out.push(dog);
  }
  out.sort((a, b) => a.dogName.localeCompare(b.dogName));
  return out;
}

async function postReservations(fields: Record<string, string>): Promise<unknown[]> {
  const client = createGingrClient();
  if (!client.config.apiKey) {
    throw new Error("GINGR_API_KEY is not configured on this environment.");
  }
  const body = new URLSearchParams({
    key: client.config.apiKey,
    location_id: client.config.locationId,
    ...fields
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${client.config.baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
      },
      body,
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Gingr reservations ${response.status}: ${text.slice(0, 180) || response.statusText}`);
    }
    return normalizeGingrReservationList(await response.json()) as unknown[];
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      throw new Error("Gingr reservations timed out after 8000ms");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Currently checked-in dogs for Grooming Push / fighter alerts.
 * Uses Pacific business date (not UTC) and falls back to today's reservation
 * list filtered by check-in stamps when checked_in=true returns empty.
 */
export async function fetchCurrentlyCheckedInDogsRobust(options?: {
  force?: boolean;
  now?: Date;
}): Promise<{ dogs: CheckedInGingrDog[]; meta: Record<string, unknown> }> {
  const todayLa = todayInLosAngeles(options?.now);
  const todayUtc = (options?.now ?? new Date()).toISOString().slice(0, 10);

  let checkedInQueryRows: unknown[] = [];
  let checkedInQueryError: string | null = null;
  try {
    // Prefer checked_in=true without date filters — some tenants ignore dates, some don't.
    checkedInQueryRows = await postReservations({ checked_in: "true" });
  } catch (error) {
    checkedInQueryError = error instanceof Error ? error.message : "checked_in query failed";
  }

  // Also query with Pacific date (and UTC date if different) for tenants that require dates.
  let datedCheckedInRows: unknown[] = [];
  try {
    datedCheckedInRows = await postReservations({
      checked_in: "true",
      start_date: todayLa,
      end_date: todayLa
    });
  } catch {
    // ignore — primary query or day-list fallback may still work
  }

  if (todayUtc !== todayLa) {
    try {
      const utcRows = await postReservations({
        checked_in: "true",
        start_date: todayUtc,
        end_date: todayUtc
      });
      datedCheckedInRows = [...datedCheckedInRows, ...utcRows];
    } catch {
      // ignore
    }
  }

  let dayListRows: unknown[] = [];
  let dayListError: string | null = null;
  try {
    dayListRows = await postReservations({
      checked_in: "false",
      start_date: todayLa,
      end_date: todayLa
    });
  } catch (error) {
    dayListError = error instanceof Error ? error.message : "day list query failed";
  }

  const fromCheckedInFlag = dedupeDogs(
    [...checkedInQueryRows, ...datedCheckedInRows]
      .map(mapReservationRow)
      .filter((dog): dog is CheckedInGingrDog => Boolean(dog))
  );

  const fromDayList = dedupeDogs(
    dayListRows
      .filter((row) => {
        const record = asRecord(row);
        return record ? isCheckedInReservation(record) : false;
      })
      .map(mapReservationRow)
      .filter((dog): dog is CheckedInGingrDog => Boolean(dog))
  );

  const dogs = dedupeDogs([...fromCheckedInFlag, ...fromDayList]);

  if (!dogs.length && (checkedInQueryError || dayListError)) {
    throw new Error(checkedInQueryError || dayListError || "Unable to load checked-in dogs from Gingr.");
  }

  return {
    dogs,
    meta: {
      todayLa,
      todayUtc,
      checked_in_query_rows: checkedInQueryRows.length,
      dated_checked_in_rows: datedCheckedInRows.length,
      day_list_rows: dayListRows.length,
      day_list_checked_in: fromDayList.length,
      checked_in_query_error: checkedInQueryError,
      day_list_error: dayListError
    }
  };
}
