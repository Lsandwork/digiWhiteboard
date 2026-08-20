/**
 * Owner package/membership resolution for Package Group Walks.
 *
 * Production lookup order (never one request per dog):
 *
 * 1. Reservation-embedded package fields and reservation type names — 0 extra requests
 * 2. Gingr Partner API bulk lists (the real prepaid-package source):
 *      GET https://api.gingr.io/v1/config/package-types
 *      GET https://api.gingr.io/v1/parents/parent-packages?filter[parentIds]
 *      GET https://api.gingr.io/v1/parents/parent-memberships?filter[parentIds]
 *    Unique checked-in owner ids are batched (not N+1) and cached 10 minutes.
 * 3. Legacy `GET /api/v1/get_subscriptions` — recurring subscriptions only
 * 4. Fallback: cached unique-owner `GET /api/v1/owner?id=` only if Partner API fails
 *
 * Empty get_subscriptions is NOT treated as a working package source.
 */
import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { tlGingrClientConfig } from "@/lib/tl-digi-board/gingr-auth";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import { redactDiagnosticMessage } from "./diagnostics";
import {
  matchEligiblePackage,
  type EligiblePackageDefinition,
  type PackageMatchCandidate
} from "./eligible-packages";
import {
  loadPartnerMembershipTypes,
  loadPartnerPackageTypes,
  loadPartnerParentMemberships,
  loadPartnerParentPackages,
  probePartnerParentPackagesPage,
  type PartnerPackageRow
} from "./gingr-partner";
import {
  gingrRowsFromPayload,
  gingrV1Request,
  payloadShape
} from "./gingr-v1";

/** One page is plenty for a single-location facility; the cap stops runaway paging. */
const SUBSCRIPTION_PAGE_SIZE = 500;
const SUBSCRIPTION_MAX_PAGES = 6;
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 8_000;

/** Fields that can hold a collection of packages/subscriptions on a Gingr record. */
const PACKAGE_CONTAINER_FIELDS = [
  "packages",
  "owner_packages",
  "active_packages",
  "subscriptions",
  "owner_subscriptions",
  "active_subscriptions",
  "memberships",
  "owner_memberships",
  "plans"
] as const;

/** Fields that can hold a single package/subscription object or plain label. */
const PACKAGE_SINGULAR_FIELDS = [
  "package",
  "subscription",
  "membership",
  "plan",
  "package_name",
  "subscription_name",
  "membership_name",
  "plan_name"
] as const;

const PACKAGE_NAME_FIELDS = [
  "name",
  "package_name",
  "packageName",
  "packageType",
  "subscription_name",
  "membership_name",
  "membershipType",
  "plan_name",
  "title",
  "label",
  "display_name",
  "description"
] as const;

const PACKAGE_ID_FIELDS = [
  "packageTypeId",
  "package_id",
  "subscription_package_id",
  "membershipTypeId",
  "membership_type_id",
  "plan_id",
  "id"
] as const;

export type ResolvedOwnerPackage = {
  definition: EligiblePackageDefinition;
  gingrPackageId: string | null;
  rawName: string | null;
  source: string;
};

export type OwnerPackageIndex = {
  /** Gingr owner id → eligible packages held by that owner. */
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  /** Sources that actually produced data ("parent_packages", "reservation"). */
  sources: string[];
  /**
   * True when a real package/membership source answered. Empty get_subscriptions
   * is not sufficient — Fitdog prepaid packages are not Gingr subscriptions.
   */
  available: boolean;
  errors: string[];
  uniqueCheckedInOwners: number;
  packageRowsInspected: number;
  capturedIds: {
    monthly_unlimited: string | null;
    twenty_day_plus: string | null;
  };
};

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

function candidateFromRecord(record: Record<string, unknown>): PackageMatchCandidate[] {
  const out: PackageMatchCandidate[] = [];
  const name = pickString(...PACKAGE_NAME_FIELDS.map((field) => record[field]));
  const id = pickString(...PACKAGE_ID_FIELDS.map((field) => record[field]));
  if (name || id) out.push({ id, name });

  // Subscriptions commonly nest the product: { id, owner_id, package: { id, name } }.
  for (const field of ["package", "membership", "plan", "product", "package_type"] as const) {
    const nested = asRecord(record[field]);
    if (!nested) continue;
    const nestedName = pickString(...PACKAGE_NAME_FIELDS.map((key) => nested[key]));
    const nestedId = pickString(...PACKAGE_ID_FIELDS.map((key) => nested[key]));
    if (nestedName || nestedId) out.push({ id: nestedId, name: nestedName });
  }
  return out;
}

/** True when a subscription/package row looks cancelled, expired, or depleted. */
function packageRecordInactive(record: Record<string, unknown>): boolean {
  if (record.deleted || record.deleted_at || record.cancelled || record.cancelled_at) return true;
  if (record.is_deleted === true || record.is_cancelled === true) return true;
  const status = pickString(record.status, record.state, record.subscription_status)?.toLowerCase();
  if (status && /cancel|expired|deleted|inactive|void|refunded/.test(status)) return true;
  if (record.active === false || record.active === "0" || record.is_active === false) return true;
  const remaining = record.remainingCredits ?? record.remaining_credits ?? record.credits;
  if (remaining != null && remaining !== "") {
    const amount = Number(remaining);
    if (Number.isFinite(amount) && amount <= 0) return true;
  }
  const expiration = pickString(record.expirationDate, record.expiryDate, record.expiration_date, record.expires_at);
  if (expiration && /^\d{4}-\d{2}-\d{2}/.test(expiration) && expiration.slice(0, 10) < todayInLosAngeles()) {
    return true;
  }
  const subscriptionDetails = asRecord(record.subscriptionDetails);
  if (subscriptionDetails?.deleted === true || subscriptionDetails?.deletedAt) return true;
  return false;
}

function collectCandidates(record: Record<string, unknown>): PackageMatchCandidate[] {
  const candidates: PackageMatchCandidate[] = [];

  for (const field of PACKAGE_CONTAINER_FIELDS) {
    const value = record[field];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const row = asRecord(item);
      if (row) {
        if (packageRecordInactive(row)) continue;
        candidates.push(...candidateFromRecord(row));
        continue;
      }
      const label = pickString(item);
      if (label) candidates.push({ id: null, name: label });
    }
  }

  for (const field of PACKAGE_SINGULAR_FIELDS) {
    const value = record[field];
    const row = asRecord(value);
    if (row) {
      if (packageRecordInactive(row)) continue;
      candidates.push(...candidateFromRecord(row));
      continue;
    }
    const label = pickString(value);
    if (label) candidates.push({ id: null, name: label });
  }

  return candidates;
}

function dedupePackages(packages: ResolvedOwnerPackage[]): ResolvedOwnerPackage[] {
  const seen = new Map<string, ResolvedOwnerPackage>();
  for (const entry of packages) {
    if (!seen.has(entry.definition.key)) seen.set(entry.definition.key, entry);
  }
  return [...seen.values()];
}

function addPackages(
  index: Map<string, ResolvedOwnerPackage[]>,
  ownerId: string,
  packages: ResolvedOwnerPackage[]
) {
  if (!packages.length) return;
  const existing = index.get(ownerId) ?? [];
  index.set(ownerId, dedupePackages([...existing, ...packages]));
}

export function ownerIdFromReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const owner = asRecord(record.owner) || asRecord(record.client) || asRecord(record.customer);
  return pickString(owner?.id, owner?.owner_id, record.owner_id, record.o_id, record.client_id);
}

export function ownerNameFromReservation(reservation: GingrReservation): string | null {
  const record = reservation as Record<string, unknown>;
  const owner = asRecord(record.owner) || asRecord(record.client) || asRecord(record.customer);
  const joined = [pickString(owner?.first_name, record.o_first), pickString(owner?.last_name, record.o_last)]
    .filter(Boolean)
    .join(" ")
    .trim();
  return pickString(owner?.full_name, joined || null, record.owner_name, record.client_name);
}

/** Packages Gingr already embedded on the reservation payload — costs no extra request. */
export function packagesFromReservation(reservation: GingrReservation): ResolvedOwnerPackage[] {
  const record = reservation as Record<string, unknown>;
  const scopes: Array<{ scope: Record<string, unknown>; source: string }> = [
    { scope: record, source: "reservation" }
  ];
  const owner = asRecord(record.owner) || asRecord(record.client) || asRecord(record.customer);
  if (owner) scopes.push({ scope: owner, source: "reservation_owner" });

  const resolved: ResolvedOwnerPackage[] = [];
  for (const { scope, source } of scopes) {
    for (const candidate of collectCandidates(scope)) {
      const definition = matchEligiblePackage(candidate);
      if (!definition) continue;
      resolved.push({
        definition,
        gingrPackageId: candidate.id ?? null,
        rawName: candidate.name ?? null,
        source
      });
    }
  }

  const typeName = pickString(record.type, record.type_name, record.reservation_type);
  const typeId = pickString(record.type_id, record.reservation_type_id);
  const typeMatch = matchEligiblePackage({ id: typeId, name: typeName });
  if (typeMatch) {
    resolved.push({
      definition: typeMatch,
      gingrPackageId: typeId,
      rawName: typeName,
      source: "reservation_type"
    });
  }
  return dedupePackages(resolved);
}

export type PackageInspectionRecord = {
  record: Record<string, unknown>;
  source: string;
  ownerId: string | null;
};

function looksLikePackageRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    pickString(
      ...PACKAGE_NAME_FIELDS.map((field) => record[field]),
      record.package_id,
      record.packageTypeId,
      record.subscription_package_id,
      record.membership_type_id,
      record.membershipTypeId,
      record.plan_id,
      record.product_id,
      record.subscription_id,
      record.package_type,
      record.remainingCredits
    ) ||
      asRecord(record.package) ||
      asRecord(record.membership) ||
      asRecord(record.plan) ||
      asRecord(record.product)
  );
}

/**
 * Collect raw package/subscription objects for diagnostics.
 * Returns the records Gingr actually sent — callers must sanitize before responding.
 */
export function collectPackageRecordsForInspection(
  record: Record<string, unknown>,
  source: string
): PackageInspectionRecord[] {
  const ownerId = pickString(record.owner_id, record.ownerId, asRecord(record.owner)?.id);
  const out: PackageInspectionRecord[] = [];
  const seen = new Set<Record<string, unknown>>();
  const push = (row: Record<string, unknown> | null, rowSource: string) => {
    if (!row || seen.has(row) || !looksLikePackageRecord(row)) return;
    seen.add(row);
    out.push({ record: row, source: rowSource, ownerId });
  };

  push(record, source);
  for (const field of PACKAGE_CONTAINER_FIELDS) {
    const value = record[field];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const row = asRecord(item);
      if (row) push(row, `${source}.${field}`);
    }
  }
  for (const field of PACKAGE_SINGULAR_FIELDS) {
    push(asRecord(record[field]), `${source}.${field}`);
  }
  for (const field of ["package", "membership", "plan", "product", "package_type"] as const) {
    push(asRecord(record[field]), `${source}.${field}`);
  }
  return out;
}

export function collectReservationPackageRecordsForInspection(
  reservation: GingrReservation
): PackageInspectionRecord[] {
  const record = reservation as Record<string, unknown>;
  const owner = asRecord(record.owner) || asRecord(record.client) || asRecord(record.customer);
  return [
    ...collectPackageRecordsForInspection(record, "reservation"),
    ...(owner ? collectPackageRecordsForInspection(owner, "reservation_owner") : [])
  ];
}

export type PackageSourceAttempt = {
  attempted: boolean;
  ok: boolean;
  httpStatus: number | null;
  rows: number;
  dataKind?: string;
  topLevelKeys?: string[];
  note?: string;
};

export type ReservationShapeReport = {
  sampleCount: number;
  fieldNames: string[];
  nestedOwnerFieldNames: string[];
  nestedAnimalFieldNames: string[];
  identifierFieldsPresent: Record<string, boolean>;
  reservationTypes: Array<{ id: string | null; name: string | null; count: number }>;
};

const IDENTIFIER_FIELDS = [
  "id",
  "reservation_id",
  "animal_id",
  "a_id",
  "owner_id",
  "o_id",
  "client_id",
  "order_id",
  "invoice_id",
  "transaction_id",
  "service_id",
  "type_id",
  "type",
  "package_id",
  "subscription_id",
  "membership_id",
  "credits",
  "credit_balance",
  "package_credits",
  "balance",
  "account_balance"
] as const;

const OWNER_PACKAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const OWNER_FETCH_CONCURRENCY = 4;

function resolvedFromRecord(record: Record<string, unknown>, source: string): ResolvedOwnerPackage[] {
  const resolved: ResolvedOwnerPackage[] = [];
  for (const candidate of [...candidateFromRecord(record), ...collectCandidates(record)]) {
    const definition = matchEligiblePackage(candidate);
    if (!definition) continue;
    resolved.push({
      definition,
      gingrPackageId: candidate.id ?? null,
      rawName: candidate.name ?? null,
      source
    });
  }
  return dedupePackages(resolved);
}

export function inspectCheckedInReservationShape(
  reservations: GingrReservation[]
): ReservationShapeReport {
  const fieldNames = new Set<string>();
  const ownerFields = new Set<string>();
  const animalFields = new Set<string>();
  const identifierFieldsPresent: Record<string, boolean> = {};
  for (const field of IDENTIFIER_FIELDS) identifierFieldsPresent[field] = false;
  const typeCounts = new Map<string, { id: string | null; name: string | null; count: number }>();

  const samples = reservations.slice(0, 5);
  for (const reservation of samples) {
    const record = reservation as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!/email|phone|password|token|secret|api_key/i.test(key)) fieldNames.add(key);
    }
    const owner = asRecord(record.owner) || asRecord(record.client) || asRecord(record.customer);
    if (owner) {
      for (const key of Object.keys(owner)) {
        if (!/email|phone|password|token|secret|api_key|first_name|last_name|full_name/i.test(key)) {
          ownerFields.add(key);
        }
      }
    }
    const animal = asRecord(record.animal) || asRecord(record.pet) || asRecord(record.dog);
    if (animal) {
      for (const key of Object.keys(animal)) {
        if (!/email|phone|password|token|secret/i.test(key)) animalFields.add(key);
      }
    }
    for (const field of IDENTIFIER_FIELDS) {
      if (pickString(record[field], owner?.[field], animal?.[field])) {
        identifierFieldsPresent[field] = true;
      }
    }
  }

  for (const reservation of reservations) {
    const record = reservation as Record<string, unknown>;
    const name = pickString(record.type, record.type_name, record.reservation_type);
    const id = pickString(record.type_id, record.reservation_type_id);
    if (!name && !id) continue;
    const key = `${id ?? ""}|${name ?? ""}`;
    const existing = typeCounts.get(key);
    if (existing) existing.count += 1;
    else typeCounts.set(key, { id, name, count: 1 });
  }

  return {
    sampleCount: samples.length,
    fieldNames: [...fieldNames].sort(),
    nestedOwnerFieldNames: [...ownerFields].sort(),
    nestedAnimalFieldNames: [...animalFields].sort(),
    identifierFieldsPresent,
    reservationTypes: [...typeCounts.values()].sort((a, b) => b.count - a.count)
  };
}

function sourceAttempt(
  attempted: boolean,
  read: { ok: boolean; status: number | null; payload: unknown; error: string | null } | null,
  extra?: Partial<PackageSourceAttempt>
): PackageSourceAttempt {
  if (!attempted || !read) {
    return { attempted: false, ok: false, httpStatus: null, rows: 0, ...extra };
  }
  const shape = payloadShape(read.payload);
  return {
    attempted: true,
    ok: read.ok,
    httpStatus: read.status,
    rows: shape.rowCount,
    dataKind: shape.dataKind,
    topLevelKeys: shape.topLevelKeys,
    note: read.error ? redactDiagnosticMessage(read.error) : extra?.note,
    ...extra
  };
}

async function fetchSubscriptionPages(params: Record<string, string>): Promise<{
  read: Awaited<ReturnType<typeof gingrV1Request>>;
  rows: Array<Record<string, unknown>>;
}> {
  const rows: Array<Record<string, unknown>> = [];
  let lastRead: Awaited<ReturnType<typeof gingrV1Request>> | null = null;
  for (let page = 0; page < SUBSCRIPTION_MAX_PAGES; page += 1) {
    const read = await gingrV1Request({
      path: "/api/v1/get_subscriptions",
      params: {
        include_deleted: "false",
        limit: String(SUBSCRIPTION_PAGE_SIZE),
        offset: String(page * SUBSCRIPTION_PAGE_SIZE),
        ...params
      },
      timeoutMs: SUBSCRIPTION_FETCH_TIMEOUT_MS,
      label: "Gingr subscriptions"
    });
    lastRead = read;
    if (!read.ok) break;
    const pageRows = gingrRowsFromPayload(read.payload);
    rows.push(...pageRows);
    if (pageRows.length < SUBSCRIPTION_PAGE_SIZE) break;
  }
  return { read: lastRead ?? { ok: false, status: null, payload: null, error: "No request." }, rows };
}

/**
 * Whole-facility subscription rows. Tries without location_id first — a location
 * filter is what returned 0 rows against Fitdog production.
 */
export async function loadAllGingrSubscriptionRows(): Promise<{
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  attempt: PackageSourceAttempt;
}> {
  return getOrLoadTtlCache("pgw:subscriptions", OWNER_PACKAGE_CACHE_TTL_MS, async () => {
  const unconstrained = await fetchSubscriptionPages({});
  if (unconstrained.rows.length > 0) {
    return {
      rows: unconstrained.rows,
      rowCount: unconstrained.rows.length,
      attempt: sourceAttempt(true, unconstrained.read)
    };
  }
  const { locationId } = tlGingrClientConfig();
  const constrained = await fetchSubscriptionPages({ location_id: locationId });
  const rows = constrained.rows.length ? constrained.rows : unconstrained.rows;
  const read = constrained.rows.length ? constrained.read : unconstrained.read;
  return {
    rows,
    rowCount: rows.length,
    attempt: sourceAttempt(true, read, {
      note:
        unconstrained.rows.length === 0 && constrained.rows.length === 0
          ? "get_subscriptions returned 0 rows with and without location_id. Fitdog packages are likely prepaid credits, not Gingr subscriptions."
          : undefined
    })
  };
  });
}

function indexSubscriptionRows(rows: Array<Record<string, unknown>>): Map<string, ResolvedOwnerPackage[]> {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  for (const row of rows) {
    if (packageRecordInactive(row)) continue;
    const ownerId = pickString(row.owner_id, row.ownerId, asRecord(row.owner)?.id);
    if (!ownerId) continue;
    addPackages(byOwnerId, ownerId, resolvedFromRecord(row, "subscriptions"));
  }
  return byOwnerId;
}

export async function loadGingrSubscriptionIndex(): Promise<{
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  rowCount: number;
  attempt: PackageSourceAttempt;
}> {
  const loaded = await loadAllGingrSubscriptionRows();
  return {
    byOwnerId: indexSubscriptionRows(loaded.rows),
    rowCount: loaded.rowCount,
    attempt: loaded.attempt
  };
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (!items.length) return;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

function ownerRecordFromPayload(payload: unknown): Record<string, unknown> | null {
  const rows = gingrRowsFromPayload(payload);
  if (rows.length === 1) return rows[0] ?? null;
  const record = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  if (!record) return rows[0] ?? null;
  const data = asRecord(record.data) ?? record;
  return asRecord(data);
}

async function loadPackagesForOwnerId(ownerId: string): Promise<{
  packages: ResolvedOwnerPackage[];
  inspection: PackageInspectionRecord[];
  availableFields: string[];
}> {
  return getOrLoadTtlCache(`pgw:owner-packages:${ownerId}`, OWNER_PACKAGE_CACHE_TTL_MS, async () => {
    const read = await gingrV1Request({
      path: "/api/v1/owner",
      params: { id: ownerId },
      label: "Gingr owner"
    });
    if (!read.ok) return { packages: [], inspection: [], availableFields: [] };
    const record = ownerRecordFromPayload(read.payload);
    if (!record) return { packages: [], inspection: [], availableFields: [] };
    return {
      packages: resolvedFromRecord(record, "owner"),
      inspection: collectPackageRecordsForInspection(record, "owner"),
      availableFields: Object.keys(record).filter((key) => !/email|phone|password|token|secret|api_key|first_name|last_name/i.test(key))
    };
  });
}

async function loadCheckedInOwnerPackages(ownerIds: string[]): Promise<{
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  inspection: PackageInspectionRecord[];
  attempt: PackageSourceAttempt;
  uniqueOwners: number;
}> {
  const unique = [...new Set(ownerIds.filter(Boolean))];
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  const inspection: PackageInspectionRecord[] = [];
  let ownersWithPackageRecords = 0;
  let lastError: string | null = null;
  let okCount = 0;

  await mapPool(unique, OWNER_FETCH_CONCURRENCY, async (ownerId) => {
    try {
      const loaded = await loadPackagesForOwnerId(ownerId);
      okCount += 1;
      if (loaded.inspection.length) ownersWithPackageRecords += 1;
      addPackages(byOwnerId, ownerId, loaded.packages);
      inspection.push(...loaded.inspection.map((entry) => ({ ...entry, ownerId })));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Owner lookup failed.";
    }
  });

  return {
    byOwnerId,
    inspection,
    uniqueOwners: unique.length,
    attempt: {
      attempted: unique.length > 0,
      ok: okCount > 0,
      httpStatus: okCount > 0 ? 200 : null,
      rows: inspection.length,
      note: lastError
        ? redactDiagnosticMessage(lastError)
        : unique.length
          ? `Fetched ${unique.length} unique checked-in owners (cached 10m, concurrency ${OWNER_FETCH_CONCURRENCY}). ${ownersWithPackageRecords} had package-like records.`
          : "No owner ids on checked-in reservations."
    }
  };
}

async function loadOwnersListPackages(): Promise<{
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  inspection: PackageInspectionRecord[];
  attempt: PackageSourceAttempt;
}> {
  return getOrLoadTtlCache("pgw:owners-list", OWNER_PACKAGE_CACHE_TTL_MS, async () => {
    const read = await gingrV1Request({
      path: "/api/v1/owners",
      method: "GET",
      label: "Gingr owners list",
      timeoutMs: 10_000
    });
    const attempt = sourceAttempt(true, read);
    if (!read.ok) return { byOwnerId: new Map(), inspection: [], attempt };

    const rows = gingrRowsFromPayload(read.payload);
    const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
    const inspection: PackageInspectionRecord[] = [];
    let packageRecords = 0;
    for (const row of rows) {
      const ownerId = pickString(row.id, row.owner_id, row.system_id);
      const records = collectPackageRecordsForInspection(row, "owners");
      packageRecords += records.length;
      inspection.push(...records);
      if (ownerId) addPackages(byOwnerId, ownerId, resolvedFromRecord(row, "owners"));
    }

    return {
      byOwnerId,
      inspection,
      attempt: {
        ...attempt,
        rows: packageRecords,
        note:
          packageRecords === 0
            ? `owners list returned ${rows.length} owner rows but no nested package/subscription records.`
            : undefined
      }
    };
  });
}

export async function loadRetailItemCatalog(): Promise<{
  rows: Array<Record<string, unknown>>;
  attempt: PackageSourceAttempt;
}> {
  const read = await gingrV1Request({
    path: "/api/v1/get_all_retail_items",
    label: "Gingr retail items"
  });
  return { rows: gingrRowsFromPayload(read.payload), attempt: sourceAttempt(true, read) };
}

export async function loadReservationTypeCatalog(): Promise<{
  rows: Array<Record<string, unknown>>;
  attempt: PackageSourceAttempt;
}> {
  const read = await gingrV1Request({
    path: "/api/v1/reservation_types",
    params: { active_only: "false" },
    label: "Gingr reservation types"
  });
  return { rows: gingrRowsFromPayload(read.payload), attempt: sourceAttempt(true, read) };
}

function emptyCapturedIds() {
  return { monthly_unlimited: null as string | null, twenty_day_plus: null as string | null };
}

function captureId(
  captured: ReturnType<typeof emptyCapturedIds>,
  key: "monthly_unlimited" | "twenty_day_plus",
  id: string | null
) {
  if (id && !captured[key]) captured[key] = id;
}

function indexPartnerRows(rows: PartnerPackageRow[]): {
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  inspection: PackageInspectionRecord[];
} {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  const inspection: PackageInspectionRecord[] = [];
  for (const row of rows) {
    if (packageRecordInactive(row.record)) continue;
    inspection.push({ record: row.record, source: row.source, ownerId: row.ownerId });
    if (!row.ownerId) continue;
    addPackages(byOwnerId, row.ownerId, resolvedFromRecord(row.record, row.source));
  }
  return { byOwnerId, inspection };
}

/**
 * Build the owner → eligible packages index for checked-in reservations.
 *
 * Empty get_subscriptions is NOT treated as a working package source — Fitdog
 * prepaid packages are parent-packages, not Gingr recurring subscriptions.
 */
export async function buildOwnerPackageIndex(
  reservations: GingrReservation[]
): Promise<OwnerPackageIndex> {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  const sources: string[] = [];
  const errors: string[] = [];
  const capturedIds = emptyCapturedIds();
  const ownerIds = reservations
    .map((reservation) => ownerIdFromReservation(reservation))
    .filter((id): id is string => Boolean(id));
  const uniqueCheckedInOwners = new Set(ownerIds).size;
  let packageRowsInspected = 0;
  let partnerOk = false;

  let reservationMatches = 0;
  let reservationTypeMatches = 0;
  for (const reservation of reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    const packages = packagesFromReservation(reservation);
    if (!ownerId || !packages.length) continue;
    reservationMatches += packages.length;
    reservationTypeMatches += packages.filter((entry) => entry.source === "reservation_type").length;
    addPackages(byOwnerId, ownerId, packages);
  }
  if (reservationMatches > 0) sources.push("reservation");
  if (reservationTypeMatches > 0) sources.push("reservation_type");

  try {
    const [packageTypes, membershipTypes, parentPackages, parentMemberships] = await Promise.all([
      loadPartnerPackageTypes(),
      loadPartnerMembershipTypes(),
      loadPartnerParentPackages(ownerIds),
      loadPartnerParentMemberships(ownerIds)
    ]);
    partnerOk =
      packageTypes.attempt.ok ||
      membershipTypes.attempt.ok ||
      parentPackages.attempt.ok ||
      parentMemberships.attempt.ok;
    captureId(capturedIds, "monthly_unlimited", packageTypes.capturedIds.monthly_unlimited ?? null);
    captureId(capturedIds, "twenty_day_plus", packageTypes.capturedIds.twenty_day_plus ?? null);
    captureId(capturedIds, "monthly_unlimited", membershipTypes.capturedIds.monthly_unlimited ?? null);
    captureId(capturedIds, "twenty_day_plus", membershipTypes.capturedIds.twenty_day_plus ?? null);

    const partnerIndexed = indexPartnerRows([...parentPackages.rows, ...parentMemberships.rows]);
    packageRowsInspected +=
      packageTypes.rows.length +
      membershipTypes.rows.length +
      partnerIndexed.inspection.length;
    for (const [ownerId, packages] of partnerIndexed.byOwnerId) {
      addPackages(byOwnerId, ownerId, packages);
      for (const entry of packages) {
        if (entry.gingrPackageId) captureId(capturedIds, entry.definition.key, entry.gingrPackageId);
      }
    }
    if (parentPackages.attempt.ok) sources.push("parent_packages");
    if (parentMemberships.attempt.ok && parentMemberships.rows.length) sources.push("parent_memberships");
    if (packageTypes.attempt.ok && packageTypes.rows.length) sources.push("package_types");
    if (!packageTypes.attempt.ok && packageTypes.attempt.note) errors.push(packageTypes.attempt.note);
    if (!parentPackages.attempt.ok && parentPackages.attempt.note) errors.push(parentPackages.attempt.note);
    if (!parentMemberships.attempt.ok && parentMemberships.attempt.note) {
      errors.push(parentMemberships.attempt.note);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Gingr Partner package lookup failed.");
  }

  try {
    const subscriptions = await loadGingrSubscriptionIndex();
    if (subscriptions.attempt.note) errors.push(subscriptions.attempt.note);
    let subscriptionMatches = 0;
    for (const [ownerId, packages] of subscriptions.byOwnerId) {
      subscriptionMatches += packages.length;
      addPackages(byOwnerId, ownerId, packages);
    }
    if (subscriptionMatches > 0) sources.push("subscriptions");
    packageRowsInspected += subscriptions.rowCount;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Gingr subscriptions lookup failed.");
  }

  if (!partnerOk && ownerIds.length > 0) {
    try {
      const checkedInOwners = await loadCheckedInOwnerPackages(ownerIds);
      packageRowsInspected += checkedInOwners.inspection.length;
      for (const [ownerId, packages] of checkedInOwners.byOwnerId) {
        addPackages(byOwnerId, ownerId, packages);
      }
      if (checkedInOwners.byOwnerId.size > 0) sources.push("owner");
      if (checkedInOwners.attempt.note) errors.push(checkedInOwners.attempt.note);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Gingr owner package lookup failed.");
    }
  }

  const attributedEligible = [...byOwnerId.values()].reduce((sum, packages) => sum + packages.length, 0);

  return {
    byOwnerId,
    sources,
    available: attributedEligible > 0 || partnerOk,
    errors,
    uniqueCheckedInOwners,
    packageRowsInspected,
    capturedIds
  };
}

export type PackageDiscoveryResult = {
  packageSources: Record<string, PackageSourceAttempt>;
  reservationShape: ReservationShapeReport;
  inspection: PackageInspectionRecord[];
  uniqueCheckedInOwners: number;
  capturedIds: {
    monthly_unlimited: string | null;
    twenty_day_plus: string | null;
  };
};

/** Diagnostics-only: probe every plausible Gingr package source against live data. */
export async function discoverGingrPackageSources(
  reservations: GingrReservation[]
): Promise<PackageDiscoveryResult> {
  const ownerIds = reservations
    .map((reservation) => ownerIdFromReservation(reservation))
    .filter((id): id is string => Boolean(id));
  const uniqueOwnerIds = [...new Set(ownerIds)];
  const uniqueCheckedInOwners = uniqueOwnerIds.length;
  const capturedIds = emptyCapturedIds();

  const inspection: PackageInspectionRecord[] = reservations.flatMap((reservation) =>
    collectReservationPackageRecordsForInspection(reservation)
  );

  const [
    packageTypes,
    membershipTypes,
    parentPackages,
    parentMemberships,
    unfilteredPackages,
    subscriptions,
    ownersList,
    retail,
    reservationTypes
  ] = await Promise.all([
    loadPartnerPackageTypes(),
    loadPartnerMembershipTypes(),
    loadPartnerParentPackages(ownerIds),
    loadPartnerParentMemberships(ownerIds),
    probePartnerParentPackagesPage(),
    loadAllGingrSubscriptionRows(),
    loadOwnersListPackages(),
    loadRetailItemCatalog(),
    loadReservationTypeCatalog()
  ]);

  captureId(capturedIds, "monthly_unlimited", packageTypes.capturedIds.monthly_unlimited ?? null);
  captureId(capturedIds, "twenty_day_plus", packageTypes.capturedIds.twenty_day_plus ?? null);
  captureId(capturedIds, "monthly_unlimited", membershipTypes.capturedIds.monthly_unlimited ?? null);
  captureId(capturedIds, "twenty_day_plus", membershipTypes.capturedIds.twenty_day_plus ?? null);

  const partnerIndexed = indexPartnerRows([
    ...parentPackages.rows,
    ...parentMemberships.rows,
    ...unfilteredPackages.rows
  ]);
  inspection.push(
    ...partnerIndexed.inspection,
    ...packageTypes.rows.map((record) => ({ record, source: "package_types", ownerId: null })),
    ...membershipTypes.rows.map((record) => ({ record, source: "membership_types", ownerId: null })),
    ...subscriptions.rows.flatMap((row) => collectPackageRecordsForInspection(row, "subscriptions")),
    ...ownersList.inspection,
    ...retail.rows.flatMap((row) => collectPackageRecordsForInspection(row, "retail_items")),
    ...reservationTypes.rows.flatMap((row) => collectPackageRecordsForInspection(row, "reservation_types"))
  );

  for (const entry of inspection) {
    const resolved = resolvedFromRecord(entry.record, entry.source);
    for (const pkg of resolved) {
      if (pkg.gingrPackageId) captureId(capturedIds, pkg.definition.key, pkg.gingrPackageId);
    }
  }

  const partnerOk =
    packageTypes.attempt.ok || parentPackages.attempt.ok || parentMemberships.attempt.ok;

  let ownerAttempt: PackageSourceAttempt = {
    attempted: false,
    ok: false,
    httpStatus: null,
    rows: 0,
    note: partnerOk
      ? "Skipped unique-owner GET /api/v1/owner because the Partner API already answered."
      : "Skipped because the owners list already exposed package records."
  };
  if (!partnerOk && ownersList.inspection.length === 0 && uniqueOwnerIds.length > 0) {
    const sampleOwnerId = uniqueOwnerIds[0]!;
    const sample = await loadPackagesForOwnerId(sampleOwnerId);
    inspection.push(...sample.inspection.map((entry) => ({ ...entry, ownerId: sampleOwnerId })));
    ownerAttempt = {
      attempted: true,
      ok: sample.availableFields.length > 0,
      httpStatus: sample.availableFields.length ? 200 : null,
      rows: sample.inspection.length,
      topLevelKeys: sample.availableFields.sort(),
      note: `Sampled 1 of ${uniqueOwnerIds.length} unique checked-in owners via GET /api/v1/owner?id= (diagnostics only).`
    };
  } else if (partnerOk && uniqueOwnerIds.length > 0) {
    const sampleOwnerId = uniqueOwnerIds[0]!;
    const sample = await loadPackagesForOwnerId(sampleOwnerId);
    inspection.push(...sample.inspection.map((entry) => ({ ...entry, ownerId: sampleOwnerId })));
    ownerAttempt = {
      attempted: true,
      ok: sample.availableFields.length > 0,
      httpStatus: sample.availableFields.length ? 200 : null,
      rows: sample.inspection.length,
      topLevelKeys: sample.availableFields.sort(),
      note: `Sampled 1 checked-in owner via GET /api/v1/owner?id= for field inventory. Production lookup uses Partner API, not per-owner requests.`
    };
  }

  const reservationEmbedded = inspection.filter((entry) => entry.source.startsWith("reservation")).length;

  return {
    packageSources: {
      reservationEmbedded: {
        attempted: true,
        ok: true,
        httpStatus: 200,
        rows: reservationEmbedded,
        note: "Package-like fields already present on POST /api/v1/reservations (checked_in=true)."
      },
      packageTypes: packageTypes.attempt,
      membershipTypes: membershipTypes.attempt,
      parentPackages: parentPackages.attempt,
      parentMemberships: parentMemberships.attempt,
      parentPackagesUnfiltered: unfilteredPackages.attempt,
      subscriptions: subscriptions.attempt,
      ownersList: ownersList.attempt,
      owner: ownerAttempt,
      retailItems: retail.attempt,
      reservationTypes: reservationTypes.attempt
    },
    reservationShape: inspectCheckedInReservationShape(reservations),
    inspection,
    uniqueCheckedInOwners,
    capturedIds
  };
}
