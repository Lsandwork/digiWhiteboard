/**
 * Package Group Walk completion persistence.
 *
 * Only completions are stored. "Pending" is derived from live Gingr check-in
 * state, so a stored row can never resurrect a checked-out dog on the board.
 */
import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import type { PackageGroupWalkPackageKey } from "./eligible-packages";
import type { PackageGroupWalkCompletion } from "./types";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const PACKAGE_GROUP_WALKS_TABLE = "package_group_walks";
export const PACKAGE_GROUP_WALK_TYPE = "package_group_walk";

/** Postgres unique_violation — another request won the same completion race. */
const UNIQUE_VIOLATION = "23505";
/** Table/relation missing (migration not applied yet). */
const MISSING_RELATION = new Set(["42P01", "PGRST205"]);

const SELECT_COLUMNS =
  "id, business_date, gingr_animal_id, dog_name, gingr_owner_id, owner_name, package_key, package_name, completed_at, completed_by_user_id, completed_by_user_name, status";

type CompletionRow = {
  id: string;
  business_date: string;
  gingr_animal_id: string;
  dog_name: string;
  gingr_owner_id: string | null;
  owner_name: string | null;
  package_key: string;
  package_name: string;
  completed_at: string;
  completed_by_user_id: string | null;
  completed_by_user_name: string | null;
  status: string;
};

export class PackageGroupWalksSchemaMissingError extends Error {
  constructor() {
    super("package_group_walks table is not available. Apply migration 082_package_group_walks.sql.");
    this.name = "PackageGroupWalksSchemaMissingError";
  }
}

export type PackageGroupWalksTableStatus = "applied" | "not_applied" | "unable_to_verify";

/** Probe whether migration 082 created `package_group_walks`. Never returns row data. */
export async function probePackageGroupWalksTable(
  supabase: SupabaseClient
): Promise<{ status: PackageGroupWalksTableStatus; message: string }> {
  try {
    const { error } = await supabase.from(PACKAGE_GROUP_WALKS_TABLE).select("id").limit(1);
    if (!error) {
      return { status: "applied", message: "package_group_walks table is present." };
    }
    if (isMissingRelation(error)) {
      return {
        status: "not_applied",
        message: "package_group_walks table is missing. Apply supabase/migrations/082_package_group_walks.sql."
      };
    }
    return {
      status: "unable_to_verify",
      message: "Could not confirm package_group_walks without exposing database internals."
    };
  } catch {
    return {
      status: "unable_to_verify",
      message: "Could not confirm package_group_walks without exposing database internals."
    };
  }
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_RELATION.has(error.code)) return true;
  return /relation .*package_group_walks.* does not exist/i.test(error.message ?? "");
}

function mapRow(row: CompletionRow): PackageGroupWalkCompletion {
  return {
    id: row.id,
    businessDate: row.business_date,
    gingrAnimalId: String(row.gingr_animal_id),
    dogName: row.dog_name,
    photoUrl: null,
    gingrOwnerId: row.gingr_owner_id,
    ownerName: row.owner_name,
    packageKey: row.package_key as PackageGroupWalkPackageKey,
    packageName: row.package_name,
    completedAt: row.completed_at,
    completedByUserId: row.completed_by_user_id,
    completedByUserName: row.completed_by_user_name || "Staff"
  };
}

/** Fitdog business date (America/Los_Angeles) — never UTC truncation. */
export function packageGroupWalkBusinessDate(now = new Date()): string {
  return todayInLosAngeles(now);
}

/**
 * Today's completions keyed by Gingr animal id.
 * One indexed query — never one per dog.
 */
export async function loadCompletionsForBusinessDate(
  supabase: SupabaseClient,
  businessDate: string
): Promise<Map<string, PackageGroupWalkCompletion>> {
  const { data, error } = await supabase
    .from(PACKAGE_GROUP_WALKS_TABLE)
    .select(SELECT_COLUMNS)
    .eq("business_date", businessDate)
    .eq("walk_type", PACKAGE_GROUP_WALK_TYPE)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error) {
    if (isMissingRelation(error)) throw new PackageGroupWalksSchemaMissingError();
    throw new Error(error.message || "Unable to load Package Group Walk completions.");
  }

  const map = new Map<string, PackageGroupWalkCompletion>();
  for (const row of (data ?? []) as CompletionRow[]) {
    const completion = mapRow(row);
    if (!map.has(completion.gingrAnimalId)) map.set(completion.gingrAnimalId, completion);
  }
  return map;
}

export type CompletePackageGroupWalkInput = {
  businessDate: string;
  gingrAnimalId: string;
  dogName: string;
  gingrOwnerId: string | null;
  ownerName: string | null;
  gingrReservationId: string | null;
  gingrCheckedInAt: string | null;
  packageKey: PackageGroupWalkPackageKey;
  packageName: string;
  gingrPackageId: string | null;
  completedByUserId: string | null;
  completedByUserName: string;
  completedByUserEmail: string | null;
  source?: string;
};

export type CompletePackageGroupWalkResult = {
  completion: PackageGroupWalkCompletion;
  /** False when an equivalent completion already existed (idempotent replay). */
  created: boolean;
};

async function findExistingCompletion(
  supabase: SupabaseClient,
  businessDate: string,
  gingrAnimalId: string
): Promise<PackageGroupWalkCompletion | null> {
  const { data, error } = await supabase
    .from(PACKAGE_GROUP_WALKS_TABLE)
    .select(SELECT_COLUMNS)
    .eq("business_date", businessDate)
    .eq("gingr_animal_id", gingrAnimalId)
    .eq("walk_type", PACKAGE_GROUP_WALK_TYPE)
    .eq("status", "completed")
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new PackageGroupWalksSchemaMissingError();
    throw new Error(error.message || "Unable to read Package Group Walk completion.");
  }
  return data ? mapRow(data as CompletionRow) : null;
}

/**
 * Record a completion exactly once per (business date, dog, walk type).
 *
 * Atomicity comes from the partial unique index, not from client-side guards:
 * concurrent writers both INSERT, the loser gets 23505, and we return the winning
 * row. Replays therefore return the existing completion instead of erroring.
 */
export async function completePackageGroupWalk(
  supabase: SupabaseClient,
  input: CompletePackageGroupWalkInput
): Promise<CompletePackageGroupWalkResult> {
  const payload = {
    business_date: input.businessDate,
    walk_type: PACKAGE_GROUP_WALK_TYPE,
    gingr_animal_id: input.gingrAnimalId,
    dog_name: input.dogName,
    gingr_owner_id: input.gingrOwnerId,
    owner_name: input.ownerName,
    gingr_reservation_id: input.gingrReservationId,
    gingr_checked_in_at: input.gingrCheckedInAt,
    package_key: input.packageKey,
    package_name: input.packageName,
    gingr_package_id: input.gingrPackageId,
    status: "completed" as const,
    completed_by_user_id: input.completedByUserId,
    completed_by_user_name: input.completedByUserName,
    completed_by_user_email: input.completedByUserEmail,
    source: input.source ?? "ruffops_web"
  };

  const { data, error } = await supabase
    .from(PACKAGE_GROUP_WALKS_TABLE)
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (!error && data) {
    return { completion: mapRow(data as CompletionRow), created: true };
  }

  if (error && isMissingRelation(error)) throw new PackageGroupWalksSchemaMissingError();

  if (error?.code === UNIQUE_VIOLATION) {
    const existing = await findExistingCompletion(supabase, input.businessDate, input.gingrAnimalId);
    if (existing) return { completion: existing, created: false };
  }

  throw new Error(error?.message || "Unable to record the Package Group Walk completion.");
}

/** Completion history for one dog, newest business date first. */
export async function listPackageGroupWalkHistory(
  supabase: SupabaseClient,
  gingrAnimalId: string,
  limit = 30
): Promise<PackageGroupWalkCompletion[]> {
  const { data, error } = await supabase
    .from(PACKAGE_GROUP_WALKS_TABLE)
    .select(SELECT_COLUMNS)
    .eq("gingr_animal_id", gingrAnimalId)
    .eq("walk_type", PACKAGE_GROUP_WALK_TYPE)
    .order("business_date", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingRelation(error)) throw new PackageGroupWalksSchemaMissingError();
    throw new Error(error.message || "Unable to load Package Group Walk history.");
  }
  return ((data ?? []) as CompletionRow[]).map(mapRow);
}
