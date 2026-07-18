type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
/** Bumped on invalidate so in-flight loaders cannot repopulate stale values. */
const cacheGeneration = new Map<string, number>();

function matchesKey(key: string, prefixOrKey: string) {
  return key === prefixOrKey || key.startsWith(prefixOrKey);
}

function bumpGeneration(key: string) {
  cacheGeneration.set(key, (cacheGeneration.get(key) ?? 0) + 1);
}

export function getTtlCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setTtlCache<T>(key: string, value: T, ttlMs: number) {
  const now = Date.now();
  memoryCache.set(key, {
    value,
    createdAt: now,
    expiresAt: now + Math.max(250, ttlMs)
  });
  return value;
}

export function invalidateTtlCache(prefixOrKey: string) {
  for (const key of memoryCache.keys()) {
    if (matchesKey(key, prefixOrKey)) {
      memoryCache.delete(key);
      bumpGeneration(key);
    }
  }
  for (const key of inFlight.keys()) {
    if (matchesKey(key, prefixOrKey)) {
      // Drop shared in-flight work so the next reader starts a fresh load.
      inFlight.delete(key);
      bumpGeneration(key);
    }
  }
  // Also bump exact prefix key so future writes for never-seen keys stay coherent
  // when invalidate is called with a concrete key before first load.
  bumpGeneration(prefixOrKey);
}

/** Deduped loader with short TTL. Concurrent callers share one in-flight promise. */
export async function getOrLoadTtlCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = getTtlCache<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const generationAtStart = cacheGeneration.get(key) ?? 0;

  const promise = loader()
    .then((value) => {
      // If this key was invalidated while loading, do not write stale data back.
      if ((cacheGeneration.get(key) ?? 0) === generationAtStart) {
        setTtlCache(key, value, ttlMs);
      }
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) {
        inFlight.delete(key);
      }
    });

  inFlight.set(key, promise);
  return promise;
}

export function debugBoardLog(enabled: boolean, message: string, details?: Record<string, unknown>) {
  if (!enabled) return;
  if (details) {
    console.info(`[FitdogBoardDebug] ${message}`, details);
    return;
  }
  console.info(`[FitdogBoardDebug] ${message}`);
}

/** Race a promise against a timeout. Does not cancel the underlying work. */
export function withTimeoutFallback<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

export async function withTimeoutOrThrow<T>(promise: Promise<T>, ms: number, label = "Request"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms.`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
