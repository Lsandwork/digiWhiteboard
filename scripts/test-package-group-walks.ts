/**
 * Package Group Walks regression suite.
 *
 * Covers the 22 acceptance scenarios for eligibility, completion, concurrency,
 * Gingr outage/recovery, checkout, re-check-in, daily reset, and authorization.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES,
  __resetConfirmedGingrPackageIdsForTests,
  matchEligiblePackage,
  normalizePackageName,
  preferredEligiblePackage,
  registerConfirmedGingrPackageIds
} from "../lib/package-group-walks/eligible-packages";
import {
  aggregateSanitizedPackages,
  GINGR_UNAVAILABLE_BODY,
  redactDiagnosticMessage,
  sanitizePackageRecord
} from "../lib/package-group-walks/diagnostics";
import {
  buildCsvOwnerResolutionReport,
  classifyCsvOwnerName,
  gingrOwnerFromRecord,
  inspectOwnerRecordSchema,
  matchCsvOwnersToDirectory,
  normalizeOwnerName,
  toPublicCsvOwnerResolutionLookup
} from "../lib/package-group-walks/csv-owner-resolution";
import {
  buildOwnerPackageIndex,
  deepCollectPackageCandidates,
  ownerIdFromReservation,
  ownerNameFromReservation,
  packagesFromReservation,
  type OwnerPackageIndex
} from "../lib/package-group-walks/gingr-packages";
import { flattenJsonApiResource } from "../lib/package-group-walks/gingr-partner";
import {
  applyPackageGroupWalkCompletions,
  buildPackageGroupWalkEligibility,
  buildPackageGroupWalkSummary,
  normalizeCheckInTimestamp,
  resolvePackageGroupWalkSyncState,
  sortEligibility
} from "../lib/package-group-walks/service";
import { nameFromEmail } from "../lib/package-group-walks/actor";
import { toTlBoardPackageGroupWalkRow } from "../lib/package-group-walks/tl-board";
import { canAccessAdminTab } from "../lib/admin/permissions";
import { ADMIN_TABS } from "../lib/admin/types";
import type { GingrReservation } from "../lib/integrations/gingr/types";
import type {
  PackageGroupWalkCompletion,
  PackageGroupWalkEligibility
} from "../lib/package-group-walks/types";

function source(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const BUSINESS_DATE = "2026-08-19";

function reservation(input: {
  animalId: string;
  dogName: string;
  ownerId?: string | null;
  ownerFirst?: string;
  ownerLast?: string;
  packages?: unknown;
  checkInStamp?: unknown;
  reservationId?: string;
}): GingrReservation {
  return {
    id: input.reservationId ?? `res-${input.animalId}`,
    animal: { id: input.animalId, name: input.dogName, image: null },
    owner: {
      id: input.ownerId ?? `owner-${input.animalId}`,
      first_name: input.ownerFirst ?? "Owner",
      last_name: input.ownerLast ?? input.animalId,
      ...(input.packages ? { packages: input.packages } : {})
    },
    check_in_stamp: input.checkInStamp ?? 1_755_600_000
  } as unknown as GingrReservation;
}

function emptyIndex(): OwnerPackageIndex {
  return {
    byOwnerId: new Map(),
    sources: ["reservation"],
    available: true,
    errors: [],
    uniqueCheckedInOwners: 0,
    packageRowsInspected: 0,
    capturedIds: { monthly_unlimited: null, twenty_day_plus: null },
    attempts: {},
    ownerFieldNames: []
  };
}

function eligibilityFor(reservations: GingrReservation[], index = emptyIndex()) {
  return buildPackageGroupWalkEligibility({
    reservations,
    packageIndex: index,
    businessDate: BUSINESS_DATE
  });
}

function completion(
  overrides: Partial<PackageGroupWalkCompletion> & { gingrAnimalId: string }
): PackageGroupWalkCompletion {
  return {
    id: `cmp-${overrides.gingrAnimalId}`,
    businessDate: BUSINESS_DATE,
    dogName: "Dog",
    photoUrl: null,
    gingrOwnerId: null,
    ownerName: null,
    packageKey: "monthly_unlimited",
    packageName: "Monthly Unlimited",
    completedAt: "2026-08-19T23:52:00.000Z",
    completedByUserId: "user-julie",
    completedByUserName: "Julie",
    ...overrides
  };
}

/* ------------------------------------------------------------------ *
 * Package matching — exact, never substring
 * ------------------------------------------------------------------ */

assert.equal(PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES.length, 2);
assert.equal(normalizePackageName("20-Day PLUS Package"), "20 day plus package");
assert.equal(normalizePackageName("  Monthly   Unlimited "), "monthly unlimited");

assert.equal(matchEligiblePackage({ name: "Monthly Unlimited" })?.key, "monthly_unlimited");
assert.equal(matchEligiblePackage({ name: "monthly unlimited" })?.key, "monthly_unlimited");
assert.equal(matchEligiblePackage({ name: "20-Day PLUS Package" })?.key, "twenty_day_plus");
assert.equal(matchEligiblePackage({ name: "20 Day Plus Package" })?.key, "twenty_day_plus");

{
  const nested = {
    form_data: JSON.stringify({
      current_packages: [{ name: "Monthly Unlimited", remainingCredits: "5" }]
    })
  };
  const candidates = deepCollectPackageCandidates(nested);
  assert.ok(candidates.some((candidate) => matchEligiblePackage(candidate)?.key === "monthly_unlimited"));
}

// TEST 3 — ineligible packages must never qualify, including near-miss names.
for (const ineligible of [
  "10-Day Package",
  "10-Day PLUS Package",
  "Unlimited Grooming",
  "Monthly Unlimited Grooming Add-On",
  "PLUS Package",
  "20-Day Package",
  "Daycare 20 Day",
  "",
  "   "
]) {
  assert.equal(matchEligiblePackage({ name: ineligible }), null, `must not match: ${ineligible}`);
}

// TEST 18 — both eligible packages resolve deterministically to one walk.
{
  const both = PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES.map((entry) => entry);
  assert.equal(preferredEligiblePackage(both)?.key, "monthly_unlimited");
  assert.equal(preferredEligiblePackage([...both].reverse())?.key, "monthly_unlimited");
  assert.equal(preferredEligiblePackage([]), null);
}

{
  // Runtime-confirmed Gingr package type ids win over display names.
  __resetConfirmedGingrPackageIdsForTests();
  assert.equal(matchEligiblePackage({ id: "4242" }), null);
  registerConfirmedGingrPackageIds([{ id: "4242", key: "monthly_unlimited" }]);
  assert.equal(matchEligiblePackage({ id: "4242" })?.key, "monthly_unlimited");
  __resetConfirmedGingrPackageIdsForTests();
}

{
  const flattened = flattenJsonApiResource({
    type: "parent-packages",
    id: 99,
    attributes: {
      parentId: 12,
      parentName: "SECRET PERSON",
      packageTypeId: 69,
      packageName: "Monthly Unlimited",
      remainingCredits: "5.00"
    }
  });
  assert.equal(flattened?.parentName, undefined);
  assert.equal(flattened?.packageName, "Monthly Unlimited");
  assert.equal(flattened?.packageTypeId, 69);
  assert.equal(
    matchEligiblePackage({
      id: String(flattened?.packageTypeId),
      name: String(flattened?.packageName)
    })?.key,
    "monthly_unlimited"
  );
}

/* ------------------------------------------------------------------ *
 * Gingr payload parsing
 * ------------------------------------------------------------------ */

assert.equal(
  ownerIdFromReservation(reservation({ animalId: "1", dogName: "Atlas", ownerId: "o-1" })),
  "o-1"
);
assert.equal(
  ownerNameFromReservation(
    reservation({ animalId: "1", dogName: "Atlas", ownerFirst: "Jane", ownerLast: "Doe" })
  ),
  "Jane Doe"
);

{
  // Packages embedded on the reservation cost zero extra Gingr requests.
  const withPackages = reservation({
    animalId: "1",
    dogName: "Atlas",
    packages: [{ id: "pkg-9", name: "Monthly Unlimited" }]
  });
  const resolved = packagesFromReservation(withPackages);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]!.definition.key, "monthly_unlimited");
  assert.equal(resolved[0]!.gingrPackageId, "pkg-9");
  assert.equal(resolved[0]!.source, "reservation_owner");
}

{
  // Cancelled / expired package rows are ignored.
  const cancelled = reservation({
    animalId: "2",
    dogName: "Luna",
    packages: [{ id: "pkg-1", name: "Monthly Unlimited", status: "cancelled" }]
  });
  assert.deepEqual(packagesFromReservation(cancelled), []);

  const expired = reservation({
    animalId: "3",
    dogName: "Nova",
    packages: [{ id: "pkg-2", name: "Monthly Unlimited", active: false }]
  });
  assert.deepEqual(packagesFromReservation(expired), []);

  const depleted = reservation({
    animalId: "4",
    dogName: "Pip",
    packages: [{ id: "pkg-3", name: "Monthly Unlimited", remainingCredits: "0.00" }]
  });
  assert.deepEqual(packagesFromReservation(depleted), []);
}

{
  // Reservation type name is a zero-cost source when Gingr books the stay as the package.
  const typed = reservation({ animalId: "5", dogName: "Scout", ownerId: "owner-5" });
  (typed as Record<string, unknown>).type = "Monthly Unlimited";
  (typed as Record<string, unknown>).type_id = "12";
  const resolved = packagesFromReservation(typed);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]!.definition.key, "monthly_unlimited");
  assert.equal(resolved[0]!.gingrPackageId, "12");
  assert.equal(resolved[0]!.source, "reservation_type");
}

// Gingr check-in stamps arrive as unix seconds or ISO strings.
assert.equal(normalizeCheckInTimestamp(1_755_600_000), "2025-08-19T10:40:00.000Z");
// Millisecond stamps are passed through without a second multiplication.
assert.equal(normalizeCheckInTimestamp(1_755_600_000_000), "2025-08-19T10:40:00.000Z");
assert.equal(normalizeCheckInTimestamp("2026-08-19T15:14:00.000Z"), "2026-08-19T15:14:00.000Z");
assert.equal(normalizeCheckInTimestamp(null), null);
assert.equal(normalizeCheckInTimestamp(""), null);
assert.equal(normalizeCheckInTimestamp("not-a-date"), null);
assert.equal(normalizeCheckInTimestamp(0), null);

/* ------------------------------------------------------------------ *
 * Eligibility
 * ------------------------------------------------------------------ */

// TEST 1 — Monthly Unlimited dog checked in appears.
{
  const { eligibility } = eligibilityFor([
    reservation({
      animalId: "atlas",
      dogName: "Atlas",
      packages: [{ name: "Monthly Unlimited" }]
    })
  ]);
  assert.equal(eligibility.length, 1);
  assert.equal(eligibility[0]!.dogName, "Atlas");
  assert.equal(eligibility[0]!.packageName, "Monthly Unlimited");
  assert.equal(eligibility[0]!.businessDate, BUSINESS_DATE);
  assert.equal(eligibility[0]!.id, `${BUSINESS_DATE}:atlas`);
}

// TEST 2 — 20-Day PLUS Package dog appears.
{
  const { eligibility } = eligibilityFor([
    reservation({
      animalId: "heidi",
      dogName: "Heidi",
      packages: [{ name: "20-Day PLUS Package" }]
    })
  ]);
  assert.equal(eligibility.length, 1);
  assert.equal(eligibility[0]!.packageKey, "twenty_day_plus");
}

// TEST 3 — ineligible package does not appear.
{
  const { eligibility } = eligibilityFor([
    reservation({ animalId: "rex", dogName: "Rex", packages: [{ name: "10-Day Package" }] })
  ]);
  assert.deepEqual(eligibility, []);
}

// TEST 4 — eligible but NOT checked in never reaches eligibility, because the
// only input is Gingr's currently-checked-in reservation list.
{
  const { eligibility } = eligibilityFor([]);
  assert.deepEqual(eligibility, []);
}

// TEST 16 — duplicate Gingr payload for the same animal yields one row.
{
  const { eligibility } = eligibilityFor([
    reservation({
      animalId: "atlas",
      dogName: "Atlas",
      reservationId: "res-a",
      checkInStamp: "2026-08-19T16:00:00.000Z",
      packages: [{ name: "Monthly Unlimited" }]
    }),
    reservation({
      animalId: "atlas",
      dogName: "Atlas",
      reservationId: "res-b",
      checkInStamp: "2026-08-19T15:00:00.000Z",
      packages: [{ name: "Monthly Unlimited" }]
    })
  ]);
  assert.equal(eligibility.length, 1);
  // Earliest check-in wins so the sort order stays stable.
  assert.equal(eligibility[0]!.checkedInAt, "2026-08-19T15:00:00.000Z");
}

// TEST 17 — multiple dogs on one owner are independently eligible.
{
  const index = emptyIndex();
  index.byOwnerId.set("owner-shared", [
    {
      definition: PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES[0]!,
      gingrPackageId: "pkg-1",
      rawName: "Monthly Unlimited",
      source: "subscriptions"
    }
  ]);
  const { eligibility } = eligibilityFor(
    [
      reservation({ animalId: "atlas", dogName: "Atlas", ownerId: "owner-shared" }),
      reservation({ animalId: "luna", dogName: "Luna", ownerId: "owner-shared" })
    ],
    index
  );
  assert.equal(eligibility.length, 2);
  assert.deepEqual(
    eligibility.map((row) => row.dogName).sort(),
    ["Atlas", "Luna"]
  );
}

// TEST 18 (row level) — a dog matching both packages gets exactly one row.
{
  const { eligibility } = eligibilityFor([
    reservation({
      animalId: "yuki",
      dogName: "Yuki",
      packages: [{ name: "20-Day PLUS Package" }, { name: "Monthly Unlimited" }]
    })
  ]);
  assert.equal(eligibility.length, 1);
  assert.equal(eligibility[0]!.packageKey, "monthly_unlimited");
}

// Malformed records are skipped without breaking the whole list.
{
  const { eligibility, malformedCount } = eligibilityFor([
    { id: "broken" } as unknown as GingrReservation,
    reservation({ animalId: "", dogName: "Nameless", packages: [{ name: "Monthly Unlimited" }] }),
    reservation({ animalId: "baxter", dogName: "Baxter", packages: [{ name: "Monthly Unlimited" }] })
  ]);
  assert.equal(eligibility.length, 1);
  assert.equal(eligibility[0]!.dogName, "Baxter");
  assert.ok(malformedCount >= 2);
}

// Stable sort: check-in ascending, then dog name. Never random.
{
  const rows = [
    { checkedInAt: null, dogName: "Zeus" },
    { checkedInAt: "2026-08-19T16:00:00.000Z", dogName: "Baxter" },
    { checkedInAt: "2026-08-19T15:00:00.000Z", dogName: "Koda" },
    { checkedInAt: null, dogName: "Atlas" }
  ];
  assert.deepEqual(
    sortEligibility(rows).map((row) => row.dogName),
    ["Koda", "Baxter", "Atlas", "Zeus"]
  );
  // Sorting twice is identical — no reshuffle on refresh.
  assert.deepEqual(sortEligibility(sortEligibility(rows)), sortEligibility(rows));
}

/* ------------------------------------------------------------------ *
 * Completion overlay
 * ------------------------------------------------------------------ */

const atlas: PackageGroupWalkEligibility = {
  id: `${BUSINESS_DATE}:atlas`,
  gingrAnimalId: "atlas",
  dogName: "Atlas",
  photoUrl: null,
  gingrOwnerId: "owner-1",
  ownerName: "Jane Doe",
  gingrReservationId: "res-1",
  checkedInAt: "2026-08-19T15:14:00.000Z",
  packageKey: "monthly_unlimited",
  packageName: "Monthly Unlimited",
  gingrPackageId: "pkg-1",
  packageSource: "subscriptions",
  businessDate: BUSINESS_DATE
};
const baxter: PackageGroupWalkEligibility = {
  ...atlas,
  id: `${BUSINESS_DATE}:baxter`,
  gingrAnimalId: "baxter",
  dogName: "Baxter"
};

// TEST 5 — completed dog leaves the active list and appears under Completed Today.
{
  const completions = new Map<string, PackageGroupWalkCompletion>();
  completions.set("atlas", completion({ gingrAnimalId: "atlas", dogName: "Atlas" }));
  const { pending, completed } = applyPackageGroupWalkCompletions({
    eligibility: [atlas, baxter],
    completions
  });
  assert.deepEqual(pending.map((row) => row.dogName), ["Baxter"]);
  assert.deepEqual(completed.map((row) => row.dogName), ["Atlas"]);
  assert.equal(completed[0]!.completedByUserName, "Julie");
  assert.equal(pending[0]!.status, "pending");
  assert.equal(pending[0]!.completion, null);

  const summary = buildPackageGroupWalkSummary({ pending, completed });
  assert.deepEqual(summary, { eligibleToday: 2, remaining: 1, completed: 1 });
}

// TEST 11 — a dog checked out in Gingr drops off the active list. The
// completion history for a checked-out dog is still retained.
{
  const completions = new Map<string, PackageGroupWalkCompletion>();
  completions.set("koda", completion({ gingrAnimalId: "koda", dogName: "Koda" }));
  const { pending, completed } = applyPackageGroupWalkCompletions({
    eligibility: [atlas],
    completions
  });
  // Baxter/Koda are no longer checked in, so no pending row exists for them.
  assert.deepEqual(pending.map((row) => row.dogName), ["Atlas"]);
  assert.deepEqual(completed.map((row) => row.dogName), ["Koda"]);
}

// TEST 12 — re-check-in on the same business day does not require a second walk.
{
  const completions = new Map<string, PackageGroupWalkCompletion>();
  completions.set("atlas", completion({ gingrAnimalId: "atlas", dogName: "Atlas" }));
  const { pending } = applyPackageGroupWalkCompletions({
    eligibility: [{ ...atlas, gingrReservationId: "res-second-checkin" }],
    completions
  });
  assert.deepEqual(pending, []);
}

// TEST 13 — a new business day requires a new walk (yesterday's key differs).
{
  const todayEligibility: PackageGroupWalkEligibility = {
    ...atlas,
    businessDate: "2026-08-20",
    id: "2026-08-20:atlas"
  };
  // Today's completion query is scoped to today's business date, so yesterday's
  // completion is simply absent from the map.
  const { pending } = applyPackageGroupWalkCompletions({
    eligibility: [todayEligibility],
    completions: new Map()
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.businessDate, "2026-08-20");
}

// Completed Today is newest first.
{
  const completions = new Map<string, PackageGroupWalkCompletion>();
  completions.set(
    "a",
    completion({ gingrAnimalId: "a", dogName: "A", completedAt: "2026-08-19T20:00:00.000Z" })
  );
  completions.set(
    "b",
    completion({ gingrAnimalId: "b", dogName: "B", completedAt: "2026-08-19T22:00:00.000Z" })
  );
  const { completed } = applyPackageGroupWalkCompletions({ eligibility: [], completions });
  assert.deepEqual(completed.map((row) => row.dogName), ["B", "A"]);
}

/* ------------------------------------------------------------------ *
 * Sync states — Gingr outage must never read as All Clear
 * ------------------------------------------------------------------ */

// TEST 14 — Gingr offline with no prior sync is an ERROR, not EMPTY_VALID.
assert.equal(
  resolvePackageGroupWalkSyncState({
    gingrOk: false,
    isStale: true,
    packageSourceAvailable: false,
    hasRows: false,
    lastSuccessfulSyncAt: null
  }),
  "ERROR"
);

// Gingr offline with a prior good sync shows STALE (last-known-good rows).
assert.equal(
  resolvePackageGroupWalkSyncState({
    gingrOk: false,
    isStale: true,
    packageSourceAvailable: true,
    hasRows: true,
    lastSuccessfulSyncAt: "2026-08-19T23:48:00.000Z"
  }),
  "STALE"
);

// A successful sync with zero eligible dogs is the only valid All Clear.
assert.equal(
  resolvePackageGroupWalkSyncState({
    gingrOk: true,
    isStale: false,
    packageSourceAvailable: true,
    hasRows: false,
    lastSuccessfulSyncAt: "2026-08-19T23:50:00.000Z"
  }),
  "EMPTY_VALID"
);

// Reservations read fine but no package source answered — cannot assert All Clear.
assert.equal(
  resolvePackageGroupWalkSyncState({
    gingrOk: true,
    isStale: false,
    packageSourceAvailable: false,
    hasRows: false,
    lastSuccessfulSyncAt: "2026-08-19T23:50:00.000Z"
  }),
  "ERROR"
);

// TEST 15 — recovery returns to LIVE with rows, no reload required.
assert.equal(
  resolvePackageGroupWalkSyncState({
    gingrOk: true,
    isStale: false,
    packageSourceAvailable: true,
    hasRows: true,
    lastSuccessfulSyncAt: "2026-08-19T23:55:00.000Z"
  }),
  "LIVE"
);

/* ------------------------------------------------------------------ *
 * Whiteboard projection
 * ------------------------------------------------------------------ */

{
  const row = toTlBoardPackageGroupWalkRow({ ...atlas, status: "pending", completion: null });
  assert.deepEqual(row, {
    id: `${BUSINESS_DATE}:atlas`,
    gingrAnimalId: "atlas",
    dogName: "Atlas",
    photoUrl: null,
    packageKey: "monthly_unlimited",
    packageName: "Monthly Unlimited",
    checkedInAt: "2026-08-19T15:14:00.000Z",
    businessDate: BUSINESS_DATE
  });
  // Owner details stay off the TV projection.
  assert.equal("ownerName" in row, false);
  assert.equal("gingrOwnerId" in row, false);
}

/* ------------------------------------------------------------------ *
 * TEST 20/21 — authorization and identity
 * ------------------------------------------------------------------ */

{
  const route = source("app/api/admin/package-group-walks/route.ts");
  // Unauthenticated requests are rejected before any database work.
  assert.match(route, /if \(!isAdminRequest\(request\)\) return unauthorizedAdminResponse\(\);/);
  assert.match(route, /if \(!session\?\.email\)/);
  // The completing employee comes from the session, never the request body.
  assert.match(route, /resolvePackageGroupWalkActor\(supabase, session\)/);
  assert.match(route, /completedByUserId: actor\.userId/);
  assert.match(route, /completedByUserName: actor\.displayName/);
  assert.doesNotMatch(route, /body\.completedBy/);
  assert.doesNotMatch(route, /body\.userId/);
  assert.doesNotMatch(route, /body\.completedByUserId/);
  // Server-side eligibility check before writing.
  assert.match(route, /findEligibleDogForCompletion/);
  // Audit trail.
  assert.match(route, /package_group_walk\.completed/);
  assert.match(route, /writeAdminAuditLog/);
}

// TEST 21 — an actor name is always resolvable for the audit record.
assert.equal(nameFromEmail("julie@fitdog.com"), "Julie");
assert.equal(nameFromEmail("lane.smith@fitdog.com"), "Lane Smith");
assert.equal(nameFromEmail(""), "Staff");

/* ------------------------------------------------------------------ *
 * TEST 7/8/19 — atomic, idempotent completion
 * ------------------------------------------------------------------ */

{
  const store = source("lib/package-group-walks/store.ts");
  // Double click / concurrent users collapse to one row via the DB constraint.
  assert.match(store, /UNIQUE_VIOLATION = "23505"/);
  assert.match(store, /findExistingCompletion/);
  assert.match(store, /created: false/);
  // Business date is Pacific, never UTC truncation.
  assert.match(store, /todayInLosAngeles/);
  assert.doesNotMatch(store, /toISOString\(\)\.slice\(0, 10\)/);

  const migration = source("supabase/migrations/082_package_group_walks.sql");
  assert.match(migration, /create unique index if not exists package_group_walks_unique_completion_idx/);
  assert.match(migration, /\(business_date, gingr_animal_id, walk_type\)/);
  assert.match(migration, /where status = 'completed'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /for all using \(false\) with check \(false\)/);
  assert.match(migration, /grant select, insert, update, delete on table public\.package_group_walks to service_role/);
  assert.match(migration, /business_date date not null/);
  assert.match(migration, /completed_at timestamptz not null/);
  assert.match(migration, /package_group_walks_business_date_idx/);
  assert.match(migration, /package_group_walks_animal_history_idx/);
  assert.match(migration, /supabase_realtime add table public\.package_group_walks/);
}

/* ------------------------------------------------------------------ *
 * TEST 22 — no N+1 Gingr traffic
 * ------------------------------------------------------------------ */

{
  const packages = source("lib/package-group-walks/gingr-packages.ts");
  const partner = source("lib/package-group-walks/gingr-partner.ts");
  const v1 = source("lib/package-group-walks/gingr-v1.ts");
  assert.match(v1, /gingrV1Request/);
  assert.match(packages, /\/api\/v1\/get_subscriptions/);
  assert.match(packages, /owner_id: ownerId/);
  assert.match(packages, /loadOwnersListForCheckedInOwners/);
  assert.match(packages, /deepCollectPackageCandidates/);
  assert.match(partner, /resolveGingrPartnerApiKey/);
  assert.match(packages, /\/api\/v1\/owner/);
  assert.match(partner, /\/v1\/parents\/parent-packages/);
  assert.match(partner, /\/v1\/config\/package-types/);
  assert.match(partner, /PARENT_ID_BATCH/);
  assert.match(partner, /X-Api-Key/);
  assert.match(partner, /HTTP \$\{read\.status/);
  assert.match(packages, /OWNER_PACKAGE_CACHE_TTL_MS/);
  assert.match(packages, /OWNER_FETCH_CONCURRENCY/);
  assert.match(packages, /new Set\(ownerIds/);
  assert.match(packages, /HTTP \$\{read\.status/);
  assert.match(packages, /attempts\.subscriptions/);
  assert.doesNotMatch(packages, /for \(const reservation of reservations\) \{\s+await gingrV1Request/);
  assert.doesNotMatch(partner, /for \(const reservation of reservations\)/);

  const service = source("lib/package-group-walks/service.ts");
  assert.match(service, /loadTlBoardCheckedInReservations/);
  assert.match(service, /loadCompletionsForBusinessDate/);
  assert.match(service, /getOrLoadTtlCache/);
}

// 50 checked-in dogs still resolve through the bulk index with no per-dog work.
{
  const index = emptyIndex();
  const reservations: GingrReservation[] = [];
  for (let i = 0; i < 50; i += 1) {
    const ownerId = `owner-${i}`;
    reservations.push(reservation({ animalId: `dog-${i}`, dogName: `Dog ${i}`, ownerId }));
    if (i % 2 === 0) {
      index.byOwnerId.set(ownerId, [
        {
          definition: PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES[i % 2 === 0 ? 0 : 1]!,
          gingrPackageId: `pkg-${i}`,
          rawName: "Monthly Unlimited",
          source: "subscriptions"
        }
      ]);
    }
  }
  const started = Date.now();
  const { eligibility } = eligibilityFor(reservations, index);
  assert.equal(eligibility.length, 25);
  assert.ok(Date.now() - started < 500, "50-dog eligibility must stay fast");
}

/* ------------------------------------------------------------------ *
 * Access control — any authenticated staff user
 * ------------------------------------------------------------------ */

assert.ok((ADMIN_TABS as readonly string[]).includes("package_group_walks"));
{
  // Nav wiring is asserted from source: importing nav-groups here would create a
  // circular import with permissions and hit the TAB_LABELS temporal dead zone.
  const nav = source("lib/admin/nav-groups.ts");
  assert.match(nav, /package_group_walks: "Package Group Walks"/);
  assert.match(nav, /"walks_board",\n\s+"package_group_walks",/);
  const superAdminNav = source("lib/admin/super-admin-nav.ts");
  assert.match(superAdminNav, /tabLink\(\s*"package_group_walks"/);
  const dashboard = source("components/admin/AdminDashboard.tsx");
  assert.match(dashboard, /tab === "package_group_walks" \? <PackageGroupWalksPanel \/> : null/);
  // Full-width operational page — no whiteboard preview rail.
  assert.match(dashboard, /"walks_board", "package_group_walks"/);
}

for (const role of [
  "owner_admin",
  "manager_admin",
  "management",
  "assistant_manager",
  "front_desk_coordinator",
  "team_leader",
  "groomer",
  "trainer",
  "daycare",
  "driver",
  "hiker",
  "viewer"
]) {
  assert.equal(
    canAccessAdminTab(null, "package_group_walks", role, "staff"),
    true,
    `${role} must be able to open Package Group Walks`
  );
}

// Not a lobby/marketing surface.
assert.equal(canAccessAdminTab(null, "package_group_walks", "team_leader", "lobby"), false);
assert.equal(canAccessAdminTab(null, "package_group_walks", "marketing", "marketing"), false);

/* ------------------------------------------------------------------ *
 * TEST 6/9/10 — shared source of truth, wiring, and no client secrets
 * ------------------------------------------------------------------ */

{
  // Both screens consume the same canonical service.
  const tlBoard = source("lib/package-group-walks/tl-board.ts");
  assert.match(tlBoard, /loadPackageGroupWalkState/);

  const sync = source("lib/tl-digi-board/sync.ts");
  assert.match(sync, /syncTlBoardPackageGroupWalks/);
  // A Package Group Walks failure must not take down meds/services.
  assert.match(sync, /syncTlBoardPackageGroupWalks\(_supabase, \{ now \}\)\.catch/);

  const panel = source("components/admin/PackageGroupWalksPanel.tsx");
  assert.match(panel, /\/api\/admin\/package-group-walks/);
  assert.match(panel, /package_group_walks/);
  assert.match(panel, /Saving…/);
  assert.match(panel, /Mark Completed/);
  assert.match(panel, /Completed Today/);
  assert.match(panel, /Checking Gingr…/);
  assert.match(panel, /All Package Group Walks Clear/);
  assert.match(panel, /Unable to verify Package Group Walk eligibility/);
  assert.match(panel, /visibilitychange/);
  // TEST 10 — whiteboard removes the dog without a manual reload.
  const board = source("components/boards/TlAlertsRemindersBoard.tsx");
  assert.match(board, /package-group-walks/);
  assert.match(board, /Unable to verify \{errorNoun\}/);
  assert.match(board, /errorNoun="Package Group Walk eligibility"/);
  assert.match(board, /This is not All Clear/);
  assert.match(board, /completedWalkAnimalIds/);
  assert.doesNotMatch(board, /window\.location\.reload/);

  // No privileged Gingr or Supabase material may reach the browser.
  for (const path of [
    "components/admin/PackageGroupWalksPanel.tsx",
    "components/boards/TlAlertsRemindersBoard.tsx"
  ]) {
    const text = source(path);
    assert.doesNotMatch(text, /GINGR_API_KEY|TL_GINGR_KEY|SUPABASE_SERVICE_ROLE_KEY/, path);
    assert.doesNotMatch(text, /gingrapp\.com/, path);
  }

  const eligible = source("lib/package-group-walks/eligible-packages.ts");
  assert.doesNotMatch(eligible, /NEXT_PUBLIC_/);
}

assert.equal(existsSync(join(process.cwd(), "app/api/admin/package-group-walks/route.ts")), true);
assert.equal(
  existsSync(join(process.cwd(), "app/api/admin/package-group-walks/diagnostics/route.ts")),
  true
);
assert.equal(
  existsSync(join(process.cwd(), "app/api/admin/package-group-walks/csv-owner-resolution/route.ts")),
  false
);
assert.equal(
  existsSync(join(process.cwd(), "lib/package-group-walks/csv-owner-resolution-fixture.ts")),
  false
);
assert.equal(
  existsSync(join(process.cwd(), "app/api/boards/tl-alerts-reminders/package-group-walks/route.ts")),
  true
);

/* ------------------------------------------------------------------ *
 * Diagnostics route — auth, Gingr failure, sanitized package shape
 * ------------------------------------------------------------------ */

{
  const diagnostics = source("app/api/admin/package-group-walks/diagnostics/route.ts");
  assert.match(diagnostics, /export async function GET/);
  assert.match(diagnostics, /if \(!isAdminRequest\(request\)\) return unauthorizedAdminResponse\(\);/);
  assert.match(diagnostics, /isFullAdminRole\(getEffectiveAdminRole\(request\)\)/);
  assert.match(diagnostics, /status: 403/);
  assert.match(diagnostics, /GINGR_UNAVAILABLE/);
  assert.match(diagnostics, /status: 503/);
  assert.match(diagnostics, /packageSources/);
  assert.match(diagnostics, /eligibleDogs/);
  assert.match(diagnostics, /discoverGingrPackageSources/);
  assert.match(diagnostics, /qualifyingCheckedInDogs/);
  assert.match(diagnostics, /attempts: packageIndex\.attempts/);
  assert.match(diagnostics, /ownerFieldNames: packageIndex\.ownerFieldNames/);
  const packageLookup = source("lib/package-group-walks/gingr-packages.ts");
  assert.match(packageLookup, /parentPackages/);

  const middleware = source("middleware.ts");
  assert.match(middleware, /matcher:/);
  assert.doesNotMatch(middleware, /"\/api"/);
  assert.doesNotMatch(middleware, /"\/api\/:path\*"/);
}

{
  const monthly = sanitizePackageRecord(
    {
      id: "sub-1",
      owner_id: "owner-9",
      package_id: "42",
      product_id: "900",
      subscription_id: "sub-1",
      name: "Monthly Unlimited",
      type: "package",
      api_key: "should-never-leak",
      email: "owner@example.com",
      first_name: "Pat",
      package: { id: "42", name: "Monthly Unlimited", code: "MU" }
    },
    "subscriptions",
    "owner-9"
  );
  assert.equal(monthly?.eligible, true);
  assert.equal(monthly?.matchReason, "name");
  assert.equal(monthly?.matchedKey, "monthly_unlimited");
  assert.equal(monthly?.packageId, "42");
  assert.equal(monthly?.productId, "900");
  assert.equal(monthly?.subscriptionId, "sub-1");
  assert.equal(monthly?.normalizedName, "monthly unlimited");
  assert.equal(monthly?.availableFields.includes("api_key"), false);
  assert.equal(monthly?.availableFields.includes("email"), false);
  assert.equal(monthly?.availableFields.includes("first_name"), false);
  assert.ok(monthly?.availableFields.includes("package_id"));
  assert.ok(monthly?.availableFields.includes("nested.code"));

  const plus = sanitizePackageRecord(
    { package_id: "77", name: "20-Day PLUS Package" },
    "subscriptions",
    "owner-2"
  );
  assert.equal(plus?.eligible, true);
  assert.equal(plus?.matchedKey, "twenty_day_plus");

  const nearMiss = sanitizePackageRecord({ name: "10-Day PLUS Package" }, "subscriptions", "owner-3");
  assert.equal(nearMiss?.eligible, false);
  assert.equal(nearMiss?.matchReason, null);

  const aggregated = aggregateSanitizedPackages([monthly, monthly, plus]);
  assert.equal(aggregated[0]?.count, 2);
  assert.equal(GINGR_UNAVAILABLE_BODY.error, "GINGR_UNAVAILABLE");
  assert.equal(redactDiagnosticMessage("Gingr 401 key=super-secret-value boom"), "Gingr 401 key=REDACTED boom");
}

/* ------------------------------------------------------------------ *
 * Bulk index construction stays resilient
 * ------------------------------------------------------------------ */

async function testOwnerPackageIndexResilience() {
  // With no Gingr key configured the subscriptions pull fails; reservation-embedded
  // matches still prove a working package source.
  const previousTl = process.env.TL_GINGR_KEY;
  const previousGingr = process.env.GINGR_API_KEY;
  delete process.env.TL_GINGR_KEY;
  delete process.env.GINGR_API_KEY;
  try {
    const index = await buildOwnerPackageIndex([
      reservation({
        animalId: "atlas",
        dogName: "Atlas",
        ownerId: "owner-1",
        packages: [{ name: "Monthly Unlimited" }]
      })
    ]);
    assert.equal(index.available, true);
    assert.ok(index.sources.includes("reservation"));
    assert.ok(index.errors.length >= 1);
    assert.equal(index.byOwnerId.get("owner-1")?.length, 1);

    // No reservation packages and no subscriptions → unavailable, so the UI
    // must not claim All Clear.
    const empty = await buildOwnerPackageIndex([
      reservation({ animalId: "rex", dogName: "Rex", ownerId: "owner-2" })
    ]);
    assert.equal(empty.available, false);
  } finally {
    if (previousTl != null) process.env.TL_GINGR_KEY = previousTl;
    if (previousGingr != null) process.env.GINGR_API_KEY = previousGingr;
  }
}

/* ------------------------------------------------------------------ *
 * CSV owner resolution — exact unique match only, no PII in reports
 * ------------------------------------------------------------------ */

{
  assert.equal(normalizeOwnerName("  Ada   Lovelace  "), "ada lovelace");
  assert.equal(normalizeOwnerName("ADA LOVELACE"), "ada lovelace");
  assert.notEqual(normalizeOwnerName("Mary-Ann Smith"), normalizeOwnerName("Mary Ann Smith"));

  const schema = inspectOwnerRecordSchema(
    {
      system_id: "1001",
      first_name: "Ada",
      last_name: "Lovelace",
      email: "hidden@example.com",
      deleted: "0",
      password: "nope"
    },
    [
      {
        system_id: "1001",
        first_name: "Ada",
        last_name: "Lovelace",
        email: "hidden@example.com",
        deleted: "0",
        password: "nope"
      }
    ]
  );
  assert.equal(schema.stableIdField, "system_id");
  assert.equal(schema.firstNameField, "first_name");
  assert.equal(schema.lastNameField, "last_name");
  assert.equal(schema.activeDeletedField, "deleted");
  assert.ok(schema.sanitizedOwnerFieldNames.includes("email"));
  assert.equal(schema.sanitizedOwnerFieldNames.includes("password"), false);

  const directory = [
    gingrOwnerFromRecord(
      { system_id: "1001", first_name: "Ada", last_name: "Lovelace", deleted: "0" },
      schema
    )!,
    gingrOwnerFromRecord(
      { system_id: "1002", first_name: "Ada", last_name: "Lovelace", deleted: "0" },
      schema
    )!,
    gingrOwnerFromRecord(
      { system_id: "1003", first_name: "Grace", last_name: "Hopper", deleted: "1" },
      schema
    )!,
    gingrOwnerFromRecord(
      { system_id: "1004", first_name: "Alan", last_name: "Turing", deleted: "0" },
      schema
    )!
  ];
  const byName = new Map<string, typeof directory>();
  for (const owner of directory) {
    const list = byName.get(owner.normalizedFullName) ?? [];
    list.push(owner);
    byName.set(owner.normalizedFullName, list);
  }
  assert.equal(classifyCsvOwnerName("Alan Turing", byName).classification, "UNIQUE_EXACT_MATCH");
  assert.equal(classifyCsvOwnerName("Ada Lovelace", byName).classification, "MULTIPLE_EXACT_MATCH");
  assert.equal(classifyCsvOwnerName("Grace Hopper", byName).classification, "ZERO_MATCH");
  assert.equal(classifyCsvOwnerName("Nobody Here", byName).classification, "ZERO_MATCH");

  const matched = matchCsvOwnersToDirectory(
    [
      {
        ownerDisplayName: "Alan Turing",
        packageKey: "monthly_unlimited",
        packageType: "Monthly Unlimited"
      },
      {
        ownerDisplayName: "Ada Lovelace",
        packageKey: "twenty_day_plus",
        packageType: "20-Day PLUS Package"
      },
      {
        ownerDisplayName: "Grace Hopper",
        packageKey: "twenty_day_plus",
        packageType: "20-Day PLUS Package"
      }
    ],
    directory
  );
  assert.equal(matched.byPackage.monthly_unlimited.uniqueExactMatches, 1);
  assert.equal(matched.byPackage.twenty_day_plus.ambiguousMatches, 1);
  assert.equal(matched.byPackage.twenty_day_plus.zeroMatches, 1);

  const report = buildCsvOwnerResolutionReport({
    httpStatus: 200,
    rows: [
      { system_id: "1004", first_name: "Alan", last_name: "Turing", deleted: "0" },
      { system_id: "2001", first_name: "Checked", last_name: "In", deleted: "0" }
    ],
    reservations: [
      reservation({ animalId: "dog-1", dogName: "Byte", ownerId: "1004" }),
      reservation({ animalId: "dog-2", dogName: "Nibble", ownerId: "2001" })
    ],
    csvOwners: [
      {
        ownerDisplayName: "Alan Turing",
        packageKey: "monthly_unlimited",
        packageType: "Monthly Unlimited"
      }
    ]
  });
  assert.equal(report.directory.ownerIdNamespaceVerified, true);
  assert.equal(report.today.eligiblePackageOwnersCurrentlyCheckedIn, 1);
  assert.equal(report.today.eligibleDogsCurrentlyCheckedIn, 1);
  const publicLookup = JSON.stringify(toPublicCsvOwnerResolutionLookup(report));
  assert.doesNotMatch(publicLookup, /Alan|Turing|Byte|Nibble|hidden@/i);

  assert.equal(
    existsSync(join(process.cwd(), "app/api/admin/package-group-walks/csv-owner-resolution/route.ts")),
    false
  );
  assert.doesNotMatch(
    source("lib/package-group-walks/csv-owner-resolution.ts"),
    /inspectOwnersCsvResolution/
  );

  for (const path of [
    "components/admin/PackageGroupWalksPanel.tsx",
    "components/boards/TlAlertsRemindersBoard.tsx",
    "lib/package-group-walks/service.ts",
    "lib/package-group-walks/tl-board.ts"
  ]) {
    const text = source(path);
    assert.doesNotMatch(text, /csv-owner-resolution-fixture/, path);
    assert.doesNotMatch(text, /csvOwnerResolution/, path);
  }
}

testOwnerPackageIndexResilience()
  .then(() => {
    console.log("test-package-group-walks: all assertions passed");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
