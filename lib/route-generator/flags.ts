function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isRouteGeneratorEnabled() {
  return envFlag("ROUTE_GENERATOR_ENABLED", false);
}

export function isFitdogReportSyncEnabled() {
  return envFlag("FITDOG_REPORT_SYNC_ENABLED", false);
}

export function isRouteOptimizationEnabled() {
  return envFlag("ROUTE_OPTIMIZATION_ENABLED", false);
}

export function isSamsaraCsvExportEnabled() {
  return envFlag("SAMSARA_CSV_EXPORT_ENABLED", false);
}

export function isSamsaraDirectSyncEnabled() {
  return envFlag("SAMSARA_DIRECT_SYNC_ENABLED", false);
}

/**
 * Master kill switch for ALL Route Generator owner SMS (Approve link texts,
 * ETA cron, Tracking-tab resend). Default OFF — must be explicitly enabled
 * in Vercel after staff intentionally start routes for the day.
 *
 * Unsolicited overnight / no-route texts must never fire when this is unset.
 */
export function isRouteOwnerSmsEnabled() {
  return envFlag("ROUTE_OWNER_SMS_ENABLED", false);
}

export const ROUTE_GENERATOR_PERMISSIONS = [
  "route_generator.view",
  "route_generator.pull_report",
  "route_generator.generate",
  "route_generator.edit",
  "route_generator.approve",
  "route_generator.export",
  "route_generator.manage_settings",
  "route_generator.view_audit"
] as const;

export type RouteGeneratorPermission = (typeof ROUTE_GENERATOR_PERMISSIONS)[number];

export const FITDOG_VAN_KEYS = ["van_1", "van_2", "van_3", "van_5", "van_6"] as const;
export type FitdogVanKey = (typeof FITDOG_VAN_KEYS)[number];

export const CANONICAL_SERVICES = [
  "Adventure Hike",
  "Beach Excursion",
  "Trainer-Led Hike",
  "Group Class",
  "Taxi Service"
] as const;
export type CanonicalService = (typeof CANONICAL_SERVICES)[number];

export const CLUB_SERVICES: CanonicalService[] = ["Trainer-Led Hike", "Group Class", "Taxi Service"];
export const OUTING_SERVICES: CanonicalService[] = ["Adventure Hike", "Beach Excursion"];

export function isFitdogVanKey(value: string): value is FitdogVanKey {
  return (FITDOG_VAN_KEYS as readonly string[]).includes(value);
}

export function assertNeverVan4(value: string) {
  if (value === "van_4" || /van\s*4/i.test(value)) {
    throw new Error("Van 4 is not a Fitdog vehicle and must never be used.");
  }
}
