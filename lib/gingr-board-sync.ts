import { resolveActiveCheckinDisplayUntil } from "@/lib/checkin-display";
import { resolveActiveCheckoutDisplayUntil } from "@/lib/checkout-display";
import { buildGingrBasketCheckoutKeys, hideBasketClearedCheckoutRows } from "@/lib/basket-cleared-checkout";
import { extractPhotoUrl } from "@/lib/board-utils";
import { getCheckoutFilterReason, isPromptedCheckoutRecord } from "@/lib/checkout-prompt";
import { normalizeBoardDog, type BoardDogSource } from "@/lib/board-dog";
import {
  canCallGingrEndpoint,
  getCachedBackOfHouseBoard,
  markGingrEndpointCalled,
  setCachedBackOfHouseBoard
} from "@/lib/gingr-request-guard";
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

async function fetchGingrJson<T>(url: string, endpoint: "back_of_house" | "reservation_types"): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const revalidateSeconds = endpoint === "back_of_house" ? 9 : 600;

  try {
    markGingrEndpointCalled(endpoint);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: {
        revalidate: revalidateSeconds,
        tags: [`gingr-${endpoint}`]
      },
      signal: controller.signal
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
  } finally {
    clearTimeout(timeout);
  }
}

let cachedActiveTypeIds: string[] | null = null;
let cachedAllTypeIds: string[] | null = null;
let cachedActiveTypeIdsAt = 0;
let cachedAllTypeIdsAt = 0;

async function getReservationTypeIds(
  subdomain: string,
  apiKey: string,
  configuredTypeIds?: string[],
  options?: { includeInactiveTypes?: boolean }
) {
  if (configuredTypeIds?.length) return configuredTypeIds;

  const now = Date.now();
  const includeInactiveTypes = Boolean(options?.includeInactiveTypes);
  const cachedIds = includeInactiveTypes ? cachedAllTypeIds : cachedActiveTypeIds;
  const cachedAt = includeInactiveTypes ? cachedAllTypeIdsAt : cachedActiveTypeIdsAt;

  if (cachedIds && now - cachedAt < 10 * 60 * 1000) {
    return cachedIds;
  }

  if (!canCallGingrEndpoint("reservation_types") && cachedIds) {
    return cachedIds;
  }

  const url = gingrUrl(subdomain, "/api/v1/reservation_types", {
    key: apiKey,
    active_only: includeInactiveTypes ? "false" : "true"
  });
  const types = await fetchGingrJson<ReservationType[]>(url, "reservation_types");
  const ids = (types ?? [])
    .map((type) => String(type.id))
    .filter(Boolean);

  const resolvedIds = ids.length ? ids : ["1"];
  if (includeInactiveTypes) {
    cachedAllTypeIds = resolvedIds;
    cachedAllTypeIdsAt = now;
  } else {
    cachedActiveTypeIds = resolvedIds;
    cachedActiveTypeIdsAt = now;
  }

  return resolvedIds;
}

function photoUrlFromRecord(record: GingrBackOfHouseRecord) {
  return record.photo_url ?? extractPhotoUrl(record as UnknownRecord) ?? null;
}

export type FetchGingrBackOfHouseOptions = {
  /** Lobby board needs every reservation type in the checkout basket, not just active-only types. */
  allReservationTypes?: boolean;
};

export async function fetchGingrBackOfHouse(options?: FetchGingrBackOfHouseOptions) {
  const { subdomain, apiKey, locationId, configuredTypeIds } = getGingrConfig();
  if (!apiKey) {
    return { checking_in: [] as GingrBackOfHouseRecord[], checking_out: [] as GingrBackOfHouseRecord[], source: "disabled" as const };
  }

  if (!canCallGingrEndpoint("back_of_house")) {
    const cachedBoard = getCachedBackOfHouseBoard(undefined, true);
    if (cachedBoard) return cachedBoard;
  }

  const typeIds = await getReservationTypeIds(subdomain, apiKey, options?.allReservationTypes ? [] : configuredTypeIds, {
    includeInactiveTypes: options?.allReservationTypes
  });
  const url = gingrUrl(subdomain, "/api/v1/back_of_house", {
    key: apiKey,
    location_id: locationId,
    type_ids: typeIds
  });

  const data = await fetchGingrJson<{
    checking_in?: GingrBackOfHouseRecord[];
    checking_out?: GingrBackOfHouseRecord[];
  }>(url, "back_of_house");

  const checkingIn = (data?.checking_in ?? []).map((record) => ({
    ...record,
    photo_url: photoUrlFromRecord(record)
  }));
  const checkingOut = (data?.checking_out ?? []).map((record) => ({
    ...record,
    photo_url: photoUrlFromRecord(record)
  }));

  const board = {
    checking_in: checkingIn,
    checking_out: checkingOut,
    source: "gingr_back_of_house" as const
  };

  setCachedBackOfHouseBoard(board);
  return board;
}

function toBoardSource(record: GingrBackOfHouseRecord, direction: "checking_in" | "checking_out"): BoardDogSource {
  const rawRecord = record as UnknownRecord;
  const promptTimestamp =
    direction === "checking_out"
      ? rawRecord.checkout_prompted_at ??
        rawRecord.checking_out_prompted_at ??
        rawRecord.checkout_requested_at ??
        rawRecord.ready_for_pickup_at ??
        rawRecord.prompted_at ??
        rawRecord.user_prompted_at
      : null;

  return {
    record,
    direction,
    reservation_id: record.id,
    animal_id: record.animal_id,
    event_timestamp: (promptTimestamp as string | number | null | undefined) ?? record.event_time,
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

function isActiveCheckinRecord(record: GingrBackOfHouseRecord) {
  const status = record.status_string?.trim().toLowerCase();
  return Boolean(record.check_in_stamp) || status === "checked in" || status === "checked_in";
}

export function mapGingrBoardToLiveDogs(board: Awaited<ReturnType<typeof fetchGingrBackOfHouse>>) {
  const now = new Date().toISOString();
  const dogs: LiveDog[] = [];

  for (const direction of ["checking_in", "checking_out"] as const) {
    for (const record of board[direction]) {
      if (direction === "checking_in" && !isActiveCheckinRecord(record)) continue;

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

export function getGingrCheckoutPromptStats(board: Awaited<ReturnType<typeof fetchGingrBackOfHouse>>) {
  const rawCheckoutCandidates = board.checking_out.length;
  const promptedCheckoutCount = board.checking_out.filter((record) =>
    isPromptedCheckoutRecord(record as UnknownRecord)
  ).length;
  const scheduledOnlyCheckoutCount = rawCheckoutCandidates - promptedCheckoutCount;

  return {
    raw_checking_out_candidates: rawCheckoutCandidates,
    prompted_checkout_count: promptedCheckoutCount,
    scheduled_only_checkout_count: scheduledOnlyCheckoutCount,
    filtered_unprompted_checkout_count: scheduledOnlyCheckoutCount,
    filtered_checkout_reasons: board.checking_out.slice(0, 8).map((record) => ({
      reservation_id: record.id != null ? String(record.id) : null,
      animal_id: record.animal_id != null ? String(record.animal_id) : null,
      reason: getCheckoutFilterReason(record as UnknownRecord)
    }))
  };
}

export async function syncGingrBoardState(
  supabase: ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>,
  board?: Awaited<ReturnType<typeof fetchGingrBackOfHouse>>
) {
  const resolvedBoard = board ?? (await fetchGingrBackOfHouse({ allReservationTypes: true }));
  if (resolvedBoard.source === "disabled") {
    return { synced: false, reason: "GINGR_API_KEY missing", checking_in: 0, checking_out: 0 };
  }

  const now = new Date().toISOString();
  const { data: removed, error } = await supabase
    .from("live_transition_dogs")
    .update({
      hidden: true,
      display_status: "removed",
      current_status: "synced_removed",
      completed_at: now,
      updated_at: now
    })
    .eq("hidden", false)
    .in("display_status", ["checking_in", "checking_out"])
    .filter("raw_payload->>source", "eq", "gingr_back_of_house")
    .select("id");

  if (error) throw error;

  let basketClearedRows = 0;
  try {
    const gingrCheckoutKeys = buildGingrBasketCheckoutKeys(resolvedBoard);
    const hidden = await hideBasketClearedCheckoutRows(supabase, gingrCheckoutKeys, new Date(now));
    basketClearedRows = hidden.hidden_count;
  } catch {
    // Basket reconciliation should not block the broader Gingr sync.
  }

  return {
    synced: true,
    reason: null,
    checking_in: 0,
    checking_out: 0,
    removed_back_of_house_rows: removed?.length ?? 0,
    basket_cleared_rows: basketClearedRows,
    raw_checking_in_candidates: resolvedBoard.checking_in.length,
    ...getGingrCheckoutPromptStats(resolvedBoard)
  };
}
