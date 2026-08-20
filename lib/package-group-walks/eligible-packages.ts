/**
 * Centralized Package Group Walk eligibility configuration.
 *
 * Matching is intentionally **exact on a normalized canonical name**, never a
 * substring test. `includes("plus")` would match "10-Day Plus", "Plus Grooming",
 * and any future product containing the word — a false positive here hands out a
 * free walk the owner did not buy.
 *
 * Gingr's legacy v1 API (the one RuffOps uses) exposes packages/subscriptions
 * without a documented stable "product code" field, so display names are the
 * portable identifier. When the real Gingr package ids are confirmed in
 * production (see `GET /api/admin/package-group-walks/diagnostics`) set them via
 * env and they take precedence over name matching.
 */

export type PackageGroupWalkPackageKey = "monthly_unlimited" | "twenty_day_plus";

export type EligiblePackageDefinition = {
  key: PackageGroupWalkPackageKey;
  /** Name rendered in RuffOps. */
  displayName: string;
  /**
   * Exact canonical names accepted from Gingr, pre-normalization.
   * Normalization folds case, punctuation, and spacing — not word membership.
   */
  canonicalNames: string[];
  /** Deterministic winner when one dog matches both packages (lower wins). */
  priority: number;
};

/** Env override for confirmed Gingr package/subscription ids, comma separated. */
const PACKAGE_ID_ENV: Record<PackageGroupWalkPackageKey, string> = {
  monthly_unlimited: "PACKAGE_GROUP_WALK_MONTHLY_UNLIMITED_GINGR_IDS",
  twenty_day_plus: "PACKAGE_GROUP_WALK_TWENTY_DAY_PLUS_GINGR_IDS"
};

export const PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES: readonly EligiblePackageDefinition[] = [
  {
    key: "monthly_unlimited",
    displayName: "Monthly Unlimited",
    canonicalNames: ["Monthly Unlimited"],
    priority: 1
  },
  {
    key: "twenty_day_plus",
    displayName: "20-Day PLUS Package",
    canonicalNames: ["20-Day PLUS Package"],
    priority: 2
  }
] as const;

/**
 * Fold a Gingr product label to a comparable form: lowercase, punctuation to
 * spaces, collapsed whitespace. "20-Day PLUS Package" and "20 day plus package"
 * converge; "10-Day PLUS Package" stays distinct.
 */
export function normalizePackageName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function envPackageIds(key: PackageGroupWalkPackageKey): string[] {
  const raw = process.env[PACKAGE_ID_ENV[key]];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Package type / membership type ids discovered from Gingr at runtime
 * (never invented). Env overrides still win so production can pin a confirmed id.
 */
const runtimeConfirmedIds = new Map<string, EligiblePackageDefinition>();

export function registerConfirmedGingrPackageIds(
  entries: Array<{ id: string | null | undefined; key: PackageGroupWalkPackageKey }>
) {
  for (const entry of entries) {
    const id = String(entry.id ?? "").trim();
    if (!id) continue;
    const definition = eligiblePackageByKey(entry.key);
    if (!definition) continue;
    runtimeConfirmedIds.set(id, definition);
  }
}

export function __resetConfirmedGingrPackageIdsForTests() {
  runtimeConfirmedIds.clear();
}

/** Confirmed Gingr package ids per eligible package (empty until set in production). */
export function eligiblePackageIdMap(): Map<string, EligiblePackageDefinition> {
  const map = new Map<string, EligiblePackageDefinition>();
  for (const [id, definition] of runtimeConfirmedIds) {
    map.set(id, definition);
  }
  for (const definition of PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES) {
    for (const id of envPackageIds(definition.key)) {
      map.set(id, definition);
    }
  }
  return map;
}

function nameMap(): Map<string, EligiblePackageDefinition> {
  const map = new Map<string, EligiblePackageDefinition>();
  for (const definition of PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES) {
    for (const name of definition.canonicalNames) {
      map.set(normalizePackageName(name), definition);
    }
  }
  return map;
}

const NAME_LOOKUP = nameMap();

export type PackageMatchCandidate = {
  /** Gingr package / subscription / membership id when present. */
  id?: string | null;
  /** Gingr display name. */
  name?: string | null;
};

/**
 * Resolve a Gingr package candidate to an eligible package.
 * Stable id match wins; otherwise exact normalized-name match. No substrings.
 */
export function matchEligiblePackage(
  candidate: PackageMatchCandidate
): EligiblePackageDefinition | null {
  const id = candidate.id == null ? "" : String(candidate.id).trim();
  if (id) {
    const byId = eligiblePackageIdMap().get(id);
    if (byId) return byId;
  }
  const normalized = normalizePackageName(candidate.name);
  if (!normalized) return null;
  return NAME_LOOKUP.get(normalized) ?? null;
}

/**
 * Deterministic winner when an owner holds both eligible packages.
 * Documented rule: Monthly Unlimited outranks 20-Day PLUS Package, and the dog
 * still receives exactly one complimentary walk for the business day.
 */
export function preferredEligiblePackage(
  matches: readonly EligiblePackageDefinition[]
): EligiblePackageDefinition | null {
  if (!matches.length) return null;
  return [...matches].sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key))[0] ?? null;
}

export function eligiblePackageByKey(
  key: string | null | undefined
): EligiblePackageDefinition | null {
  return PACKAGE_GROUP_WALK_ELIGIBLE_PACKAGES.find((entry) => entry.key === key) ?? null;
}
