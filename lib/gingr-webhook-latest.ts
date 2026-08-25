/**
 * Cached read for the newest gingr_webhook_events row.
 * Health / My Shift / ops probes all need the same timestamp — one indexed query per TTL window.
 */
import { getHungTableSupabase, HUNG_TABLES, isHungQueryError, isHungTableInCooldown, markHungTableTimeout } from "@/lib/hung-table-guard";
import { getOrLoadTtlCache, invalidateTtlCache } from "@/lib/server-ttl-cache";

export const GINGR_WEBHOOK_LATEST_CACHE_TTL_MS = 30_000;

export type LatestGingrWebhookRow = {
  created_at: string | null;
  processing_error?: string | null;
};

const CACHE_KEY = "gingr-webhook:latest";

export function invalidateLatestGingrWebhookCache() {
  invalidateTtlCache(CACHE_KEY);
}

export async function loadLatestGingrWebhookEvent(options?: {
  columns?: string;
  bypassCache?: boolean;
}): Promise<{ row: LatestGingrWebhookRow | null; timedOut: boolean }> {
  const columns = options?.columns ?? "created_at";
  if (options?.bypassCache) {
    return queryLatestGingrWebhook(columns);
  }
  const cached = await getOrLoadTtlCache(CACHE_KEY, GINGR_WEBHOOK_LATEST_CACHE_TTL_MS, () =>
    queryLatestGingrWebhook(columns)
  );
  return cached;
}

async function queryLatestGingrWebhook(
  columns: string
): Promise<{ row: LatestGingrWebhookRow | null; timedOut: boolean }> {
  if (isHungTableInCooldown(HUNG_TABLES.gingrWebhookEvents)) {
    return { row: null, timedOut: true };
  }
  const supabase = getHungTableSupabase();
  try {
    const { data, error } = await supabase
      .from("gingr_webhook_events")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isHungQueryError(error)) {
        markHungTableTimeout(HUNG_TABLES.gingrWebhookEvents);
        return { row: null, timedOut: true };
      }
      throw error;
    }
    return { row: (data as LatestGingrWebhookRow | null) ?? null, timedOut: false };
  } catch (error) {
    if (isHungQueryError(error)) {
      markHungTableTimeout(HUNG_TABLES.gingrWebhookEvents);
      return { row: null, timedOut: true };
    }
    throw error;
  }
}
