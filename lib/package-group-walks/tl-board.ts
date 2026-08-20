/**
 * Team Lead whiteboard projection of Package Group Walks.
 *
 * The whiteboard is display-only for this feature: it renders the same rows the
 * Package Group Walks page shows as pending, produced by the same canonical
 * service so the two screens cannot disagree.
 */
import { loadPackageGroupWalkState } from "./service";
import { loadCompletionsForBusinessDate, packageGroupWalkBusinessDate } from "./store";
import type {
  PackageGroupWalkRow,
  TlBoardPackageGroupWalkRow,
  TlBoardPackageGroupWalksSummary
} from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const EMPTY_PACKAGE_GROUP_WALKS_SUMMARY: TlBoardPackageGroupWalksSummary = {
  eligible: 0,
  remaining: 0,
  completed: 0
};

export function toTlBoardPackageGroupWalkRow(row: PackageGroupWalkRow): TlBoardPackageGroupWalkRow {
  return {
    id: row.id,
    gingrAnimalId: row.gingrAnimalId,
    dogName: row.dogName,
    photoUrl: row.photoUrl,
    packageKey: row.packageKey,
    packageName: row.packageName,
    checkedInAt: row.checkedInAt,
    businessDate: row.businessDate
  };
}

export type TlBoardPackageGroupWalksResult = {
  rows: TlBoardPackageGroupWalkRow[];
  summary: TlBoardPackageGroupWalksSummary;
  /** False when Gingr or the package source could not be evaluated this sync. */
  ok: boolean;
  error: string | null;
  packageSourceAvailable: boolean;
  packageSources: string[];
};

/** Build the whiteboard's Package Group Walks card from the canonical service. */
export async function syncTlBoardPackageGroupWalks(
  supabase: SupabaseClient,
  options?: { now?: Date }
): Promise<TlBoardPackageGroupWalksResult> {
  const state = await loadPackageGroupWalkState(supabase, { now: options?.now });
  return {
    rows: state.pending.map(toTlBoardPackageGroupWalkRow),
    summary: {
      eligible: state.summary.eligibleToday,
      remaining: state.summary.remaining,
      completed: state.summary.completed,
      lookup: {
        packageSourceAvailable: state.meta.packageSourceAvailable,
        sources: state.meta.packageSources,
        capturedIds: state.meta.capturedIds,
        uniqueCheckedInOwners: state.meta.uniqueCheckedInOwners,
        packageRowsInspected: state.meta.packageRowsInspected,
        qualifying: state.summary.eligibleToday,
        attempts: state.meta.attempts,
        ownerFieldNames: state.meta.ownerFieldNames
      }
    },
    ok: state.meta.gingrOk && state.meta.packageSourceAvailable && !state.meta.isStale,
    error: state.meta.lastError,
    packageSourceAvailable: state.meta.packageSourceAvailable,
    packageSources: state.meta.packageSources
  };
}

/**
 * Drop rows completed since the snapshot was written.
 *
 * The snapshot only refreshes on the Gingr sync cadence, but a completion has to
 * leave the TV promptly. Overlaying stored completions at read time makes removal
 * independent of the Gingr sync clock. Failure here is non-fatal: the row simply
 * stays until the next sync rather than the card going blank.
 */
export async function applyPackageGroupWalkCompletionsToRows(
  supabase: SupabaseClient,
  rows: TlBoardPackageGroupWalkRow[],
  options?: { now?: Date; businessDate?: string }
): Promise<{ rows: TlBoardPackageGroupWalkRow[]; completedCount: number }> {
  if (!rows.length) return { rows, completedCount: 0 };
  const businessDate = options?.businessDate ?? packageGroupWalkBusinessDate(options?.now);
  const completions = await loadCompletionsForBusinessDate(supabase, businessDate);
  if (!completions.size) return { rows, completedCount: 0 };

  const remaining = rows.filter(
    (row) => row.businessDate !== businessDate || !completions.has(row.gingrAnimalId)
  );
  return { rows: remaining, completedCount: rows.length - remaining.length };
}

/** Animal ids already completed today — the TV's fast removal pulse. */
export async function loadCompletedPackageGroupWalkAnimalIds(
  supabase: SupabaseClient,
  options?: { now?: Date }
): Promise<{ businessDate: string; completedAnimalIds: string[] }> {
  const businessDate = packageGroupWalkBusinessDate(options?.now);
  const completions = await loadCompletionsForBusinessDate(supabase, businessDate);
  return { businessDate, completedAnimalIds: [...completions.keys()] };
}
