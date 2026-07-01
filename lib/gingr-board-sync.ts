import { resolveActiveCheckinDisplayUntil } from "@/lib/checkin-display";
import { resolveActiveCheckoutDisplayUntil } from "@/lib/checkout-display";
import { normalizeBoardDog, type BoardDogSource } from "@/lib/board-dog";
import type { LiveDog } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

export type GingrBackOfHouseRecord = {
  id?: string | number;
  owner_id?: string | number;
  animal_id?: string | number;
  o_last?: string | null;
  o_first?: string | null;
  a_first?: string | null;
  a_last?: string | null;
  type_id?: string | number;
  type?: string | null;
  check_in_stamp?: string | number | null;
  check_out_stamp?: string | number | null;
  start_date?: string | number | null;
  end_date?: string | number | null;
  run_name?: string | null;
  area_name?: string | null;
  status_string?: string | null;
  event_time?: string | number | null;
  image?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
};

type GingrApiResponse<T> = {
  success?: boolean;
  error?: boolean | string;
  data?: T;
};

type ReservationType = {
  id: string | number;
  name?: string;
  active?: boolean | string;
};

function getGingrConfig() {
  const subdomain = process.env.GINGR_SUBDOMAIN ?? "fitdog";
  const apiKey = process.env.GINGR_API_KEY;
  const locationId = process.env.GINGR_LOCATION_ID ?? "1";
  const configuredTypeIds = process.env.GINGR_TYPE_IDS?.split(",").map((value) => value.trim()).filter(Boolean);
  return { subdomain, apiKey, locationId, configuredTypeIds };
}

function gingrUrl(subdomain: string, path: string, params: Record<string, string | string[]>) {
  const url = new URL(`https://${subdomain}.gingrapp.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(`${key}[]`, item);
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchGingrJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Gingr API returned ${response.status} for ${url}`);
  }

  const body = (await response.json()) as GingrApiResponse<T> | T;
  if (body && typeof body === "object" && "data" in (body as GingrApiResponse<T>)) {
    const wrapped = body as GingrApiResponse<T>;
    if (wrapped.error) {
      throw new Error(typeof wrapped.error === "string" ? wrapped.error : "Gingr API returned an error.");
    }
    return wrapped.data as T;
  }

  return body as T;
}

let cachedTypeIds: string[] | null = null;
let cachedTypeIdsAt = 0;

async function getReservationTypeIds(subdomain: string, apiKey: string, configuredTypeIds?: string[]) {
  if (configuredTypeIds?.length) return configuredTypeIds;

  const now = Date.now();
  if (cachedTypeIds && now - cachedTypeIdsAt < 10 * 60 * 1000) {
    return cachedTypeIds;
  }

  const url = gingrUrl(subdomain, "/api/v1/reservation_types", {
    key: apiKey,
    active_only: "true"
  });
  const types = await fetchGingrJson<ReservationType[]>(url);
  const ids = (types ?? [])
    .map((type) => String(type.id))
    .filter(Boolean);

  cachedTypeIds = ids.length ? ids : ["1"];
  cachedTypeIdsAt = now;
  return cachedTypeIds;
}

async function fetchAnimalPhotoMap(subdomain: string, apiKey: string, animalIds: string[]) {
  const photoMap = new Map<string, string | null>();
  const uniqueIds = [...new Set(animalIds.filter(Boolean))].slice(0, 12);

  await Promise.all(
    uniqueIds.map(async (animalId) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const url = gingrUrl(subdomain, "/api/v1/animals", {
          key: apiKey,
          "params[id]": animalId
        });
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) return;
        const body = (await response.json()) as { data?: UnknownRecord[] };
        const animal = body.data?.[0];
        if (!animal) return;
        const photo =
          (typeof animal.image === "string" && animal.image) ||
          (typeof animal.image_url === "string" && animal.image_url) ||
          (typeof animal.photo_url === "string" && animal.photo_url) ||
          null;
        photoMap.set(animalId, photo);
      } catch {
        photoMap.set(animalId, null);
      }
    })
  );

  return photoMap;
}

export async function fetchGingrBackOfHouse() {
  const { subdomain, apiKey, locationId, configuredTypeIds } = getGingrConfig();
  if (!apiKey) {
    return { checking_in: [] as GingrBackOfHouseRecord[], checking_out: [] as GingrBackOfHouseRecord[], source: "disabled" as const };
  }

  const typeIds = await getReservationTypeIds(subdomain, apiKey, configuredTypeIds);
  const url = gingrUrl(subdomain, "/api/v1/back_of_house", {
    key: apiKey,
    location_id: locationId,
    full_day: "true",
    type_ids: typeIds
  });

  const data = await fetchGingrJson<{
    checking_in?: GingrBackOfHouseRecord[];
    checking_out?: GingrBackOfHouseRecord[];
  }>(url);

  return {
    checking_in: data?.checking_in ?? [],
    checking_out: data?.checking_out ?? [],
    source: "gingr_back_of_house" as const
  };
}

function toBoardSource(record: GingrBackOfHouseRecord, direction: "checking_in" | "checking_out"): BoardDogSource {
  return {
    record,
    direction,
    reservation_id: record.id,
    animal_id: record.animal_id,
    event_timestamp: record.event_time,
    updated_at: record.event_time
  };
}

function displayUntilFor(direction: "checking_in" | "checking_out", statusStartedAt: string, existingUntil?: string | null) {
  return direction === "checking_out"
    ? resolveActiveCheckoutDisplayUntil(statusStartedAt, existingUntil)
    : resolveActiveCheckinDisplayUntil(statusStartedAt, existingUntil);
}

function isSameActiveTransition(existing: LiveDog | null | undefined, direction: "checking_in" | "checking_out", reservationId: string) {
  return Boolean(
    existing &&
      !existing.hidden &&
      existing.display_status === direction &&
      existing.gingr_reservation_id === reservationId
  );
}

export function mapGingrBoardToLiveDogs(board: Awaited<ReturnType<typeof fetchGingrBackOfHouse>>) {
  const now = new Date().toISOString();
  const dogs: LiveDog[] = [];

  for (const direction of ["checking_in", "checking_out"] as const) {
    for (const record of board[direction]) {
      const normalized = normalizeBoardDog(toBoardSource(record, direction));
      if (!normalized.gingr_reservation_id) continue;

      const statusStartedAt = normalized.status_started_at ?? now;
      dogs.push({
        id: `gingr-${direction}-${normalized.gingr_reservation_id}`,
        gingr_reservation_id: normalized.gingr_reservation_id,
        gingr_animal_id: normalized.gingr_animal_id,
        animal_name: normalized.animal_name,
        owner_name: normalized.owner_name,
        photo_url: normalized.photo_url,
        reservation_type: normalized.reservation_type,
        current_status: direction,
        display_status: direction,
        room: normalized.room,
        notes: normalized.notes,
        flags: normalized.flags,
        status_started_at: statusStartedAt,
        completed_at: null,
        display_until: displayUntilFor(direction, statusStartedAt),
        last_seen_from_gingr_at: now,
        raw_payload: { source: "gingr_back_of_house", record },
        hidden: false,
        updated_at: now
      });
    }
  }

  return dogs;
}

export async function syncGingrBoardState(
  supabase: ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>
) {
  const board = await fetchGingrBackOfHouse();
  if (board.source === "disabled") {
    return { synced: false, reason: "GINGR_API_KEY missing", checking_in: 0, checking_out: 0 };
  }

  const now = new Date().toISOString();
  const activeKeys = new Set<string>();
  const animalIds: string[] = [];
  const rows: Array<{
    normalized: ReturnType<typeof normalizeBoardDog>;
    direction: "checking_in" | "checking_out";
    sourceRecord: GingrBackOfHouseRecord;
  }> = [];

  for (const direction of ["checking_in", "checking_out"] as const) {
    for (const record of board[direction]) {
      const normalized = normalizeBoardDog(toBoardSource(record, direction));
      if (!normalized.gingr_reservation_id) continue;

      activeKeys.add(`${direction}::${normalized.gingr_reservation_id}`);
      if (normalized.gingr_animal_id) animalIds.push(normalized.gingr_animal_id);
      rows.push({ normalized, direction, sourceRecord: record });
    }
  }

  const { subdomain, apiKey } = getGingrConfig();
  const shouldFetchPhotos = process.env.GINGR_FETCH_ANIMAL_PHOTOS === "true";
  const photoMap =
    shouldFetchPhotos && apiKey
      ? await fetchAnimalPhotoMap(subdomain, apiKey, animalIds)
      : new Map<string, string | null>();

  const { data: existingDogs } = await supabase
    .from("live_transition_dogs")
    .select("*")
    .in(
      "gingr_reservation_id",
      rows.map(({ normalized }) => normalized.gingr_reservation_id).filter(Boolean) as string[]
    );

  const existingByReservation = new Map(
    (existingDogs ?? []).map((dog) => [dog.gingr_reservation_id, dog as LiveDog])
  );

  await Promise.all(
    rows.map(async ({ normalized, direction, sourceRecord }) => {
      const row = normalized;
      if (row.gingr_animal_id && photoMap.has(row.gingr_animal_id)) {
        row.photo_url = photoMap.get(row.gingr_animal_id) ?? row.photo_url;
      }

      const existing = row.gingr_reservation_id
        ? existingByReservation.get(row.gingr_reservation_id)
        : undefined;
      const continuing =
        row.gingr_reservation_id &&
        isSameActiveTransition(existing, direction, row.gingr_reservation_id);
      const statusStartedAt =
        continuing && existing?.status_started_at ? existing.status_started_at : row.status_started_at ?? now;
      const displayUntil = displayUntilFor(direction, statusStartedAt, continuing ? existing?.display_until : null);

      const upsertRow = {
        gingr_reservation_id: row.gingr_reservation_id,
        gingr_animal_id: row.gingr_animal_id,
        animal_name: row.animal_name,
        owner_name: row.owner_name,
        photo_url: row.photo_url ?? existing?.photo_url ?? null,
        reservation_type: row.reservation_type,
        current_status: direction,
        display_status: direction,
        room: row.room,
        notes: row.notes,
        flags: row.flags,
        status_started_at: statusStartedAt,
        completed_at: null,
        display_until: displayUntil,
        hidden: false,
        last_seen_from_gingr_at: now,
        raw_payload: { source: "gingr_back_of_house", record: sourceRecord },
        updated_at: now
      };

      if (existing) {
        await supabase.from("live_transition_dogs").update(upsertRow).eq("id", existing.id);
      } else {
        await supabase.from("live_transition_dogs").insert(upsertRow);
      }
    })
  );

  const { data: currentlyVisible } = await supabase
    .from("live_transition_dogs")
    .select("id, gingr_reservation_id, display_status")
    .eq("hidden", false)
    .in("display_status", ["checking_in", "checking_out"]);

  const hideIds = (currentlyVisible ?? [])
    .filter((dog) => !activeKeys.has(`${dog.display_status}::${dog.gingr_reservation_id}`))
    .map((dog) => dog.id);

  if (hideIds.length) {
    await supabase
      .from("live_transition_dogs")
      .update({
        hidden: true,
        display_status: "removed",
        current_status: "synced_removed",
        completed_at: now,
        updated_at: now
      })
      .in("id", hideIds);
  }

  return {
    synced: true,
    reason: null,
    checking_in: board.checking_in.length,
    checking_out: board.checking_out.length
  };
}
