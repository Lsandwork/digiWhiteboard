import type { FitdogNotificationItem } from "@/lib/fitdog-ops/notifications-parse";
import { fetchFitdogActivityStream, fetchFitdogEmployeeAccessToken } from "@/lib/fitdog-ops/providers/fitdog-oauth";
import type { FitdogIntegrationProvider, FitdogProviderSyncOptions, FitdogProviderSyncResult } from "@/lib/fitdog-ops/providers/types";
import { sanitizeFitdogPayload } from "@/lib/fitdog-ops/sanitize";

const NOISE =
  /location address with name:|posted in daily notes|no longer available for bookings|has been created$/i;

export function isUsefulFitdogActivity(text: string) {
  if (!text.trim()) return false;
  if (NOISE.test(text)) return false;
  return /(cancel|declin|vaccination|uploaded|payment|card|invoice|reservation|document|not marked as attended)/i.test(
    text
  );
}

export class FitdogNativeApiProvider implements FitdogIntegrationProvider {
  readonly mode = "api" as const;

  async sync(options: FitdogProviderSyncOptions): Promise<FitdogProviderSyncResult> {
    const token = await fetchFitdogEmployeeAccessToken();
    const rows = await fetchFitdogActivityStream(token.access_token, options.mode === "backfill" ? 200 : 100);
    const sinceMs = options.since ? new Date(options.since).getTime() : 0;

    const notifications: FitdogNotificationItem[] = [];
    for (const row of rows) {
      const text = String(row.description || "").replace(/\s+/g, " ").trim();
      if (!isUsefulFitdogActivity(text)) continue;
      const detectedAt = row.timestamp || row.created_at || null;
      if (sinceMs && detectedAt) {
        const ts = new Date(detectedAt).getTime();
        if (Number.isFinite(ts) && ts < sinceMs && options.mode === "incremental") continue;
      }
      const path = row.url ? String(row.url) : "/dashboard";
      notifications.push({
        id: `activity-${row.id}`,
        text,
        detected_at: detectedAt,
        source_url: path.startsWith("http") ? path : `https://app.fitdog.com${path}`,
        raw: sanitizeFitdogPayload(row) as Record<string, unknown>
      });
    }

    return {
      payments: [],
      services: [],
      notifications,
      records_scanned: notifications.length,
      parse_failures: [],
      checkpoint: { since: new Date().toISOString(), ...(options.checkpoint || {}) },
      authExpired: false,
      reauthenticated: false
    };
  }
}
