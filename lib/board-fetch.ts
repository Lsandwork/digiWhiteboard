"use client";

type BoardFetchOptions = {
  url: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  debug?: boolean;
  /** Keep returning last good JSON when the network/API fails. */
  keepLastGood?: boolean;
  cacheKey?: string;
};

type BoardFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  fromCache: boolean;
  error: string | null;
};

const lastGoodByKey = new Map<string, unknown>();
const backoffUntilByKey = new Map<string, number>();
const failureCountByKey = new Map<string, number>();

function debugLog(enabled: boolean, message: string, details?: Record<string, unknown>) {
  if (!enabled || typeof console === "undefined") return;
  if (details) {
    console.info(`[FitdogBoardDebug] ${message}`, details);
    return;
  }
  console.info(`[FitdogBoardDebug] ${message}`);
}

function nextBackoffMs(failures: number) {
  const capped = Math.min(failures, 5);
  return Math.min(30_000, 1000 * 2 ** Math.max(0, capped - 1));
}

export async function fetchBoardJson<T>(options: BoardFetchOptions): Promise<BoardFetchResult<T>> {
  const cacheKey = options.cacheKey ?? options.url;
  const debug = Boolean(options.debug);
  const keepLastGood = options.keepLastGood !== false;
  const timeoutMs = options.timeoutMs ?? 4000;
  const now = Date.now();
  const backoffUntil = backoffUntilByKey.get(cacheKey) ?? 0;

  if (backoffUntil > now) {
    const cached = lastGoodByKey.get(cacheKey) as T | undefined;
    debugLog(debug, "skip fetch during backoff", {
      url: options.url,
      remainingMs: backoffUntil - now,
      hasLastGood: Boolean(cached)
    });
    return {
      ok: Boolean(cached),
      status: 0,
      data: cached ?? null,
      fromCache: Boolean(cached),
      error: cached ? null : "Backoff active"
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(options.url, {
      cache: "no-store",
      signal: controller.signal
    });
    const data = (await response.json()) as T;

    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }

    lastGoodByKey.set(cacheKey, data);
    failureCountByKey.set(cacheKey, 0);
    backoffUntilByKey.delete(cacheKey);
    debugLog(debug, "fetch ok", { url: options.url, status: response.status });

    return {
      ok: true,
      status: response.status,
      data,
      fromCache: false,
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    const failures = (failureCountByKey.get(cacheKey) ?? 0) + 1;
    failureCountByKey.set(cacheKey, failures);
    const backoffMs = nextBackoffMs(failures);
    backoffUntilByKey.set(cacheKey, Date.now() + backoffMs);

    const cached = keepLastGood ? ((lastGoodByKey.get(cacheKey) as T | undefined) ?? null) : null;
    debugLog(debug, "fetch failed; using last good if available", {
      url: options.url,
      error: message,
      failures,
      backoffMs,
      hasLastGood: Boolean(cached)
    });

    return {
      ok: false,
      status: 0,
      data: cached,
      fromCache: Boolean(cached),
      error: message
    };
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export function rememberBoardJson<T>(cacheKey: string, data: T) {
  lastGoodByKey.set(cacheKey, data);
  failureCountByKey.set(cacheKey, 0);
  backoffUntilByKey.delete(cacheKey);
}
