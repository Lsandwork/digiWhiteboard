/**
 * Coordinator-facing Route Health / QA summary.
 * Same checks drive approval — UI and Samsara must not use a different model.
 */
import type { PlanValidationIssue, PlanValidationResult } from "@/lib/route-generator/plan-validation";
import type { DailyDogItinerary } from "@/lib/route-generator/itinerary";

export type RouteHealthCheck = {
  id: string;
  ok: boolean;
  label: string;
  detail: string;
};

export type RouteHealthSummary = {
  ok: boolean;
  checks: RouteHealthCheck[];
  warnings: string[];
  errors: string[];
  missingDogs: string[];
  duplicateDogs: string[];
};

export function buildRouteHealthSummary(params: {
  validation: PlanValidationResult;
  itineraries?: DailyDogItinerary[];
  expectedDogCount?: number;
  assignedDogCount?: number;
  geographicWarnings?: string[];
  vanContinuityBreaks?: Array<{ dogName: string; pickupVan: string; dropoffVan: string }>;
}): RouteHealthSummary {
  const missingDogs = params.validation.issues
    .filter((issue) => issue.code === "leg_unassigned" || issue.code === "dog_missing")
    .map((issue) => issue.message);
  const duplicateDogs = params.validation.issues
    .filter((issue) => issue.code === "dog_duplicate")
    .map((issue) => issue.message);

  const checks: RouteHealthCheck[] = params.validation.checks.map((check) => ({
    id: check.id,
    ok: check.pass,
    label: check.id.replace(/_/g, " "),
    detail: check.detail
  }));

  if (params.expectedDogCount != null && params.assignedDogCount != null) {
    checks.unshift({
      id: "dogs_assigned",
      ok: params.expectedDogCount === params.assignedDogCount && missingDogs.length === 0,
      label: "dogs assigned",
      detail: `${params.assignedDogCount}/${params.expectedDogCount} dogs assigned`
    });
  }

  const continuityOk = !params.vanContinuityBreaks?.length;
  checks.push({
    id: "van_continuity",
    ok: continuityOk,
    label: "van continuity",
    detail: continuityOk
      ? "Pickup and drop-off vans match for every dog"
      : params.vanContinuityBreaks!.map((row) => `${row.dogName}: ${row.pickupVan} → ${row.dropoffVan}`).join("; ")
  });

  const warnings = [
    ...(params.geographicWarnings ?? []),
    ...params.validation.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message)
  ];
  const errors = params.validation.issues.filter((issue) => issue.severity === "error").map(formatIssue);

  return {
    ok: params.validation.ok && continuityOk && missingDogs.length === 0 && duplicateDogs.length === 0,
    checks,
    warnings,
    errors,
    missingDogs,
    duplicateDogs
  };
}

export function formatIssue(issue: PlanValidationIssue): string {
  return issue.dogName ? `${issue.dogName} — ${issue.message}` : issue.message;
}

export function formatApprovalBlockMessage(health: RouteHealthSummary): string {
  const missing = health.missingDogs;
  if (missing.length) {
    return `ROUTE VALIDATION FAILED\n\n${missing.length} dog(s) missing:\n${missing.map((row) => `• ${row}`).join("\n")}`;
  }
  if (health.duplicateDogs.length) {
    return `ROUTE VALIDATION FAILED\n\n${health.duplicateDogs.length} duplicate dog(s):\n${health.duplicateDogs.map((row) => `• ${row}`).join("\n")}`;
  }
  if (health.errors.length) {
    return `ROUTE VALIDATION FAILED\n\n${health.errors.slice(0, 8).join("\n")}`;
  }
  return "ROUTE VALIDATION FAILED";
}

/** Prefer the live approved/exported snapshot for a day so refresh does not pick a newer draft. */
export function pickPreferredRoutePlan<T extends { status?: string | null; created_at?: string | null }>(
  plans: T[]
): T | null {
  if (!plans.length) return null;
  const rank = (status: string) => {
    if (status === "exported") return 0;
    if (status === "approved") return 1;
    if (status === "ready_for_approval") return 2;
    if (status === "needs_review") return 3;
    return 4;
  };
  return [...plans].sort(
    (a, b) =>
      rank(String(a.status || "")) - rank(String(b.status || "")) ||
      String(b.created_at || "").localeCompare(String(a.created_at || ""))
  )[0] ?? null;
}
