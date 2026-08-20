/**
 * Persistence for Outstanding Packages CSV imports, eligibility records, and
 * Admin owner mappings. Service-role only — never exposed to the browser client.
 */
import type { PackageGroupWalkPackageKey } from "./eligible-packages";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const PACKAGE_ELIGIBILITY_IMPORTS_TABLE = "package_eligibility_imports";
export const PACKAGE_ELIGIBILITY_RECORDS_TABLE = "package_eligibility_records";
export const PACKAGE_OWNER_MAPPINGS_TABLE = "package_owner_mappings";

const MISSING_RELATION = new Set(["42P01", "PGRST205"]);

export class PackageEligibilitySchemaMissingError extends Error {
  constructor() {
    super(
      "Package eligibility tables are not available. Apply supabase/migrations/083_package_eligibility.sql in the production Supabase SQL editor. Do not reset the database."
    );
    this.name = "PackageEligibilitySchemaMissingError";
  }
}

function isMissingRelation(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_RELATION.has(error.code)) return true;
  return /package_eligibility_|schema cache|could not find the table|PGRST205/i.test(error.message ?? "");
}

export type PackageMatchStatus = "matched" | "ambiguous" | "unresolved" | "manual" | "skipped";

export type PackageEligibilityImport = {
  id: string;
  importedAt: string;
  importedBy: string | null;
  importedByName: string | null;
  filename: string;
  rowCount: number;
  eligibleRowCount: number;
  monthlyUnlimitedCount: number;
  twentyDayPlusCount: number;
  matchedCount: number;
  mappedCount: number;
  ambiguousCount: number;
  unresolvedCount: number;
  expiredCount: number;
  zeroRemainingCount: number;
  status: "pending" | "complete" | "failed";
  error: string | null;
};

export type PackageEligibilityRecord = {
  id: string;
  importId: string;
  gingrOwnerId: string | null;
  ownerDisplayName: string;
  normalizedOwnerName: string;
  packageKey: PackageGroupWalkPackageKey;
  packageType: string;
  numberRemaining: number | null;
  expiresAt: string | null;
  purchasedAt: string | null;
  location: string | null;
  expirationWasBlank: boolean;
  exclusionReason: "expired" | "zero_remaining" | null;
  matchStatus: PackageMatchStatus;
  source: string;
};

export type PackageOwnerMapping = {
  id: string;
  normalizedOwnerName: string;
  gingrOwnerId: string;
  status: "active" | "invalid";
  invalidReason: string | null;
};

export type PackageEligibilityInsert = {
  gingrOwnerId: string | null;
  ownerDisplayName: string;
  normalizedOwnerName: string;
  packageKey: PackageGroupWalkPackageKey;
  packageType: string;
  numberRemaining: number | null;
  expiresAt: string | null;
  purchasedAt: string | null;
  location: string | null;
  expirationWasBlank: boolean;
  exclusionReason: "expired" | "zero_remaining" | null;
  matchStatus: PackageMatchStatus;
  source?: string;
};

type ImportRow = {
  id: string;
  imported_at: string;
  imported_by: string | null;
  imported_by_name: string | null;
  filename: string;
  row_count: number;
  eligible_row_count: number;
  monthly_unlimited_count: number;
  twenty_day_plus_count: number;
  matched_count: number;
  mapped_count: number;
  ambiguous_count: number;
  unresolved_count: number;
  expired_count: number;
  zero_remaining_count: number;
  status: string;
  error: string | null;
};

type RecordRow = {
  id: string;
  import_id: string;
  gingr_owner_id: string | null;
  owner_display_name: string;
  normalized_owner_name: string;
  package_key: string;
  package_type: string;
  number_remaining: number | string | null;
  expires_at: string | null;
  purchased_at: string | null;
  location: string | null;
  expiration_was_blank: boolean;
  exclusion_reason: string | null;
  match_status: string;
  source: string;
};

function mapImport(row: ImportRow): PackageEligibilityImport {
  return {
    id: row.id,
    importedAt: row.imported_at,
    importedBy: row.imported_by,
    importedByName: row.imported_by_name,
    filename: row.filename,
    rowCount: Number(row.row_count) || 0,
    eligibleRowCount: Number(row.eligible_row_count) || 0,
    monthlyUnlimitedCount: Number(row.monthly_unlimited_count) || 0,
    twentyDayPlusCount: Number(row.twenty_day_plus_count) || 0,
    matchedCount: Number(row.matched_count) || 0,
    mappedCount: Number(row.mapped_count) || 0,
    ambiguousCount: Number(row.ambiguous_count) || 0,
    unresolvedCount: Number(row.unresolved_count) || 0,
    expiredCount: Number(row.expired_count) || 0,
    zeroRemainingCount: Number(row.zero_remaining_count) || 0,
    status: row.status === "failed" || row.status === "pending" ? row.status : "complete",
    error: row.error
  };
}

function mapRecord(row: RecordRow): PackageEligibilityRecord {
  return {
    id: row.id,
    importId: row.import_id,
    gingrOwnerId: row.gingr_owner_id,
    ownerDisplayName: row.owner_display_name,
    normalizedOwnerName: row.normalized_owner_name,
    packageKey: row.package_key as PackageGroupWalkPackageKey,
    packageType: row.package_type,
    numberRemaining: row.number_remaining == null ? null : Number(row.number_remaining),
    expiresAt: row.expires_at,
    purchasedAt: row.purchased_at,
    location: row.location,
    expirationWasBlank: Boolean(row.expiration_was_blank),
    exclusionReason:
      row.exclusion_reason === "expired" || row.exclusion_reason === "zero_remaining"
        ? row.exclusion_reason
        : null,
    matchStatus: row.match_status as PackageMatchStatus,
    source: row.source
  };
}

export async function loadLatestSuccessfulImport(
  supabase: SupabaseClient
): Promise<PackageEligibilityImport | null> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_IMPORTS_TABLE)
    .select(
      "id, imported_at, imported_by, imported_by_name, filename, row_count, eligible_row_count, monthly_unlimited_count, twenty_day_plus_count, matched_count, mapped_count, ambiguous_count, unresolved_count, expired_count, zero_remaining_count, status, error"
    )
    .eq("status", "complete")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to load package eligibility import.");
  }
  return data ? mapImport(data as ImportRow) : null;
}

export async function loadActiveEligibilityRecords(
  supabase: SupabaseClient,
  importId: string
): Promise<PackageEligibilityRecord[]> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_RECORDS_TABLE)
    .select(
      "id, import_id, gingr_owner_id, owner_display_name, normalized_owner_name, package_key, package_type, number_remaining, expires_at, purchased_at, location, expiration_was_blank, exclusion_reason, match_status, source"
    )
    .eq("import_id", importId)
    .is("exclusion_reason", null)
    .in("match_status", ["matched", "manual"]);

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to load package eligibility records.");
  }
  return ((data ?? []) as RecordRow[])
    .map(mapRecord)
    .filter((row) => Boolean(row.gingrOwnerId));
}

export async function loadReviewRecords(
  supabase: SupabaseClient,
  importId: string
): Promise<PackageEligibilityRecord[]> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_RECORDS_TABLE)
    .select(
      "id, import_id, gingr_owner_id, owner_display_name, normalized_owner_name, package_key, package_type, number_remaining, expires_at, purchased_at, location, expiration_was_blank, exclusion_reason, match_status, source"
    )
    .eq("import_id", importId)
    .is("exclusion_reason", null)
    .in("match_status", ["ambiguous", "unresolved"])
    .order("owner_display_name", { ascending: true });

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to load package owners that need review.");
  }
  return ((data ?? []) as RecordRow[]).map(mapRecord);
}

export async function loadActiveOwnerMappings(
  supabase: SupabaseClient
): Promise<PackageOwnerMapping[]> {
  const { data, error } = await supabase
    .from(PACKAGE_OWNER_MAPPINGS_TABLE)
    .select("id, normalized_owner_name, gingr_owner_id, status, invalid_reason")
    .eq("status", "active");

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to load package owner mappings.");
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    normalizedOwnerName: String(row.normalized_owner_name ?? ""),
    gingrOwnerId: String(row.gingr_owner_id ?? ""),
    status: row.status === "invalid" ? "invalid" : "active",
    invalidReason: row.invalid_reason == null ? null : String(row.invalid_reason)
  }));
}

export async function insertPackageEligibilityImport(
  supabase: SupabaseClient,
  input: {
    importedBy: string | null;
    importedByName: string | null;
    filename: string;
    rowCount: number;
    eligibleRowCount: number;
    monthlyUnlimitedCount: number;
    twentyDayPlusCount: number;
    matchedCount: number;
    mappedCount: number;
    ambiguousCount: number;
    unresolvedCount: number;
    expiredCount: number;
    zeroRemainingCount: number;
    status?: "complete" | "failed";
    error?: string | null;
  }
): Promise<PackageEligibilityImport> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_IMPORTS_TABLE)
    .insert({
      imported_by: input.importedBy,
      imported_by_name: input.importedByName,
      filename: input.filename,
      row_count: input.rowCount,
      eligible_row_count: input.eligibleRowCount,
      monthly_unlimited_count: input.monthlyUnlimitedCount,
      twenty_day_plus_count: input.twentyDayPlusCount,
      matched_count: input.matchedCount,
      mapped_count: input.mappedCount,
      ambiguous_count: input.ambiguousCount,
      unresolved_count: input.unresolvedCount,
      expired_count: input.expiredCount,
      zero_remaining_count: input.zeroRemainingCount,
      status: input.status ?? "complete",
      error: input.error ?? null
    })
    .select(
      "id, imported_at, imported_by, imported_by_name, filename, row_count, eligible_row_count, monthly_unlimited_count, twenty_day_plus_count, matched_count, mapped_count, ambiguous_count, unresolved_count, expired_count, zero_remaining_count, status, error"
    )
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to save package eligibility import.");
  }
  return mapImport(data as ImportRow);
}

export async function insertPackageEligibilityRecords(
  supabase: SupabaseClient,
  importId: string,
  records: PackageEligibilityInsert[]
): Promise<void> {
  if (!records.length) return;
  const chunkSize = 500;
  for (let offset = 0; offset < records.length; offset += chunkSize) {
    const chunk = records.slice(offset, offset + chunkSize).map((row) => ({
      import_id: importId,
      gingr_owner_id: row.gingrOwnerId,
      owner_display_name: row.ownerDisplayName,
      normalized_owner_name: row.normalizedOwnerName,
      package_key: row.packageKey,
      package_type: row.packageType,
      number_remaining: row.numberRemaining,
      expires_at: row.expiresAt,
      purchased_at: row.purchasedAt,
      location: row.location,
      expiration_was_blank: row.expirationWasBlank,
      exclusion_reason: row.exclusionReason,
      match_status: row.matchStatus,
      source: row.source ?? "csv"
    }));
    const { error } = await supabase.from(PACKAGE_ELIGIBILITY_RECORDS_TABLE).insert(chunk);
    if (error) {
      if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
      throw new Error(error.message || "Unable to save package eligibility records.");
    }
  }
}

export async function upsertOwnerMapping(
  supabase: SupabaseClient,
  input: {
    normalizedOwnerName: string;
    gingrOwnerId: string;
    createdBy: string | null;
  }
): Promise<PackageOwnerMapping> {
  const { data, error } = await supabase
    .from(PACKAGE_OWNER_MAPPINGS_TABLE)
    .upsert(
      {
        normalized_owner_name: input.normalizedOwnerName,
        gingr_owner_id: input.gingrOwnerId,
        status: "active",
        invalid_reason: null,
        created_by: input.createdBy,
        updated_at: new Date().toISOString()
      },
      { onConflict: "normalized_owner_name" }
    )
    .select("id, normalized_owner_name, gingr_owner_id, status, invalid_reason")
    .single();

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to save owner mapping.");
  }
  return {
    id: String(data.id),
    normalizedOwnerName: String(data.normalized_owner_name),
    gingrOwnerId: String(data.gingr_owner_id),
    status: data.status === "invalid" ? "invalid" : "active",
    invalidReason: data.invalid_reason == null ? null : String(data.invalid_reason)
  };
}

export async function markOwnerMappingInvalid(
  supabase: SupabaseClient,
  normalizedOwnerName: string,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from(PACKAGE_OWNER_MAPPINGS_TABLE)
    .update({ status: "invalid", invalid_reason: reason, updated_at: new Date().toISOString() })
    .eq("normalized_owner_name", normalizedOwnerName);
  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to invalidate owner mapping.");
  }
}

export async function applyManualMappingToImport(
  supabase: SupabaseClient,
  importId: string,
  normalizedOwnerName: string,
  gingrOwnerId: string
): Promise<number> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_RECORDS_TABLE)
    .update({
      gingr_owner_id: gingrOwnerId,
      match_status: "manual",
      source: "manual_mapping"
    })
    .eq("import_id", importId)
    .eq("normalized_owner_name", normalizedOwnerName)
    .is("exclusion_reason", null)
    .select("id");

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to apply owner mapping.");
  }
  return data?.length ?? 0;
}

export async function recountImportMatches(
  supabase: SupabaseClient,
  importId: string
): Promise<void> {
  const { data, error } = await supabase
    .from(PACKAGE_ELIGIBILITY_RECORDS_TABLE)
    .select("match_status, exclusion_reason")
    .eq("import_id", importId)
    .is("exclusion_reason", null);

  if (error) {
    if (isMissingRelation(error)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(error.message || "Unable to recount package eligibility matches.");
  }

  let matched = 0;
  let mapped = 0;
  let ambiguous = 0;
  let unresolved = 0;
  for (const row of (data ?? []) as Array<{ match_status: string }>) {
    if (row.match_status === "matched") matched += 1;
    else if (row.match_status === "manual") mapped += 1;
    else if (row.match_status === "ambiguous") ambiguous += 1;
    else if (row.match_status === "unresolved") unresolved += 1;
  }

  const { error: updateError } = await supabase
    .from(PACKAGE_ELIGIBILITY_IMPORTS_TABLE)
    .update({
      matched_count: matched,
      mapped_count: mapped,
      ambiguous_count: ambiguous,
      unresolved_count: unresolved
    })
    .eq("id", importId);

  if (updateError) {
    if (isMissingRelation(updateError)) throw new PackageEligibilitySchemaMissingError();
    throw new Error(updateError.message || "Unable to update import summary.");
  }
}

export async function probePackageEligibilityTables(
  supabase: SupabaseClient
): Promise<{ status: "applied" | "not_applied" | "unable_to_verify"; message: string }> {
  try {
    const { error } = await supabase
      .from(PACKAGE_ELIGIBILITY_IMPORTS_TABLE)
      .select("id", { count: "exact", head: true });
    if (!error) {
      return { status: "applied", message: "package eligibility tables are present." };
    }
    if (isMissingRelation(error) || /schema cache|could not find the table/i.test(error.message ?? "")) {
      return {
        status: "not_applied",
        message:
          "Package eligibility tables are missing. Apply supabase/migrations/083_package_eligibility.sql."
      };
    }
    return { status: "unable_to_verify", message: "Package eligibility table probe failed." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    if (/does not exist|schema cache|PGRST205|42P01/i.test(message)) {
      return {
        status: "not_applied",
        message:
          "Package eligibility tables are missing. Apply supabase/migrations/083_package_eligibility.sql."
      };
    }
    return { status: "unable_to_verify", message };
  }
}
