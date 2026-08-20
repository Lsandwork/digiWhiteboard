/**
 * Canonical Package Group Walk qualification service.
 *
 * Both the Package Group Walks page and the Team Lead whiteboard consume this
 * module. The rules live here exactly once so the two screens can never disagree.
 *
 *   CURRENTLY CHECKED IN IN GINGR
 * + OWNER HOLDS AN ELIGIBLE PACKAGE
 * + NOT ALREADY COMPLETED FOR THE FITDOG BUSINESS DATE
 * = NEEDS GROUP WALK
 */
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { enrichTlBoardAnimalPhotoUrls } from "@/lib/tl-digi-board/animal-photos";
import { loadTlBoardCheckedInReservations } from "@/lib/tl-digi-board/gingr-reservation-services";
import { preferredEligiblePackage } from "./eligible-packages";
import {
  buildOwnerPackageIndex,
  ownerIdFromReservation,
  ownerNameFromReservation,
  packagesFromReservation,
  type OwnerPackageIndex,
  type ResolvedOwnerPackage
} from "./gingr-packages";
import { logPackageGroupWalkEvent } from "./observability";
import {
  loadCompletionsForBusinessDate,
  packageGroupWalkBusinessDate,
  PackageGroupWalksSchemaMissingError
} from "./store";
import type {
  PackageGroupWalkCompletion,
  PackageGroupWalkEligibility,
  PackageGroupWalkMeta,
  PackageGroupWalkRow,
  PackageGroupWalkState,
  PackageGroupWalkSummary
} from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

/** Shared across the page and the whiteboard so one Gingr pull serves both. */
const ELIGIBILITY_CACHE_KEY = "package-group-walks:eligibility";
export const PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_TTL_MS = 20_000;
/** Serving rows from a sync older than this is labelled STALE, never LIVE. */
export const PACKAGE_GROUP_WALK_STALE_MS = 120_000;

/** Last successful eligibility read, so a Gingr outage never renders "All Clear". */
let lastGoodEligibility: {
  eligibility: PackageGroupWalkEligibility[];
  syncedAt: string;
  packageSources: string[];
  checkedInDogCount: number;
  uniqueCheckedInOwners: number;
  packageRowsInspected: number;
  capturedIds: PackageGroupWalkMeta["capturedIds"];
} | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

/** Gingr check-in stamps are unix seconds in some payloads and ISO strings in others. */
export function normalizeCheckInTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number" || /^\d+$/.test(String(value).trim())) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    // Values below ~1e12 are seconds; above are already milliseconds.
    const ms = seconds < 1_000_000_000_000 ? seconds * 1000 : seconds;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dogFromReservation(reservation: GingrReservation) {
  const record = reservation as Record<string, unknown>;
  const animalField = record.animal ?? record.pet ?? record.dog;
  const animal =
    asRecord(animalField) ||
    (typeof animalField === "string" || typeof animalField === "number" ? { id: animalField } : null);

  const gingrAnimalId = pickString(
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
    record.a_name
  );
  const photoUrl = pickString(
    animal?.image,
    animal?.image_url,
    animal?.photo_url,
    record.a_image,
    record.photo_url,
    record.image_url
  );
  const checkedInAt = normalizeCheckInTimestamp(
    record.check_in_stamp ?? record.check_in_date ?? record.checked_in_at
  );

  return { gingrAnimalId, dogName, photoUrl, checkedInAt };
}

/**
 * Pure eligibility projection — the testable core.
 * One row per qualifying dog (never collapsed by owner) and never duplicated when
 * Gingr returns the same animal on more than one reservation.
 */
export function buildPackageGroupWalkEligibility(input: {
  reservations: GingrReservation[];
  packageIndex: OwnerPackageIndex;
  businessDate: string;
}): { eligibility: PackageGroupWalkEligibility[]; malformedCount: number } {
  const byAnimal = new Map<string, PackageGroupWalkEligibility>();
  let malformedCount = 0;

  for (const reservation of input.reservations) {
    let dog: ReturnType<typeof dogFromReservation>;
    try {
      dog = dogFromReservation(reservation);
    } catch {
      malformedCount += 1;
      continue;
    }

    // A malformed single record must never break the whole list.
    if (!dog.gingrAnimalId || !dog.dogName) {
      malformedCount += 1;
      continue;
    }

    const ownerId = ownerIdFromReservation(reservation);
    const matches: ResolvedOwnerPackage[] = [
      ...packagesFromReservation(reservation),
      ...(ownerId ? (input.packageIndex.byOwnerId.get(ownerId) ?? []) : [])
    ];
    if (!matches.length) continue;

    const preferred = preferredEligiblePackage(matches.map((entry) => entry.definition));
    if (!preferred) continue;
    const chosen = matches.find((entry) => entry.definition.key === preferred.key) ?? matches[0];

    const existing = byAnimal.get(dog.gingrAnimalId);
    // Duplicate Gingr payloads collapse to one row; keep the earliest check-in.
    if (existing) {
      if (
        dog.checkedInAt &&
        (!existing.checkedInAt || dog.checkedInAt < existing.checkedInAt)
      ) {
        existing.checkedInAt = dog.checkedInAt;
      }
      if (!existing.photoUrl && dog.photoUrl) existing.photoUrl = dog.photoUrl;
      continue;
    }

    byAnimal.set(dog.gingrAnimalId, {
      id: `${input.businessDate}:${dog.gingrAnimalId}`,
      gingrAnimalId: dog.gingrAnimalId,
      dogName: dog.dogName,
      photoUrl: dog.photoUrl,
      gingrOwnerId: ownerId,
      ownerName: ownerNameFromReservation(reservation),
      gingrReservationId: pickString(
        (reservation as Record<string, unknown>).reservation_id,
        (reservation as Record<string, unknown>).id
      ),
      checkedInAt: dog.checkedInAt,
      packageKey: preferred.key,
      packageName: preferred.displayName,
      gingrPackageId: chosen.gingrPackageId,
      packageSource: chosen.source,
      businessDate: input.businessDate
    });
  }

  return { eligibility: sortEligibility([...byAnimal.values()]), malformedCount };
}

/** Stable order: earliest check-in first, then dog name. Never reshuffles on refresh. */
export function sortEligibility<T extends { checkedInAt: string | null; dogName: string }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const aTime = a.checkedInAt ?? "";
    const bTime = b.checkedInAt ?? "";
    if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1;
    if (aTime && !bTime) return -1;
    if (!aTime && bTime) return 1;
    return a.dogName.localeCompare(b.dogName);
  });
}

/** Overlay stored completions onto live eligibility. Pure and shared by both screens. */
export function applyPackageGroupWalkCompletions(input: {
  eligibility: PackageGroupWalkEligibility[];
  completions: Map<string, PackageGroupWalkCompletion>;
}): { pending: PackageGroupWalkRow[]; completed: PackageGroupWalkCompletion[] } {
  const pending: PackageGroupWalkRow[] = [];
  const completed: PackageGroupWalkCompletion[] = [];
  const seenCompletions = new Set<string>();

  for (const row of input.eligibility) {
    const completion = input.completions.get(row.gingrAnimalId) ?? null;
    if (completion) {
      seenCompletions.add(completion.gingrAnimalId);
      completed.push({ ...completion, photoUrl: completion.photoUrl ?? row.photoUrl });
      continue;
    }
    pending.push({ ...row, status: "pending", completion: null });
  }

  // Completions for dogs already checked out stay in Completed Today for accountability.
  for (const [animalId, completion] of input.completions) {
    if (seenCompletions.has(animalId)) continue;
    completed.push(completion);
  }

  completed.sort((a, b) => (a.completedAt < b.completedAt ? 1 : a.completedAt > b.completedAt ? -1 : 0));
  return { pending, completed };
}

export function buildPackageGroupWalkSummary(input: {
  pending: PackageGroupWalkRow[];
  completed: PackageGroupWalkCompletion[];
}): PackageGroupWalkSummary {
  return {
    eligibleToday: input.pending.length + input.completed.length,
    remaining: input.pending.length,
    completed: input.completed.length
  };
}

export function resolvePackageGroupWalkSyncState(input: {
  gingrOk: boolean;
  isStale: boolean;
  packageSourceAvailable: boolean;
  hasRows: boolean;
  lastSuccessfulSyncAt: string | null;
}): PackageGroupWalkMeta["syncState"] {
  if (!input.gingrOk) {
    // Never claim ALL CLEAR from a failed read.
    return input.lastSuccessfulSyncAt ? "STALE" : "ERROR";
  }
  if (input.isStale) return "STALE";
  // Zero rows is only meaningful when a package source actually answered.
  if (!input.packageSourceAvailable) return "ERROR";
  return input.hasRows ? "LIVE" : "EMPTY_VALID";
}

async function loadEligibilityFromGingr(businessDate: string): Promise<{
  eligibility: PackageGroupWalkEligibility[];
  packageSources: string[];
  packageSourceAvailable: boolean;
  checkedInDogCount: number;
  uniqueCheckedInOwners: number;
  packageRowsInspected: number;
  capturedIds: PackageGroupWalkMeta["capturedIds"];
  errors: string[];
}> {
  const reservations = await loadTlBoardCheckedInReservations();
  const packageIndex = await buildOwnerPackageIndex(reservations);
  const { eligibility, malformedCount } = buildPackageGroupWalkEligibility({
    reservations,
    packageIndex,
    businessDate
  });

  if (malformedCount > 0) {
    logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_ELIGIBILITY_MISMATCH", {
      businessDate,
      malformedCount,
      reservationCount: reservations.length
    });
  }

  let withPhotos = eligibility;
  if (eligibility.length) {
    try {
      const photoByAnimal = await enrichTlBoardAnimalPhotoUrls(eligibility);
      withPhotos = eligibility.map((row) => ({
        ...row,
        photoUrl: row.photoUrl || photoByAnimal.get(row.gingrAnimalId) || null
      }));
    } catch {
      // Photos are cosmetic — never fail eligibility because an image lookup failed.
    }
  }

  return {
    eligibility: withPhotos,
    packageSources: packageIndex.sources,
    packageSourceAvailable: packageIndex.available,
    checkedInDogCount: reservations.length,
    uniqueCheckedInOwners: packageIndex.uniqueCheckedInOwners,
    packageRowsInspected: packageIndex.packageRowsInspected,
    capturedIds: packageIndex.capturedIds,
    errors: packageIndex.errors
  };
}

export type LoadPackageGroupWalkStateOptions = {
  now?: Date;
  forceRefresh?: boolean;
};

/**
 * Full Package Group Walk state: live Gingr eligibility overlaid with today's
 * stored completions. On Gingr failure the last successful eligibility list is
 * returned marked STALE — an outage must never look like "nothing to do".
 */
export async function loadPackageGroupWalkState(
  supabase: SupabaseClient,
  options: LoadPackageGroupWalkStateOptions = {}
): Promise<PackageGroupWalkState> {
  const now = options.now ?? new Date();
  const businessDate = packageGroupWalkBusinessDate(now);
  const attemptedAt = now.toISOString();

  const completionsPromise = loadCompletionsForBusinessDate(supabase, businessDate);

  let gingrOk = false;
  let lastError: string | null = null;
  let eligibility: PackageGroupWalkEligibility[] = [];
  let packageSources: string[] = [];
  let packageSourceAvailable = false;
  let checkedInDogCount = 0;
  let uniqueCheckedInOwners = 0;
  let packageRowsInspected = 0;
  let capturedIds: PackageGroupWalkMeta["capturedIds"] = {
    monthly_unlimited: null,
    twenty_day_plus: null
  };
  let lastSuccessfulSyncAt: string | null = lastGoodEligibility?.syncedAt ?? null;

  try {
    const loader = () => loadEligibilityFromGingr(businessDate);
    const result = options.forceRefresh
      ? await loader()
      : await getOrLoadTtlCache(
          `${ELIGIBILITY_CACHE_KEY}:${businessDate}`,
          PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_TTL_MS,
          loader
        );

    gingrOk = true;
    eligibility = result.eligibility;
    packageSources = result.packageSources;
    packageSourceAvailable = result.packageSourceAvailable;
    checkedInDogCount = result.checkedInDogCount;
    uniqueCheckedInOwners = result.uniqueCheckedInOwners;
    packageRowsInspected = result.packageRowsInspected;
    capturedIds = result.capturedIds;
    lastError = result.errors.length ? result.errors.join("; ") : null;
    lastSuccessfulSyncAt = attemptedAt;
    lastGoodEligibility = {
      eligibility,
      syncedAt: attemptedAt,
      packageSources,
      checkedInDogCount,
      uniqueCheckedInOwners,
      packageRowsInspected,
      capturedIds
    };

    logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_SYNC_SUCCESS", {
      businessDate,
      eligibleCount: eligibility.length,
      checkedInDogCount,
      uniqueCheckedInOwners,
      packageRowsInspected,
      packageSources,
      capturedIds,
      packageSourceAvailable,
      warning: lastError
    });
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Package Group Walk sync failed.";
    logPackageGroupWalkEvent("PACKAGE_GROUP_WALK_SYNC_FAILURE", {
      businessDate,
      error: lastError,
      hadPrevious: Boolean(lastGoodEligibility)
    });

    if (lastGoodEligibility) {
      eligibility = lastGoodEligibility.eligibility;
      packageSources = lastGoodEligibility.packageSources;
      packageSourceAvailable = true;
      checkedInDogCount = lastGoodEligibility.checkedInDogCount;
      uniqueCheckedInOwners = lastGoodEligibility.uniqueCheckedInOwners;
      packageRowsInspected = lastGoodEligibility.packageRowsInspected;
      capturedIds = lastGoodEligibility.capturedIds;
      lastSuccessfulSyncAt = lastGoodEligibility.syncedAt;
    }
  }

  let completions: Map<string, PackageGroupWalkCompletion>;
  try {
    completions = await completionsPromise;
  } catch (error) {
    if (error instanceof PackageGroupWalksSchemaMissingError) throw error;
    // Without completion data we cannot prove a dog is done — keep the rows
    // pending rather than silently hiding work, and surface the failure.
    completions = new Map();
    const message = error instanceof Error ? error.message : "Completion lookup failed.";
    lastError = lastError ? `${lastError}; ${message}` : message;
  }

  const { pending, completed } = applyPackageGroupWalkCompletions({ eligibility, completions });
  const summary = buildPackageGroupWalkSummary({ pending, completed });

  const isStale =
    !gingrOk ||
    (lastSuccessfulSyncAt
      ? now.getTime() - new Date(lastSuccessfulSyncAt).getTime() > PACKAGE_GROUP_WALK_STALE_MS
      : false);

  const meta: PackageGroupWalkMeta = {
    timezone: "America/Los_Angeles",
    businessDate,
    syncState: resolvePackageGroupWalkSyncState({
      gingrOk,
      isStale,
      packageSourceAvailable,
      hasRows: pending.length > 0 || completed.length > 0,
      lastSuccessfulSyncAt
    }),
    lastSuccessfulSyncAt,
    lastAttemptAt: attemptedAt,
    lastError,
    gingrOk,
    isStale,
    packageSourceAvailable,
    packageSources,
    checkedInDogCount,
    uniqueCheckedInOwners,
    packageRowsInspected,
    capturedIds
  };

  return { pending, completed, summary, meta, generatedAt: attemptedAt };
}

/**
 * Server-side eligibility check for one dog before recording a completion.
 * The browser claiming a dog is eligible is never sufficient.
 */
export async function findEligibleDogForCompletion(
  supabase: SupabaseClient,
  gingrAnimalId: string,
  options: LoadPackageGroupWalkStateOptions = {}
): Promise<PackageGroupWalkEligibility | null> {
  const state = await loadPackageGroupWalkState(supabase, options);
  const pending = state.pending.find((row) => row.gingrAnimalId === gingrAnimalId);
  return pending ?? null;
}

/** Test helper — clears the module-level last-known-good eligibility cache. */
export function __resetPackageGroupWalkLastGoodForTests() {
  lastGoodEligibility = null;
}
