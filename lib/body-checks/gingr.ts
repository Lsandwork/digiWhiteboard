import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { createGingrClient, normalizeGingrReservationList } from "@/lib/integrations/gingr/client";
import { addCalendarDays, mergeRosterSources } from "@/lib/body-checks/roster";
import type { BodyCheckRosterRow } from "@/lib/body-checks/types";

const CACHE_TTL_MS = 45_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_PAGES = 8;

type CacheEntry = {
  at: number;
  businessDate: string;
  throughDate: string;
  rows: BodyCheckRosterRow[];
  droppedMissingIdentity: number;
  pages: number;
};

let cache: CacheEntry | null = null;

export type RosterSyncResult = {
  rows: BodyCheckRosterRow[];
  syncedAt: string | null;
  stale: boolean;
  incomplete: boolean;
  error: string | null;
  droppedMissingIdentity: number;
  coverageNote: string;
};

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
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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
    if (response.status === 429) {
      throw new Error("Gingr rate limited the reservations request. Try again shortly.");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Gingr reservations ${response.status}: ${text.slice(0, 180) || response.statusText}`);
    }
    return normalizeGingrReservationList(await response.json()) as unknown[];
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      throw new Error(`Gingr reservations timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The verified Gingr client uses POST /api/v1/reservations and returns the date-range
 * payload in one response. If a later page is identical to the previous page, paging stops.
 * There is no separate appointments endpoint in this integration; appointment-like
 * services are reservation types (grooming, training, hikes, outings).
 */
/** Stop when a page repeats (the reservations API ignores page) or is empty. A full unique last page means more may exist. */
export function classifyReservationPage(
  page: number,
  batchLength: number,
  signature: string,
  previousSignature: string,
  maxPages = MAX_PAGES
): "append" | "done" | "capped" {
  if (batchLength === 0) return "done";
  if (page > 1 && signature === previousSignature) return "done";
  if (page >= maxPages) return "capped";
  return "append";
}

async function pullPaged(fields: Record<string, string>): Promise<{ rows: unknown[]; pages: number; incomplete: boolean }> {
  const rows: unknown[] = [];
  let pages = 0;
  let previousSignature = "";
  let incomplete = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const batch = await postReservations({ ...fields, page: String(page) });
    pages += 1;
    const signature = batch.map((row) => JSON.stringify(row)).join("|").slice(0, 4000);
    const decision = classifyReservationPage(page, batch.length, signature, previousSignature);
    if (decision === "done") break;
    rows.push(...batch);
    previousSignature = signature;
    if (decision === "capped") {
      incomplete = true;
      break;
    }
  }
  return { rows, pages, incomplete };
}

export async function loadBodyCheckRoster(options?: { businessDate?: string; force?: boolean }): Promise<RosterSyncResult> {
  const businessDate = options?.businessDate || todayInLosAngeles();
  const throughDate = addCalendarDays(businessDate, 7);
  const coverageNote =
    "Roster uses POST /api/v1/reservations (checked-in plus the selected date through 7 days) and keeps one row per Gingr dog. A dog is checked in only when a reservation has a check-in and no check-out; a check-out today marks the dog as gone home, never as still coming. Photos come from POST /api/v1/animals through the existing animal-photo proxy. Appointment rows are reservation types such as grooming, training, hikes, and outings.";

  if (!options?.force && cache && cache.businessDate === businessDate && Date.now() - cache.at < CACHE_TTL_MS) {
    return {
      rows: cache.rows,
      syncedAt: new Date(cache.at).toISOString(),
      stale: false,
      incomplete: false,
      error: null,
      droppedMissingIdentity: cache.droppedMissingIdentity,
      coverageNote
    };
  }

  try {
    const [checkedInResult, rangedResult] = await Promise.allSettled([
      pullPaged({ checked_in: "true" }),
      pullPaged({ checked_in: "false", start_date: businessDate, end_date: throughDate })
    ]);
    if (checkedInResult.status === "rejected" && rangedResult.status === "rejected") {
      throw checkedInResult.reason;
    }
    if (checkedInResult.status === "rejected" || rangedResult.status === "rejected") {
      // Each pull carries Gingr check-in and check-out stamps, so one source still labels
      // dogs correctly; it just may miss dogs only the other pull returns. Never cache it.
      const failed = checkedInResult.status === "rejected" ? checkedInResult : (rangedResult as PromiseRejectedResult);
      const partial = mergeRosterSources(
        checkedInResult.status === "fulfilled" ? checkedInResult.value.rows : [],
        rangedResult.status === "fulfilled" ? rangedResult.value.rows : [],
        businessDate
      );
      const reason = failed.reason instanceof Error ? failed.reason.message : "Gingr request failed.";
      return {
        rows: partial.rows,
        syncedAt: new Date().toISOString(),
        stale: false,
        incomplete: true,
        error: `${checkedInResult.status === "rejected" ? "Checked-in" : "Reservation"} pull failed (${reason}); showing what Gingr returned.`,
        droppedMissingIdentity: partial.droppedMissingIdentity,
        coverageNote
      };
    }
    const checkedIn = checkedInResult.value;
    const ranged = rangedResult.value;
    const merged = mergeRosterSources(checkedIn.rows, ranged.rows, businessDate);
    const incomplete = checkedIn.incomplete || ranged.incomplete;
    cache = {
      at: Date.now(),
      businessDate,
      throughDate,
      rows: merged.rows,
      droppedMissingIdentity: merged.droppedMissingIdentity,
      pages: checkedIn.pages + ranged.pages
    };
    return {
      rows: merged.rows,
      syncedAt: new Date(cache.at).toISOString(),
      stale: false,
      incomplete,
      error: null,
      droppedMissingIdentity: merged.droppedMissingIdentity,
      coverageNote
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gingr roster request failed.";
    if (cache && cache.businessDate === businessDate) {
      return {
        rows: cache.rows,
        syncedAt: new Date(cache.at).toISOString(),
        stale: true,
        incomplete: true,
        error: message,
        droppedMissingIdentity: cache.droppedMissingIdentity,
        coverageNote
      };
    }
    return {
      rows: [],
      syncedAt: null,
      stale: true,
      incomplete: true,
      error: message,
      droppedMissingIdentity: 0,
      coverageNote
    };
  }
}

export function clearBodyCheckRosterCache() {
  cache = null;
}
