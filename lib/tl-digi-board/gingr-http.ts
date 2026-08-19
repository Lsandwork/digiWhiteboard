import { TL_GINGR_FETCH_TIMEOUT_MS } from "./constants";

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  const message = error instanceof Error ? error.message : String(error);
  return name === "AbortError" || /aborted|abort/i.test(message);
}

/**
 * TL Digi Board Gingr fetch. Times out so a hung Gingr call cannot block the TV.
 * Never include the request URL in thrown errors — Gingr URLs contain `key=`.
 */
export async function fetchTlGingrResponse(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs = TL_GINGR_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
      cache: init.cache ?? "no-store"
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }
    if (error instanceof Error) {
      throw new Error(`${label} failed: ${error.message}`);
    }
    throw new Error(`${label} failed.`);
  } finally {
    clearTimeout(timer);
  }
}
