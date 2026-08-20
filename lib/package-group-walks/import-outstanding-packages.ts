/**
 * Outstanding Packages CSV import: parse, validate, resolve owners, persist.
 * Uses GET /api/v1/owners + package_owner_mappings. No Partner API.
 */
import { invalidateTtlCache } from "@/lib/server-ttl-cache";
import { parseOutstandingPackagesCsv, type OutstandingPackageCsvRow } from "./csv-parse";
import { classifyCsvOwnerName, normalizeOwnerName } from "./csv-owner-resolution";
import { matchConfigurableEligiblePackage, evaluatePackageValidity } from "./package-validity";
import { loadGingrOwnerDirectory, type GingrOwnerDirectory } from "./owner-directory";
import {
  insertPackageEligibilityImport,
  insertPackageEligibilityRecords,
  loadActiveOwnerMappings,
  markOwnerMappingInvalid,
  type PackageEligibilityInsert,
  type PackageEligibilityImport
} from "./eligibility-store";

type SupabaseClient = ReturnType<typeof import("@/lib/supabase/server").getServiceSupabase>;

export const PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_PREFIX = "package-group-walks:eligibility";

export type OutstandingPackagesImportSummary = {
  totalCsvRows: number;
  eligiblePackageRows: number;
  monthlyUnlimited: number;
  twentyDayPlus: number;
  matchedAutomatically: number;
  matchedBySavedMapping: number;
  ambiguous: number;
  unresolved: number;
  expired: number;
  zeroRemaining: number;
  lastSync: string;
  importId: string;
  filename: string;
};

export type ImportOutstandingPackagesResult = {
  ok: true;
  import: PackageEligibilityImport;
  summary: OutstandingPackagesImportSummary;
};

function emptyInsertBase(row: {
  ownerDisplayName: string;
  packageType: string;
  location: string;
}): Pick<
  PackageEligibilityInsert,
  "ownerDisplayName" | "normalizedOwnerName" | "packageType" | "location" | "source"
> {
  return {
    ownerDisplayName: row.ownerDisplayName.trim(),
    normalizedOwnerName: normalizeOwnerName(row.ownerDisplayName),
    packageType: row.packageType.trim(),
    location: row.location.trim() || null,
    source: "csv"
  };
}

export type ResolvedCsvImport = {
  records: PackageEligibilityInsert[];
  counts: Omit<OutstandingPackagesImportSummary, "lastSync" | "importId" | "filename">;
  invalidMappings: string[];
};

export function resolveOutstandingPackageRows(input: {
  rows: OutstandingPackageCsvRow[];
  directory: GingrOwnerDirectory;
  mappings: Array<{ normalizedOwnerName: string; gingrOwnerId: string }>;
  now?: Date;
}): ResolvedCsvImport {
  const mappingByName = new Map(input.mappings.map((row) => [row.normalizedOwnerName, row]));
  const records: PackageEligibilityInsert[] = [];
  const invalidMappings: string[] = [];
  let monthlyUnlimited = 0;
  let twentyDayPlus = 0;
  let matchedAutomatically = 0;
  let matchedBySavedMapping = 0;
  let ambiguous = 0;
  let unresolved = 0;
  let expired = 0;
  let zeroRemaining = 0;
  let eligiblePackageRows = 0;

  for (const row of input.rows) {
    const definition = matchConfigurableEligiblePackage(row.packageType);
    if (!definition) continue;
    eligiblePackageRows += 1;
    if (definition.key === "monthly_unlimited") monthlyUnlimited += 1;
    else twentyDayPlus += 1;

    const validity = evaluatePackageValidity({
      numberRemainingRaw: row.numberRemainingRaw,
      expiresAtRaw: row.expiresAtRaw,
      purchasedAtRaw: row.purchasedAtRaw,
      now: input.now
    });
    const base = emptyInsertBase(row);
    const shared: PackageEligibilityInsert = {
      ...base,
      gingrOwnerId: null,
      packageKey: definition.key,
      numberRemaining: validity.remaining,
      expiresAt: validity.expiresOn,
      purchasedAt: validity.purchasedOn,
      expirationWasBlank: validity.expirationWasBlank,
      exclusionReason: validity.exclusionReason,
      matchStatus: "skipped"
    };

    if (validity.exclusionReason === "expired") {
      expired += 1;
      records.push(shared);
      continue;
    }
    if (validity.exclusionReason === "zero_remaining") {
      zeroRemaining += 1;
      records.push(shared);
      continue;
    }

    const mapping = mappingByName.get(base.normalizedOwnerName);
    if (mapping) {
      const mappedOwner = input.directory.byId.get(mapping.gingrOwnerId);
      if (mappedOwner) {
        matchedBySavedMapping += 1;
        records.push({
          ...shared,
          gingrOwnerId: mapping.gingrOwnerId,
          matchStatus: "manual",
          source: "manual_mapping"
        });
        continue;
      }
      invalidMappings.push(mapping.normalizedOwnerName);
      mappingByName.delete(mapping.normalizedOwnerName);
    }

    const classified = classifyCsvOwnerName(base.ownerDisplayName, input.directory.byFullName);
    if (classified.classification === "UNIQUE_EXACT_MATCH") {
      matchedAutomatically += 1;
      records.push({
        ...shared,
        gingrOwnerId: classified.ownerIds[0] ?? null,
        matchStatus: "matched"
      });
      continue;
    }
    if (classified.classification === "MULTIPLE_EXACT_MATCH") {
      ambiguous += 1;
      records.push({ ...shared, matchStatus: "ambiguous" });
      continue;
    }
    unresolved += 1;
    records.push({ ...shared, matchStatus: "unresolved" });
  }

  return {
    records,
    invalidMappings,
    counts: {
      totalCsvRows: input.rows.length,
      eligiblePackageRows,
      monthlyUnlimited,
      twentyDayPlus,
      matchedAutomatically,
      matchedBySavedMapping,
      ambiguous,
      unresolved,
      expired,
      zeroRemaining
    }
  };
}

export async function importOutstandingPackagesCsv(input: {
  supabase: SupabaseClient;
  csvText: string;
  filename: string;
  importedBy: string | null;
  importedByName: string | null;
  now?: Date;
  directory?: GingrOwnerDirectory;
}): Promise<ImportOutstandingPackagesResult> {
  const parsed = parseOutstandingPackagesCsv(input.csvText);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  const directory = input.directory ?? (await loadGingrOwnerDirectory());
  if (directory.error && !directory.owners.length) {
    throw new Error("Unable to load Gingr owners for package matching.");
  }

  const mappings = await loadActiveOwnerMappings(input.supabase);
  const resolved = resolveOutstandingPackageRows({
    rows: parsed.rows,
    directory,
    mappings,
    now: input.now
  });

  for (const name of resolved.invalidMappings) {
    await markOwnerMappingInvalid(
      input.supabase,
      name,
      "Mapped Gingr owner id is no longer present in /api/v1/owners."
    );
  }

  const saved = await insertPackageEligibilityImport(input.supabase, {
    importedBy: input.importedBy,
    importedByName: input.importedByName,
    filename: input.filename,
    rowCount: parsed.totalRows,
    eligibleRowCount: resolved.counts.eligiblePackageRows,
    monthlyUnlimitedCount: resolved.counts.monthlyUnlimited,
    twentyDayPlusCount: resolved.counts.twentyDayPlus,
    matchedCount: resolved.counts.matchedAutomatically,
    mappedCount: resolved.counts.matchedBySavedMapping,
    ambiguousCount: resolved.counts.ambiguous,
    unresolvedCount: resolved.counts.unresolved,
    expiredCount: resolved.counts.expired,
    zeroRemainingCount: resolved.counts.zeroRemaining
  });

  await insertPackageEligibilityRecords(input.supabase, saved.id, resolved.records);
  invalidateTtlCache(PACKAGE_GROUP_WALK_ELIGIBILITY_CACHE_PREFIX);

  return {
    ok: true,
    import: saved,
    summary: {
      ...resolved.counts,
      totalCsvRows: parsed.totalRows,
      lastSync: saved.importedAt,
      importId: saved.id,
      filename: saved.filename
    }
  };
}
