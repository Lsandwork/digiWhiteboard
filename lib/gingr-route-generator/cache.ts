import type { GingrRouteSchedulePayload } from "@/lib/gingr-route-generator/normalize";

type CacheEntry = {
  payload: GingrRouteSchedulePayload;
  expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<GingrRouteSchedulePayload>>();

export function gingrRouteCacheKey(date: string) {
  return `gingr-route:${date}`;
}

export function readGingrRouteCache(date: string): GingrRouteSchedulePayload | null {
  const entry = cache.get(gingrRouteCacheKey(date));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(gingrRouteCacheKey(date));
    return null;
  }
  return { ...entry.payload, cached: true };
}

export function writeGingrRouteCache(date: string, payload: GingrRouteSchedulePayload) {
  cache.set(gingrRouteCacheKey(date), {
    payload: { ...payload, cached: true },
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function invalidateGingrRouteCache(date?: string) {
  if (!date) {
    cache.clear();
    return;
  }
  cache.delete(gingrRouteCacheKey(date));
}

/** Deduplicate concurrent fetches for the same date. */
export async function withGingrRouteInflight(
  date: string,
  loader: () => Promise<GingrRouteSchedulePayload>
): Promise<GingrRouteSchedulePayload> {
  const key = gingrRouteCacheKey(date);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = loader().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
