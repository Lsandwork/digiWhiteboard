import { readResponseJson } from "@/lib/http/read-response-json";
import { humanizeUnknownError, isTimeoutLikeError } from "@/lib/safe-url";

export const ADMIN_FETCH_TIMEOUT_MS = 12_000;

type AdminFetchInit = RequestInit & {
  timeoutMs?: number;
  /** Replaces the generic page-slow toast when this fetch is aborted. */
  timeoutMessage?: string;
};

/**
 * Admin/staff fetch that never feeds Cloudflare HTML into JSON.parse.
 * Times out so a hung origin cannot freeze a tab.
 */
export async function fetchAdminJson<T = any>(
  input: RequestInfo | URL,
  init: AdminFetchInit = {}
): Promise<{ ok: boolean; status: number; body: T }> {
  const { timeoutMs = ADMIN_FETCH_TIMEOUT_MS, signal, timeoutMessage, ...rest } = init;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onParentAbort, { once: true });
  }

  try {
    const response = await fetch(input, {
      ...rest,
      cache: rest.cache ?? "no-store",
      signal: controller.signal
    });
    const body = await readResponseJson<T>(response);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    if (timeoutMessage && isTimeoutLikeError(error)) {
      throw new Error(timeoutMessage);
    }
    throw new Error(humanizeUnknownError(error, "Live data is temporarily unavailable. Retry shortly."));
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onParentAbort);
  }
}
