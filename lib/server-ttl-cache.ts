type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  createdAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

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
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      memoryCache.delete(key);
    }
  }
}

/** Deduped loader with short TTL. Concurrent callers share one in-flight promise. */
export async function getOrLoadTtlCache<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const cached = getTtlCache<T>(key);
  if (cached !== null) return cached;

  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = loader()
    .then((value) => {
      setTtlCache(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
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
