/** Trainer / Fitdog commission splits by service location. */

export const FACILITY_TRAINER_RATE_BPS = 5000; // 50% trainer / 50% Fitdog
export const AT_HOME_TRAINER_RATE_BPS = 7000; // 70% trainer / 30% Fitdog
export const FACILITY_TRAINER_RATE_PERCENT = 50;
export const AT_HOME_TRAINER_RATE_PERCENT = 70;

export type ServiceLocation = "at_home" | "facility";

/**
 * Infer at-home vs facility from package/class name.
 * Explicit facility wins; otherwise home markers / known at-home packages → at_home.
 */
export function detectServiceLocation(packageOrClass: string | null | undefined): ServiceLocation {
  const text = String(packageOrClass ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b@?\s*facility\b|\bat[\s-]?facility\b/.test(text)) return "facility";
  if (
    /\bat[\s-]?home\b|\bin[\s-]?home\b|\b@\s*home\b|\bhome\b/.test(text) ||
    /puppy\s*jump\s*start|puppy\s*jumpstart/.test(text)
  ) {
    return "at_home";
  }
  return "facility";
}

export function trainerRateBpsForPackage(packageOrClass: string | null | undefined): number {
  return detectServiceLocation(packageOrClass) === "at_home" ? AT_HOME_TRAINER_RATE_BPS : FACILITY_TRAINER_RATE_BPS;
}

export function trainerRatePercentForPackage(packageOrClass: string | null | undefined): number {
  return detectServiceLocation(packageOrClass) === "at_home"
    ? AT_HOME_TRAINER_RATE_PERCENT
    : FACILITY_TRAINER_RATE_PERCENT;
}

export function fitdogShareBpsForPackage(packageOrClass: string | null | undefined): number {
  return 10_000 - trainerRateBpsForPackage(packageOrClass);
}
