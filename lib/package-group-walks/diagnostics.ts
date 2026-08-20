/**
 * Sanitized Gingr package inspection for the Package Group Walks diagnostics API.
 *
 * Purpose: show Full Admins how Gingr actually identifies packages (ids + names +
 * field inventory) without leaking credentials, session material, or owner PII.
 */
import {
  eligiblePackageIdMap,
  matchEligiblePackage,
  normalizePackageName,
  type EligiblePackageDefinition
} from "./eligible-packages";

const SENSITIVE_FIELD =
  /^(?:.*(?:api[_-]?key|auth(?:orization)?|token|secret|password|credential|cookie|session).*)$/i;
const PII_FIELD =
  /^(?:e?mail|phone|mobile|address|first_name|last_name|full_name|owner_name|o_first|o_last|o_email|o_phone|notes|comments|ssn|credit_card|card_number)$/i;

const NAME_FIELDS = [
  "name",
  "package_name",
  "subscription_name",
  "membership_name",
  "plan_name",
  "title",
  "label",
  "display_name"
] as const;

export type PackageMatchReason = "id" | "name";

export type SanitizedGingrPackage = {
  id: string | null;
  name: string | null;
  normalizedName: string;
  type: string | null;
  productId: string | null;
  packageId: string | null;
  subscriptionId: string | null;
  ownerAssociation: {
    distinctOwnerCount: number;
  };
  eligible: boolean;
  matchReason: PackageMatchReason | null;
  matchedKey: EligiblePackageDefinition["key"] | null;
  source: string;
  availableFields: string[];
  count: number;
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

export function isSensitivePackageField(field: string): boolean {
  const name = field.trim();
  if (!name) return true;
  if (PII_FIELD.test(name)) return true;
  if (SENSITIVE_FIELD.test(name)) return true;
  return false;
}

export function safeAvailableFields(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((field) => !isSensitivePackageField(field))
    .sort((a, b) => a.localeCompare(b));
}

export function redactDiagnosticMessage(message: string): string {
  return String(message)
    .replace(/key=[^&\s]+/gi, "key=REDACTED")
    .replace(/Bearer\s+\S+/gi, "Bearer REDACTED")
    .replace(/sk_[A-Za-z0-9]+/g, "REDACTED")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9._-]+/g, "REDACTED_JWT");
}

function nestedRecord(
  record: Record<string, unknown>,
  ...fields: string[]
): Record<string, unknown> | null {
  for (const field of fields) {
    const nested = asRecord(record[field]);
    if (nested) return nested;
  }
  return null;
}

function matchReasonFor(candidate: { id: string | null; name: string | null }): {
  definition: EligiblePackageDefinition;
  reason: PackageMatchReason;
} | null {
  const id = candidate.id?.trim() ?? "";
  if (id && eligiblePackageIdMap().has(id)) {
    return { definition: eligiblePackageIdMap().get(id)!, reason: "id" };
  }
  const definition = matchEligiblePackage(candidate);
  if (!definition) return null;
  return { definition, reason: "name" };
}

export function sanitizePackageRecord(
  record: Record<string, unknown>,
  source: string,
  ownerId?: string | null
): SanitizedGingrPackage | null {
  const nested = nestedRecord(record, "package", "membership", "plan", "product", "package_type");
  const name = pickString(
    ...NAME_FIELDS.map((field) => record[field]),
    ...(nested ? NAME_FIELDS.map((field) => nested[field]) : [])
  );
  const packageId = pickString(
    record.package_id,
    record.subscription_package_id,
    record.membership_type_id,
    record.plan_id,
    nested?.package_id,
    nested?.id
  );
  const productId = pickString(record.product_id, nested?.product_id, record.productId);
  const subscriptionId = pickString(
    record.subscription_id,
    source.includes("subscription") ? record.id : null,
    record.subscriptionId
  );
  const type = pickString(record.type, record.package_type, nested?.type, record.kind);
  const id = pickString(packageId, productId, subscriptionId, record.id, nested?.id);
  if (!name && !id) return null;

  const matched = matchReasonFor({ id, name });
  const fields = new Set(safeAvailableFields(record));
  if (nested) {
    for (const field of safeAvailableFields(nested)) fields.add(`nested.${field}`);
  }

  return {
    id,
    name,
    normalizedName: normalizePackageName(name),
    type,
    productId,
    packageId,
    subscriptionId,
    ownerAssociation: {
      distinctOwnerCount: ownerId ? 1 : 0
    },
    eligible: Boolean(matched),
    matchReason: matched?.reason ?? null,
    matchedKey: matched?.definition.key ?? null,
    source,
    availableFields: [...fields].sort((a, b) => a.localeCompare(b)),
    count: 1
  };
}

function packageIdentity(entry: SanitizedGingrPackage): string {
  return `${entry.packageId ?? entry.id ?? ""}|${entry.normalizedName}|${entry.source}`;
}

export function aggregateSanitizedPackages(
  entries: Array<SanitizedGingrPackage | null>
): SanitizedGingrPackage[] {
  const grouped = new Map<string, SanitizedGingrPackage>();
  for (const entry of entries) {
    if (!entry) continue;
    const key = packageIdentity(entry);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry, availableFields: [...entry.availableFields] });
      continue;
    }
    existing.count += entry.count;
    existing.ownerAssociation.distinctOwnerCount += entry.ownerAssociation.distinctOwnerCount;
    const fields = new Set(existing.availableFields);
    for (const field of entry.availableFields) fields.add(field);
    existing.availableFields = [...fields].sort((a, b) => a.localeCompare(b));
    if (!existing.id && entry.id) existing.id = entry.id;
    if (!existing.packageId && entry.packageId) existing.packageId = entry.packageId;
    if (!existing.productId && entry.productId) existing.productId = entry.productId;
    if (!existing.subscriptionId && entry.subscriptionId) existing.subscriptionId = entry.subscriptionId;
    if (!existing.type && entry.type) existing.type = entry.type;
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (b.count !== a.count) return b.count - a.count;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

export const GINGR_UNAVAILABLE_BODY = {
  ok: false as const,
  error: "GINGR_UNAVAILABLE" as const,
  message: "Unable to inspect Gingr package data."
};
