import { eligiblePackageByKey } from "./eligible-packages";
import type { OwnerPackageIndex, ResolvedOwnerPackage } from "./gingr-packages";
import type { PackageEligibilityRecord } from "./eligibility-store";
import type { PackageImportFreshness } from "./freshness";

export function ownerPackageIndexFromCsvRecords(input: {
  records: PackageEligibilityRecord[];
  uniqueCheckedInOwners: number;
  freshness: PackageImportFreshness;
}): OwnerPackageIndex {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  for (const record of input.records) {
    if (!record.gingrOwnerId) continue;
    if (record.matchStatus !== "matched" && record.matchStatus !== "manual") continue;
    const definition = eligiblePackageByKey(record.packageKey);
    if (!definition) continue;
    const list = byOwnerId.get(record.gingrOwnerId) ?? [];
    list.push({
      definition,
      gingrPackageId: null,
      rawName: record.packageType,
      source: "outstanding_packages_csv",
      creditsRemaining: record.numberRemaining
    });
    byOwnerId.set(record.gingrOwnerId, list);
  }

  return {
    byOwnerId,
    sources: input.freshness === "MISSING" ? [] : ["outstanding_packages_csv"],
    available: input.freshness !== "MISSING",
    errors: [],
    uniqueCheckedInOwners: input.uniqueCheckedInOwners,
    packageRowsInspected: input.records.length,
    capturedIds: {
      monthly_unlimited: null,
      twenty_day_plus: null
    },
    attempts: {
      outstanding_packages_csv: {
        ok: input.freshness !== "MISSING",
        httpStatus: input.freshness === "MISSING" ? null : 200,
        rows: input.records.length
      }
    },
    ownerFieldNames: ["id", "first_name", "last_name"]
  };
}
