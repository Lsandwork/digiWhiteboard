import { todayInLosAngeles } from "@/lib/gingr-checked-in-dogs";
import { matchEligiblePackage, type EligiblePackageDefinition } from "./eligible-packages";

export type PackageExclusionReason = "expired" | "zero_remaining";

export type PackageValidity = {
  remaining: number | null;
  expiresOn: string | null;
  purchasedOn: string | null;
  expirationWasBlank: boolean;
  exclusionReason: PackageExclusionReason | null;
};

/** Calendar date YYYY-MM-DD, or null when the cell is blank / unparseable. */
export function parseCsvCalendarDate(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const month = us[1]!.padStart(2, "0");
    const day = us[2]!.padStart(2, "0");
    let year = us[3]!;
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return todayInLosAngeles(parsed);
}

export function parseRemainingCredits(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * A row qualifies only when the package type is eligible, remaining > 0, and
 * a present expiration date has not passed (Pacific calendar). Blank expiration
 * is treated as active — never invented.
 */
export function evaluatePackageValidity(input: {
  numberRemainingRaw: string;
  expiresAtRaw: string;
  purchasedAtRaw?: string;
  now?: Date;
}): PackageValidity {
  const remaining = parseRemainingCredits(input.numberRemainingRaw);
  const expiresOn = parseCsvCalendarDate(input.expiresAtRaw);
  const purchasedOn = parseCsvCalendarDate(input.purchasedAtRaw);
  const expirationWasBlank = !String(input.expiresAtRaw ?? "").trim();
  const today = todayInLosAngeles(input.now ?? new Date());

  let exclusionReason: PackageExclusionReason | null = null;
  if (remaining == null || remaining <= 0) exclusionReason = "zero_remaining";
  else if (expiresOn && expiresOn < today) exclusionReason = "expired";

  return { remaining, expiresOn, purchasedOn, expirationWasBlank, exclusionReason };
}

export function matchConfigurableEligiblePackage(
  packageType: string | null | undefined
): EligiblePackageDefinition | null {
  return matchEligiblePackage({ name: packageType });
}
