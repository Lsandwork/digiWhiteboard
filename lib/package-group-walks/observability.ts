import * as Sentry from "@sentry/nextjs";

export type PackageGroupWalkEventKind =
  | "PACKAGE_GROUP_WALK_SYNC_SUCCESS"
  | "PACKAGE_GROUP_WALK_SYNC_FAILURE"
  | "PACKAGE_GROUP_WALK_COMPLETED"
  | "PACKAGE_GROUP_WALK_COMPLETION_FAILURE"
  | "PACKAGE_GROUP_WALK_ELIGIBILITY_MISMATCH"
  | "PACKAGE_GROUP_WALK_REALTIME_RECONNECTED";

const SECRET_KEY = /key|secret|token|password|authorization|cookie/i;

function scrub(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 8).map(scrub);
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = typeof entry === "string" && entry.length > 280 ? `${entry.slice(0, 280)}…` : entry;
  }
  return out;
}

const INFO_EVENTS = new Set<PackageGroupWalkEventKind>([
  "PACKAGE_GROUP_WALK_SYNC_SUCCESS",
  "PACKAGE_GROUP_WALK_COMPLETED",
  "PACKAGE_GROUP_WALK_REALTIME_RECONNECTED"
]);

/** Package Group Walk telemetry. Never logs credentials or session material. */
export function logPackageGroupWalkEvent(
  kind: PackageGroupWalkEventKind,
  context: Record<string, unknown>
) {
  const extra = scrub(context) as Record<string, unknown>;
  console.info(`[package-group-walks] ${kind}`, extra);
  Sentry.captureMessage(kind, {
    level: INFO_EVENTS.has(kind) ? "info" : "warning",
    tags: { feature: "package-group-walks", package_group_walk: kind },
    extra
  });
}
