/**
 * Owner package/subscription resolution for Package Group Walks.
 *
 * ## No N+1
 *
 * Two bulk sources only — never one request per dog or per owner:
 *
 * 1. **Reservation-embedded** (0 extra requests): package/subscription arrays that
 *    Gingr already ships on the reservation or its nested owner. Free, because the
 *    TL board pulls `POST /api/v1/reservations` anyway.
 * 2. **`GET /api/v1/get_subscriptions`** (1 request, paged): the whole facility's
 *    subscriptions, indexed by `owner_id`. Documented params: `key`, `location_id`,
 *    `owner_id`, `package_id`, `limit`, `offset`, `include_deleted`.
 *
 * `GET /api/v1/owner?id=` is deliberately **not** used — it is per-owner and would
 * reintroduce the N+1 pattern this module exists to avoid.
 */
import { createGingrClient, unwrapGingrData } from "@/lib/integrations/gingr/client";
import type { GingrReservation } from "@/lib/integrations/gingr/types";
import { requireTlGingrApiKey, tlGingrClientConfig } from "@/lib/tl-digi-board/gingr-auth";
import { fetchTlGingrResponse } from "@/lib/tl-digi-board/gingr-http";
import {
  matchEligiblePackage,
  type EligiblePackageDefinition,
  type PackageMatchCandidate
} from "./eligible-packages";

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
  "subscription_name",
  "membership_name",
  "plan_name",
  "title",
  "label",
  "display_name",
  "description"
] as const;

const PACKAGE_ID_FIELDS = [
  "package_id",
  "subscription_package_id",
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
  /** Sources that actually produced data ("reservation", "subscriptions"). */
  sources: string[];
  /** True when at least one source was read successfully. */
  available: boolean;
  errors: string[];
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
  return dedupePackages(resolved);
}

function normalizeSubscriptionList(payload: unknown): Array<Record<string, unknown>> {
  const data = unwrapGingrData(payload);
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? Object.values(data as Record<string, unknown>)
      : [];
  return rows.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
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
      record.subscription_package_id,
      record.membership_type_id,
      record.plan_id,
      record.product_id,
      record.subscription_id,
      record.package_type
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

/**
 * Whole-facility subscription rows for diagnostics.
 * Reuses the same bulk get_subscriptions fetch as eligibility — still one Gingr call site.
 */
export async function loadAllGingrSubscriptionRows(): Promise<{
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}> {
  const rows: Array<Record<string, unknown>> = [];
  for (let page = 0; page < SUBSCRIPTION_MAX_PAGES; page += 1) {
    const pageRows = await fetchSubscriptionPage(page * SUBSCRIPTION_PAGE_SIZE);
    rows.push(...pageRows);
    if (pageRows.length < SUBSCRIPTION_PAGE_SIZE) break;
  }
  return { rows, rowCount: rows.length };
}

async function fetchSubscriptionPage(offset: number): Promise<Array<Record<string, unknown>>> {
  const apiKey = requireTlGingrApiKey();
  const { subdomain, locationId } = tlGingrClientConfig();
  const client = createGingrClient({ apiKey, subdomain, locationId });
  const params = new URLSearchParams({
    key: client.config.apiKey,
    location_id: client.config.locationId,
    include_deleted: "false",
    limit: String(SUBSCRIPTION_PAGE_SIZE),
    offset: String(offset)
  });
  const response = await fetchTlGingrResponse(
    `${client.config.baseUrl}/api/v1/get_subscriptions?${params.toString()}`,
    { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" },
    "Gingr subscriptions",
    SUBSCRIPTION_FETCH_TIMEOUT_MS
  );
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Gingr get_subscriptions ${response.status}: ${text.slice(0, 180) || response.statusText}`
    );
  }
  return normalizeSubscriptionList(await response.json());
}

/**
 * Whole-facility subscriptions indexed by owner id.
 * One request per page (typically one page), never one per owner.
 */
export async function loadGingrSubscriptionIndex(): Promise<{
  byOwnerId: Map<string, ResolvedOwnerPackage[]>;
  rowCount: number;
}> {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  let rowCount = 0;

  for (let page = 0; page < SUBSCRIPTION_MAX_PAGES; page += 1) {
    const rows = await fetchSubscriptionPage(page * SUBSCRIPTION_PAGE_SIZE);
    rowCount += rows.length;

    for (const row of rows) {
      if (packageRecordInactive(row)) continue;
      const ownerId = pickString(row.owner_id, row.ownerId, asRecord(row.owner)?.id);
      if (!ownerId) continue;

      const resolved: ResolvedOwnerPackage[] = [];
      for (const candidate of [...candidateFromRecord(row), ...collectCandidates(row)]) {
        const definition = matchEligiblePackage(candidate);
        if (!definition) continue;
        resolved.push({
          definition,
          gingrPackageId: candidate.id ?? null,
          rawName: candidate.name ?? null,
          source: "subscriptions"
        });
      }
      addPackages(byOwnerId, ownerId, resolved);
    }

    if (rows.length < SUBSCRIPTION_PAGE_SIZE) break;
  }

  return { byOwnerId, rowCount };
}

/**
 * Build the owner → eligible packages index for a set of checked-in reservations.
 * Reservation-embedded data is free; the bulk subscriptions call is attempted once
 * and downgraded to a warning (not a failure) when the key lacks permission.
 */
export async function buildOwnerPackageIndex(
  reservations: GingrReservation[]
): Promise<OwnerPackageIndex> {
  const byOwnerId = new Map<string, ResolvedOwnerPackage[]>();
  const sources: string[] = [];
  const errors: string[] = [];

  let reservationMatches = 0;
  for (const reservation of reservations) {
    const ownerId = ownerIdFromReservation(reservation);
    if (!ownerId) continue;
    const packages = packagesFromReservation(reservation);
    if (!packages.length) continue;
    reservationMatches += packages.length;
    addPackages(byOwnerId, ownerId, packages);
  }
  if (reservationMatches > 0) sources.push("reservation");

  let subscriptionsOk = false;
  try {
    const { byOwnerId: subscriptionOwners } = await loadGingrSubscriptionIndex();
    subscriptionsOk = true;
    sources.push("subscriptions");
    for (const [ownerId, packages] of subscriptionOwners) {
      addPackages(byOwnerId, ownerId, packages);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Gingr subscriptions lookup failed.");
  }

  return {
    byOwnerId,
    sources,
    // Reservation-embedded matches also prove a working package source.
    available: subscriptionsOk || reservationMatches > 0,
    errors
  };
}
