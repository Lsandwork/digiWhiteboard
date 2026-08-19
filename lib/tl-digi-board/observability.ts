import * as Sentry from "@sentry/nextjs";

export type TlGingrSyncEventKind =
  | "GINGR_SYNC_SUCCESS"
  | "GINGR_SYNC_FAILURE"
  | "GINGR_SYNC_RECOVERED"
  | "GINGR_DATA_STALE"
  | "GINGR_INVALID_RESPONSE";

const SECRET_KEY = /key|secret|token|password|authorization/i;

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

/** Server-side TL board Gingr sync events. Never logs credentials. */
export function logTlGingrSyncEvent(
  kind: TlGingrSyncEventKind,
  context: Record<string, unknown>
) {
  const extra = scrub(context) as Record<string, unknown>;
  console.info(`[tl-digi-board] ${kind}`, extra);
  const level = kind === "GINGR_SYNC_SUCCESS" || kind === "GINGR_SYNC_RECOVERED" ? "info" : "warning";
  Sentry.captureMessage(kind, {
    level,
    tags: { feature: "tl-digi-board", gingr_sync: kind },
    extra
  });
}
