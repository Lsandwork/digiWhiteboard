/**
 * TEMPORARY Outstanding Packages CSV → Gingr owner_id resolution.
 *
 * Runs server-side only. Never serialize the owner directory, CSV names, or
 * other PII to the client. Package Group Walk eligibility is unchanged.
 */
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { redactDiagnosticMessage } from "./diagnostics";
import { loadGingrOwnersListRead, ownerIdFromReservation } from "./gingr-packages";
import { gingrRowsFromPayload } from "./gingr-v1";
import {
  OUTSTANDING_PACKAGE_CSV_OWNERS,
  OUTSTANDING_PACKAGE_CSV_SOURCE,
  type OutstandingPackageCsvOwner
} from "./csv-owner-resolution-fixture";
import type { PackageGroupWalkPackageKey } from "./eligible-packages";

const SECRET_FIELD = /(?:api[_-]?key|auth(?:orization)?|token|secret|password|credential|cookie|session)/i;
const ID_FIELD_CANDIDATES = ["id", "owner_id", "system_id", "o_id"] as const;
const FIRST_NAME_CANDIDATES = ["first_name", "o_first", "firstName", "firstname"] as const;
const LAST_NAME_CANDIDATES = ["last_name", "o_last", "lastName", "lastname"] as const;
const FULL_NAME_CANDIDATES = ["full_name", "display_name", "owner_name", "name"] as const;
const STATUS_FIELD_CANDIDATES = [
  "deleted",
  "is_deleted",
  "deleted_at",
  "inactive",
  "is_inactive",
  "disabled",
  "deactivated",
  "active",
  "status"
] as const;

export type CsvOwnerMatchClass = "UNIQUE_EXACT_MATCH" | "ZERO_MATCH" | "MULTIPLE_EXACT_MATCH";

export type CsvOwnerPackageMatchCounts = {
  csvOwners: number;
  uniqueExactMatches: number;
  zeroMatches: number;
  ambiguousMatches: number;
};

export type CsvOwnerDirectorySchema = {
  httpStatus: number | null;
  totalRows: number;
  stableIdField: string | null;
  firstNameField: string | null;
  lastNameField: string | null;
  fullNameField: string | null;
  activeDeletedField: string | null;
  sanitizedOwnerFieldNames: string[];
  ownerIdNamespaceVerified: boolean;
};

export type CsvOwnerResolutionReport = {
  source: string;
  directory: CsvOwnerDirectorySchema;
  monthlyUnlimited: CsvOwnerPackageMatchCounts;
  twentyDayPlus: CsvOwnerPackageMatchCounts;
  today: {
    checkedInReservations: number;
    uniqueCheckedInOwners: number;
    eligiblePackageOwnersCurrentlyCheckedIn: number;
    eligibleDogsCurrentlyCheckedIn: number;
    unresolvedPackageOwners: number;
    ambiguousPackageOwners: number;
  };
  error: string | null;
};

export type InternalResolvedGingrOwner = {
  gingrOwnerId: string;
  normalizedFirstName: string;
  normalizedLastName: string;
  normalizedFullName: string;
  active: boolean;
};

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

/** Conservative name fold: lowercase, trim, collapse repeated spaces. No punctuation stripping. */
export function normalizeOwnerName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function hasNonEmptyScalar(value: unknown): boolean {
  if (value == null || typeof value === "object") return false;
  return String(value).trim().length > 0;
}

function firstPresentField(record: Record<string, unknown>, candidates: readonly string[]): string | null {
  for (const field of candidates) {
    if (field in record && hasNonEmptyScalar(record[field])) return field;
  }
  for (const field of candidates) {
    if (field in record) return field;
  }
  return null;
}

function mostPopulatedField(rows: Array<Record<string, unknown>>, candidates: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const field of candidates) counts.set(field, 0);
  for (const row of rows.slice(0, 50)) {
    for (const field of candidates) {
      if (hasNonEmptyScalar(row[field])) counts.set(field, (counts.get(field) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const field of candidates) {
    const count = counts.get(field) ?? 0;
    if (count > bestCount) {
      best = field;
      bestCount = count;
    }
  }
  if (bestCount > 0) return best;
  return rows[0] ? firstPresentField(rows[0], candidates) : null;
}

function isInactiveOwner(record: Record<string, unknown>, statusField: string | null): boolean {
  if (!statusField) return false;
  const value = record[statusField];
  if (statusField === "active") {
    return value === false || value === 0 || value === "0" || String(value).trim().toLowerCase() === "false";
  }
  if (value == null || value === false || value === 0 || value === "0") return false;
  if (value === true || value === 1 || value === "1") return true;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return /deleted|inactive|disabled|deactivated|false/.test(text);
}

export function inspectOwnerRecordSchema(
  record: Record<string, unknown> | null,
  rows: Array<Record<string, unknown>> = []
): {
  stableIdField: string | null;
  firstNameField: string | null;
  lastNameField: string | null;
  fullNameField: string | null;
  activeDeletedField: string | null;
  sanitizedOwnerFieldNames: string[];
} {
  const sampleRows = rows.length ? rows : record ? [record] : [];
  const sample = record ?? sampleRows[0] ?? null;
  if (!sample) {
    return {
      stableIdField: null,
      firstNameField: null,
      lastNameField: null,
      fullNameField: null,
      activeDeletedField: null,
      sanitizedOwnerFieldNames: []
    };
  }
  const sanitizedOwnerFieldNames = Object.keys(sample)
    .filter((key) => !SECRET_FIELD.test(key))
    .sort((a, b) => a.localeCompare(b));
  return {
    stableIdField: mostPopulatedField(sampleRows, ID_FIELD_CANDIDATES),
    firstNameField: mostPopulatedField(sampleRows, FIRST_NAME_CANDIDATES),
    lastNameField: mostPopulatedField(sampleRows, LAST_NAME_CANDIDATES),
    fullNameField: mostPopulatedField(sampleRows, FULL_NAME_CANDIDATES),
    activeDeletedField: mostPopulatedField(sampleRows, STATUS_FIELD_CANDIDATES),
    sanitizedOwnerFieldNames
  };
}

export function gingrOwnerFromRecord(
  record: Record<string, unknown>,
  schema: ReturnType<typeof inspectOwnerRecordSchema>
): InternalResolvedGingrOwner | null {
  const id = schema.stableIdField ? pickString(record[schema.stableIdField]) : null;
  if (!id) return null;
  const first = schema.firstNameField ? normalizeOwnerName(pickString(record[schema.firstNameField])) : "";
  const last = schema.lastNameField ? normalizeOwnerName(pickString(record[schema.lastNameField])) : "";
  const joined = [first, last].filter(Boolean).join(" ");
  const explicitFull = schema.fullNameField
    ? normalizeOwnerName(pickString(record[schema.fullNameField]))
    : "";
  const normalizedFullName = joined || explicitFull;
  if (!normalizedFullName) return null;
  return {
    gingrOwnerId: id,
    normalizedFirstName: first,
    normalizedLastName: last,
    normalizedFullName,
    active: !isInactiveOwner(record, schema.activeDeletedField)
  };
}

export function classifyCsvOwnerName(
  csvDisplayName: string,
  directoryByFullName: Map<string, InternalResolvedGingrOwner[]>
): { classification: CsvOwnerMatchClass; ownerIds: string[] } {
  const normalized = normalizeOwnerName(csvDisplayName);
  if (!normalized) return { classification: "ZERO_MATCH", ownerIds: [] };
  const matches = directoryByFullName.get(normalized) ?? [];
  const activeMatches = matches.filter((owner) => owner.active);
  const ids = [...new Set(activeMatches.map((owner) => owner.gingrOwnerId))];
  if (ids.length === 1) return { classification: "UNIQUE_EXACT_MATCH", ownerIds: ids };
  if (ids.length === 0) return { classification: "ZERO_MATCH", ownerIds: [] };
  return { classification: "MULTIPLE_EXACT_MATCH", ownerIds: ids };
}

function emptyCounts(): CsvOwnerPackageMatchCounts {
  return { csvOwners: 0, uniqueExactMatches: 0, zeroMatches: 0, ambiguousMatches: 0 };
}

export function matchCsvOwnersToDirectory(
  csvOwners: readonly OutstandingPackageCsvOwner[],
  directory: InternalResolvedGingrOwner[]
): {
  byPackage: Record<PackageGroupWalkPackageKey, CsvOwnerPackageMatchCounts>;
  uniqueMatchOwnerIds: Set<string>;
  unresolvedCount: number;
  ambiguousCount: number;
} {
  const directoryByFullName = new Map<string, InternalResolvedGingrOwner[]>();
  for (const owner of directory) {
    if (!owner.normalizedFullName) continue;
    const list = directoryByFullName.get(owner.normalizedFullName) ?? [];
    list.push(owner);
    directoryByFullName.set(owner.normalizedFullName, list);
  }

  const byPackage: Record<PackageGroupWalkPackageKey, CsvOwnerPackageMatchCounts> = {
    monthly_unlimited: emptyCounts(),
    twenty_day_plus: emptyCounts()
  };
  const uniqueMatchOwnerIds = new Set<string>();
  let unresolvedCount = 0;
  let ambiguousCount = 0;

  for (const csvOwner of csvOwners) {
    const counts = byPackage[csvOwner.packageKey];
    counts.csvOwners += 1;
    const result = classifyCsvOwnerName(csvOwner.ownerDisplayName, directoryByFullName);
    if (result.classification === "UNIQUE_EXACT_MATCH") {
      counts.uniqueExactMatches += 1;
      uniqueMatchOwnerIds.add(result.ownerIds[0]!);
    } else if (result.classification === "ZERO_MATCH") {
      counts.zeroMatches += 1;
      unresolvedCount += 1;
    } else {
      counts.ambiguousMatches += 1;
      ambiguousCount += 1;
    }
  }

  return { byPackage, uniqueMatchOwnerIds, unresolvedCount, ambiguousCount };
}

export function reservationOwnerIds(reservations: GingrReservation[]): string[] {
  const ids: string[] = [];
  for (const reservation of reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    if (ownerId) ids.push(ownerId);
  }
  return ids;
}

export function buildCsvOwnerResolutionReport(input: {
  httpStatus: number | null;
  rows: Array<Record<string, unknown>>;
  reservations: GingrReservation[];
  csvOwners?: readonly OutstandingPackageCsvOwner[];
  error?: string | null;
}): CsvOwnerResolutionReport {
  const csvOwners = input.csvOwners ?? OUTSTANDING_PACKAGE_CSV_OWNERS;
  const sample = input.rows.find((row) => row && Object.keys(row).length > 0) ?? null;
  const schema = inspectOwnerRecordSchema(sample, input.rows);
  const directory = input.rows
    .map((row) => gingrOwnerFromRecord(row, schema))
    .filter((row): row is InternalResolvedGingrOwner => Boolean(row));
  const matched = matchCsvOwnersToDirectory(csvOwners, directory);
  const checkedInOwnerIds = reservationOwnerIds(input.reservations);
  const uniqueCheckedInOwners = new Set(checkedInOwnerIds);
  const directoryIds = new Set(directory.map((owner) => owner.gingrOwnerId));
  const namespaceVerified = [...uniqueCheckedInOwners].some((id) => directoryIds.has(id));

  let eligibleDogsCurrentlyCheckedIn = 0;
  for (const reservation of input.reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    if (ownerId && matched.uniqueMatchOwnerIds.has(ownerId)) eligibleDogsCurrentlyCheckedIn += 1;
  }

  let eligiblePackageOwnersCurrentlyCheckedIn = 0;
  for (const ownerId of matched.uniqueMatchOwnerIds) {
    if (uniqueCheckedInOwners.has(ownerId)) eligiblePackageOwnersCurrentlyCheckedIn += 1;
  }

  return {
    source: OUTSTANDING_PACKAGE_CSV_SOURCE,
    directory: {
      httpStatus: input.httpStatus,
      totalRows: input.rows.length,
      stableIdField: schema.stableIdField,
      firstNameField: schema.firstNameField,
      lastNameField: schema.lastNameField,
      fullNameField: schema.fullNameField,
      activeDeletedField: schema.activeDeletedField,
      sanitizedOwnerFieldNames: schema.sanitizedOwnerFieldNames,
      ownerIdNamespaceVerified: namespaceVerified
    },
    monthlyUnlimited: matched.byPackage.monthly_unlimited,
    twentyDayPlus: matched.byPackage.twenty_day_plus,
    today: {
      checkedInReservations: input.reservations.length,
      uniqueCheckedInOwners: uniqueCheckedInOwners.size,
      eligiblePackageOwnersCurrentlyCheckedIn,
      eligibleDogsCurrentlyCheckedIn,
      unresolvedPackageOwners: matched.unresolvedCount,
      ambiguousPackageOwners: matched.ambiguousCount
    },
    error: input.error ?? null
  };
}

export async function inspectOwnersCsvResolution(
  reservations: GingrReservation[]
): Promise<CsvOwnerResolutionReport> {
  const read = await loadGingrOwnersListRead();
  const rows = read.ok ? gingrRowsFromPayload(read.payload) : [];
  return buildCsvOwnerResolutionReport({
    httpStatus: read.status,
    rows,
    reservations,
    error: read.ok ? null : redactDiagnosticMessage(read.error)
  });
}

/** Public lookup payload — aggregates and field names only. */
export function toPublicCsvOwnerResolutionLookup(report: CsvOwnerResolutionReport) {
  return {
    httpStatus: report.directory.httpStatus,
    totalRows: report.directory.totalRows,
    stableIdField: report.directory.stableIdField,
    firstNameField: report.directory.firstNameField,
    lastNameField: report.directory.lastNameField,
    activeDeletedField: report.directory.activeDeletedField,
    ownerIdNamespaceVerified: report.directory.ownerIdNamespaceVerified,
    sanitizedOwnerFieldNames: report.directory.sanitizedOwnerFieldNames,
    monthlyUnlimited: report.monthlyUnlimited,
    twentyDayPlus: report.twentyDayPlus,
    today: report.today,
    error: report.error
  };
}
