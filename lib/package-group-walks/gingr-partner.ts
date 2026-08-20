/**
 * Gingr Partner API (api.gingr.io) reads for Package Group Walks.
 *
 * Fitdog prepaid packages are not Gingr *subscriptions*. Official v1 documents
 * them as parent packages:
 *
 *   GET https://api.gingr.io/v1/config/package-types
 *   GET https://api.gingr.io/v1/parents/parent-packages
 *   GET https://api.gingr.io/v1/parents/parent-memberships
 *
 * Auth is the same facility API key used by the legacy subdomain API, sent as
 * `X-Api-Key` plus a `subdomain` header. The request URL never includes `key=`.
 *
 * These are bulk, paginated list endpoints — never one request per dog.
 */
import { requireTlGingrApiKey, tlGingrClientConfig } from "@/lib/tl-digi-board/gingr-auth";
import { fetchTlGingrResponse } from "@/lib/tl-digi-board/gingr-http";
import { getOrLoadTtlCache } from "@/lib/server-ttl-cache";
import { redactDiagnosticMessage } from "./diagnostics";
import {
  matchEligiblePackage,
  registerConfirmedGingrPackageIds,
  type PackageGroupWalkPackageKey
} from "./eligible-packages";
import type { GingrV1Read } from "./gingr-v1";
import { asRecord } from "./gingr-v1";

export type PartnerSourceAttempt = {
  attempted: boolean;
  ok: boolean;
  httpStatus: number | null;
  rows: number;
  dataKind?: string;
  topLevelKeys?: string[];
  note?: string;
};

const PARTNER_BASE_URL = "https://api.gingr.io";
const PARTNER_TIMEOUT_MS = 10_000;
const PARTNER_PAGE_SIZE = 100;
const PARTNER_MAX_PAGES = 10;
const PARENT_ID_BATCH = 40;
const PACKAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_CACHE_TTL_MS = 30 * 60 * 1000;

const PII_ATTR = /^(?:parentName|parent_name|email|phone|firstName|lastName)$/i;

export type PartnerPackageRow = {
  id: string | null;
  ownerId: string | null;
  packageTypeId: string | null;
  name: string | null;
  remainingCredits: string | null;
  expirationDate: string | null;
  source: string;
  record: Record<string, unknown>;
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

function appendJsonApiParams(
  params: URLSearchParams,
  options: {
    filter?: Record<string, unknown>;
    page?: { size?: number; number?: number };
  }
) {
  for (const [key, value] of Object.entries(options.filter ?? {})) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item == null || item === "") return;
        params.append(`filter[${key}][${index}]`, String(item));
      });
      continue;
    }
    if (typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        if (nestedValue == null || nestedValue === "") continue;
        params.append(`filter[${key}][${nestedKey}]`, String(nestedValue));
      }
      continue;
    }
    params.append(`filter[${key}]`, String(value));
  }
  if (options.page?.size) params.append("page[size]", String(options.page.size));
  if (options.page?.number) params.append("page[number]", String(options.page.number));
}

/** Flatten a JSON:API resource into a plain record. Strips owner display names. */
export function flattenJsonApiResource(value: unknown): Record<string, unknown> | null {
  const resource = asRecord(value);
  if (!resource) return null;
  const attributes = asRecord(resource.attributes) ?? {};
  const parent = asRecord(attributes.parent);
  const out: Record<string, unknown> = {};
  if (resource.id != null) out.id = resource.id;
  if (resource.type != null) out.type = resource.type;
  for (const [key, entry] of Object.entries(attributes)) {
    if (PII_ATTR.test(key) && key !== "packageName" && key !== "membershipType" && key !== "packageType") {
      continue;
    }
    if (key === "parent" && parent) {
      out.parentId = parent.id ?? attributes.parentId;
      continue;
    }
    out[key] = entry;
  }
  return out;
}

export function flattenJsonApiRecords(payload: unknown): Array<Record<string, unknown>> {
  const root = asRecord(payload);
  const data = root?.data;
  const items = Array.isArray(data) ? data : data ? [data] : [];
  return items.map(flattenJsonApiResource).filter((row): row is Record<string, unknown> => Boolean(row));
}

export function jsonApiPageCount(payload: unknown): { total: number | null; lastPage: number | null } {
  const root = asRecord(payload);
  const meta = asRecord(root?.meta);
  const pagination = asRecord(meta?.pagination);
  const total = Number(pagination?.total ?? meta?.total);
  const lastPage = Number(pagination?.totalPages ?? pagination?.lastPage ?? meta?.lastPage);
  return {
    total: Number.isFinite(total) ? total : null,
    lastPage: Number.isFinite(lastPage) && lastPage > 0 ? lastPage : null
  };
}

export async function gingrPartnerRequest(options: {
  path: string;
  filter?: Record<string, unknown>;
  page?: { size?: number; number?: number };
  timeoutMs?: number;
  label: string;
}): Promise<GingrV1Read> {
  try {
    const apiKey = requireTlGingrApiKey();
    const { subdomain } = tlGingrClientConfig();
    const params = new URLSearchParams();
    appendJsonApiParams(params, { filter: options.filter, page: options.page });
    const path = options.path.startsWith("/") ? options.path : `/${options.path}`;
    const qs = params.toString();
    const url = `${PARTNER_BASE_URL}${path}${qs ? `?${qs}` : ""}`;

    const response = await fetchTlGingrResponse(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/vnd.api+json",
          "X-Api-Key": apiKey,
          subdomain
        },
        cache: "no-store"
      },
      options.label,
      options.timeoutMs ?? PARTNER_TIMEOUT_MS
    );
    const status = response.status;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        status,
        payload: null,
        error: `${options.label} HTTP ${status}: ${text.slice(0, 160) || response.statusText}`
      };
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    return { ok: true, status, payload, error: null };
  } catch (error) {
    return {
      ok: false,
      status: null,
      payload: null,
      error: error instanceof Error ? error.message : `${options.label} failed.`
    };
  }
}

function attemptFromRead(
  read: GingrV1Read,
  rows: number,
  extra?: Partial<PartnerSourceAttempt>
): PartnerSourceAttempt {
  const errorNote = read.error ? redactDiagnosticMessage(read.error) : null;
  const extraNote = extra?.note;
  const note = errorNote
    ? `HTTP ${read.status ?? "none"}: ${errorNote}${extraNote ? ` (${extraNote})` : ""}`
    : extraNote;
  const { note: _ignored, ...rest } = extra ?? {};
  return {
    attempted: true,
    ok: read.ok,
    httpStatus: read.status,
    rows,
    ...rest,
    note
  };
}

async function paginatePartnerList(options: {
  path: string;
  filter?: Record<string, unknown>;
  label: string;
  cacheKey: string;
  ttlMs?: number;
}): Promise<{
  rows: Array<Record<string, unknown>>;
  attempt: PartnerSourceAttempt;
}> {
  return getOrLoadTtlCache(options.cacheKey, options.ttlMs ?? PACKAGE_CACHE_TTL_MS, async () => {
    const rows: Array<Record<string, unknown>> = [];
    let lastRead: GingrV1Read | null = null;
    let lastPage = 1;
    for (let page = 1; page <= PARTNER_MAX_PAGES; page += 1) {
      const read = await gingrPartnerRequest({
        path: options.path,
        filter: options.filter,
        page: { size: PARTNER_PAGE_SIZE, number: page },
        label: options.label
      });
      lastRead = read;
      if (!read.ok) break;
      const pageRows = flattenJsonApiRecords(read.payload);
      rows.push(...pageRows);
      const meta = jsonApiPageCount(read.payload);
      lastPage = meta.lastPage ?? (pageRows.length < PARTNER_PAGE_SIZE ? page : page + 1);
      if (page >= lastPage) break;
      if (pageRows.length < PARTNER_PAGE_SIZE) break;
    }
    return {
      rows,
      attempt: attemptFromRead(lastRead ?? { ok: false, status: null, payload: null, error: "No request." }, rows.length)
    };
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!items.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Catalog of Gingr package types — source of stable packageTypeId values. */
export async function loadPartnerPackageTypes(): Promise<{
  rows: Array<Record<string, unknown>>;
  attempt: PartnerSourceAttempt;
  capturedIds: Partial<Record<PackageGroupWalkPackageKey, string>>;
}> {
  return getOrLoadTtlCache("pgw:partner:package-types", CATALOG_CACHE_TTL_MS, async () => {
    const rows: Array<Record<string, unknown>> = [];
    const searches: Array<Record<string, unknown>> = [
      { active: "true" },
      { packageType: "Monthly Unlimited" },
      { packageType: "20-Day PLUS Package" }
    ];
    let lastRead: GingrV1Read | null = null;
    for (const filter of searches) {
      const read = await gingrPartnerRequest({
        path: "/v1/config/package-types",
        filter,
        page: { size: PARTNER_PAGE_SIZE, number: 1 },
        label: "Gingr package types"
      });
      lastRead = read;
      if (!read.ok) continue;
      rows.push(...flattenJsonApiRecords(read.payload));
    }

    const capturedIds: Partial<Record<PackageGroupWalkPackageKey, string>> = {};
    const seen = new Set<string>();
    const unique: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const id = pickString(row.id, row.packageTypeId);
      const name = pickString(row.packageType, row.name, row.internalName, row.internalPackageName);
      const key = `${id ?? ""}|${name ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
      const matched = matchEligiblePackage({ id, name });
      if (matched && id && !capturedIds[matched.key]) capturedIds[matched.key] = id;
    }

    registerConfirmedGingrPackageIds(
      Object.entries(capturedIds).map(([key, id]) => ({
        key: key as PackageGroupWalkPackageKey,
        id
      }))
    );

    return {
      rows: unique,
      capturedIds,
      attempt: attemptFromRead(
        lastRead ?? { ok: false, status: null, payload: null, error: "No request." },
        unique.length,
        {
          note: unique.length
            ? `Package type catalog returned ${unique.length} types.`
            : lastRead?.ok
              ? "Package type catalog was empty after active + name filters."
              : undefined
        }
      )
    };
  });
}

export async function loadPartnerMembershipTypes(): Promise<{
  rows: Array<Record<string, unknown>>;
  attempt: PartnerSourceAttempt;
  capturedIds: Partial<Record<PackageGroupWalkPackageKey, string>>;
}> {
  return getOrLoadTtlCache("pgw:partner:membership-types", CATALOG_CACHE_TTL_MS, async () => {
    const loaded = await paginatePartnerList({
      path: "/v1/config/membership-types",
      label: "Gingr membership types",
      cacheKey: "pgw:partner:membership-types:pages",
      ttlMs: CATALOG_CACHE_TTL_MS
    });
    const capturedIds: Partial<Record<PackageGroupWalkPackageKey, string>> = {};
    for (const row of loaded.rows) {
      const id = pickString(row.id, row.membershipTypeId);
      const name = pickString(row.membershipType, row.name);
      const matched = matchEligiblePackage({ id, name });
      if (matched && id && !capturedIds[matched.key]) capturedIds[matched.key] = id;
    }
    registerConfirmedGingrPackageIds(
      Object.entries(capturedIds).map(([key, id]) => ({
        key: key as PackageGroupWalkPackageKey,
        id
      }))
    );
    return { ...loaded, capturedIds };
  });
}

function toPartnerPackageRow(row: Record<string, unknown>, source: string): PartnerPackageRow {
  const parent = asRecord(row.parent);
  return {
    id: pickString(row.id),
    ownerId: pickString(row.parentId, row.parent_id, parent?.id),
    packageTypeId: pickString(row.packageTypeId, row.membershipTypeId, row.package_id),
    name: pickString(row.packageName, row.membershipType, row.packageType, row.name),
    remainingCredits: pickString(row.remainingCredits, row.remaining_credits),
    expirationDate: pickString(row.expirationDate, row.expiryDate, row.expiration_date),
    source,
    record: row
  };
}

/**
 * Prepaid packages held by owners. When ownerIds are provided, requests are
 * batched by unique parent id — never one call per dog.
 */
export async function loadPartnerParentPackages(ownerIds: string[]): Promise<{
  rows: PartnerPackageRow[];
  attempt: PartnerSourceAttempt;
}> {
  const unique = [...new Set(ownerIds.map((id) => String(id).trim()).filter(Boolean))];
  const cacheKey = `pgw:partner:parent-packages:${unique.slice().sort().join(",") || "none"}`;
  return getOrLoadTtlCache(cacheKey, PACKAGE_CACHE_TTL_MS, async () => {
    if (!unique.length) {
      return {
        rows: [],
        attempt: {
          attempted: false,
          ok: false,
          httpStatus: null,
          rows: 0,
          note: "No owner ids on checked-in reservations."
        }
      };
    }

    const rows: PartnerPackageRow[] = [];
    let lastRead: GingrV1Read | null = null;
    for (const batch of chunk(unique, PARENT_ID_BATCH)) {
      const loaded = await paginatePartnerList({
        path: "/v1/parents/parent-packages",
        filter: { parentIds: batch.map((id) => Number(id) || id) },
        label: "Gingr parent packages",
        cacheKey: `pgw:partner:parent-packages:batch:${batch.join(",")}`
      });
      lastRead = {
        ok: loaded.attempt.ok,
        status: loaded.attempt.httpStatus,
        payload: null,
        error: loaded.attempt.note ?? null
      };
      rows.push(...loaded.rows.map((row) => toPartnerPackageRow(row, "parent_packages")));
    }

    let note = `Fetched parent-packages for ${unique.length} unique checked-in owners in ${Math.ceil(unique.length / PARENT_ID_BATCH)} batch(es), cached 10m.`;

    if (rows.length === 0 && lastRead?.ok) {
      const comma = await paginatePartnerList({
        path: "/v1/parents/parent-packages",
        filter: { parentIds: unique.join(",") },
        label: "Gingr parent packages",
        cacheKey: `pgw:partner:parent-packages:comma:${unique.slice().sort().join(",")}`
      });
      lastRead = {
        ok: comma.attempt.ok,
        status: comma.attempt.httpStatus,
        payload: null,
        error: comma.attempt.note ?? null
      };
      rows.push(...comma.rows.map((row) => toPartnerPackageRow(row, "parent_packages")));
      if (rows.length) note = "parentIds array filter returned 0; comma-separated filter matched rows.";
    }

    if (rows.length === 0 && lastRead?.ok) {
      const unfiltered = await paginatePartnerList({
        path: "/v1/parents/parent-packages",
        label: "Gingr parent packages",
        cacheKey: "pgw:partner:parent-packages:all"
      });
      lastRead = {
        ok: unfiltered.attempt.ok,
        status: unfiltered.attempt.httpStatus,
        payload: null,
        error: unfiltered.attempt.note ?? null
      };
      const ownerSet = new Set(unique);
      const matched = unfiltered.rows
        .map((row) => toPartnerPackageRow(row, "parent_packages"))
        .filter((row) => row.ownerId && ownerSet.has(row.ownerId));
      rows.push(...matched);
      note = `parentIds filter returned 0; scanned ${unfiltered.rows.length} facility parent-packages and kept ${matched.length} for checked-in owners.`;
    }

    return {
      rows,
      attempt: attemptFromRead(
        lastRead ?? { ok: false, status: null, payload: null, error: "No request." },
        rows.length,
        { note }
      )
    };
  });
}

export async function loadPartnerParentMemberships(ownerIds: string[]): Promise<{
  rows: PartnerPackageRow[];
  attempt: PartnerSourceAttempt;
}> {
  const unique = [...new Set(ownerIds.map((id) => String(id).trim()).filter(Boolean))];
  const cacheKey = `pgw:partner:parent-memberships:${unique.slice().sort().join(",") || "none"}`;
  return getOrLoadTtlCache(cacheKey, PACKAGE_CACHE_TTL_MS, async () => {
    if (!unique.length) {
      return {
        rows: [],
        attempt: {
          attempted: false,
          ok: false,
          httpStatus: null,
          rows: 0,
          note: "No owner ids on checked-in reservations."
        }
      };
    }

    const rows: PartnerPackageRow[] = [];
    let lastAttempt: PartnerSourceAttempt | null = null;
    for (const batch of chunk(unique, PARENT_ID_BATCH)) {
      const loaded = await paginatePartnerList({
        path: "/v1/parents/parent-memberships",
        filter: { parentIds: batch.map((id) => Number(id) || id), active: true },
        label: "Gingr parent memberships",
        cacheKey: `pgw:partner:parent-memberships:batch:${batch.join(",")}`
      });
      lastAttempt = loaded.attempt;
      rows.push(...loaded.rows.map((row) => toPartnerPackageRow(row, "parent_memberships")));
    }

    return {
      rows,
      attempt: {
        ...(lastAttempt ?? { attempted: true, ok: false, httpStatus: null, rows: 0 }),
        rows: rows.length,
        note: `Fetched parent-memberships for ${unique.length} unique checked-in owners, cached 10m.`
      }
    };
  });
}

/** One unfiltered page — diagnostics only, to prove the endpoint returns facility packages. */
export async function probePartnerParentPackagesPage(): Promise<{
  rows: PartnerPackageRow[];
  attempt: PartnerSourceAttempt;
}> {
  const read = await gingrPartnerRequest({
    path: "/v1/parents/parent-packages",
    page: { size: PARTNER_PAGE_SIZE, number: 1 },
    label: "Gingr parent packages (unfiltered page)"
  });
  const records = read.ok ? flattenJsonApiRecords(read.payload) : [];
  return {
    rows: records.map((row) => toPartnerPackageRow(row, "parent_packages")),
    attempt: attemptFromRead(read, records.length, {
      note: read.ok
        ? `Unfiltered parent-packages page returned ${records.length} rows (facility-wide sample).`
        : undefined
    })
  };
}
