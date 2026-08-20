import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";

export type PackageImportFreshness = "FRESH" | "STALE" | "MISSING";

export function packageImportFreshness(
  importedAt: string | null | undefined,
  now = new Date()
): PackageImportFreshness {
  if (!importedAt) return "MISSING";
  const imported = new Date(importedAt);
  if (Number.isNaN(imported.getTime())) return "MISSING";
  return todayInLosAngeles(imported) === todayInLosAngeles(now) ? "FRESH" : "STALE";
}

export function packageImportWarning(input: {
  freshness: PackageImportFreshness;
  importedAt: string | null;
}): string | null {
  if (input.freshness === "MISSING") {
    return "Unable to verify Package Group Walk eligibility. Package report has not been synced.";
  }
  if (input.freshness === "STALE") {
    return `Package eligibility may be outdated. Last sync: ${input.importedAt ?? "—"}`;
  }
  return null;
}
