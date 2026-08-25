/**
 * Never throw from URL parsing — Safari surfaces invalid values as
 * "The string did not match the expected pattern."
 */

const SAFARI_PATTERN_ERROR = /did not match the expected pattern/i;
const HTML_ERROR_PAGE = /<!doctype|<html[\s>]|error code 522|cf-error|cloudflare/i;
const TIMEOUT_ERROR = /timed out|timeout|aborted|abort/i;
const NETWORK_ERROR = /failed to fetch|networkerror|fetch failed/i;

export const LIVE_DATA_UNAVAILABLE_MESSAGE = "Live data is temporarily unavailable. Retry shortly.";
export const LIVE_DATA_SLOW_MESSAGE = "This page is taking too long to load. Retry shortly.";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isSafariPatternError(error: unknown): boolean {
  return SAFARI_PATTERN_ERROR.test(errorText(error));
}

export function isTimeoutLikeError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = String((error as { name?: string }).name ?? "");
    if (name === "AbortError" || name === "TimeoutError") return true;
  }
  return TIMEOUT_ERROR.test(errorText(error));
}

export function isInfrastructureError(error: unknown): boolean {
  const message = errorText(error);
  return (
    isSafariPatternError(error) ||
    HTML_ERROR_PAGE.test(message) ||
    TIMEOUT_ERROR.test(message) ||
    NETWORK_ERROR.test(message) ||
    (message.includes("<") && message.includes(">") && message.length > 180)
  );
}

export function humanizeUnknownError(error: unknown, fallback: string): string {
  if (isSafariPatternError(error)) return fallback;
  const message = errorText(error).trim();
  if (!message) return fallback;
  if (HTML_ERROR_PAGE.test(message) || (message.includes("<") && message.includes(">") && message.length > 180)) {
    return LIVE_DATA_UNAVAILABLE_MESSAGE;
  }
  if (isTimeoutLikeError(error) || TIMEOUT_ERROR.test(message)) return LIVE_DATA_SLOW_MESSAGE;
  if (NETWORK_ERROR.test(message)) return LIVE_DATA_UNAVAILABLE_MESSAGE;
  return message;
}

function trimValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isSafeRelativePath(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//");
}

export function safeUrl(value: unknown, fallback = ""): string {
  const trimmed = trimValue(value);
  if (!trimmed) return fallback;
  if (isSafeRelativePath(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function safeAbsoluteUrl(value: unknown, base: string | undefined, fallback = ""): string {
  const trimmed = trimValue(value);
  if (!trimmed) return fallback;
  if (isSafeRelativePath(trimmed)) return trimmed;

  const resolvedBase = trimValue(base) || (typeof window !== "undefined" ? window.location.origin : "");
  if (!resolvedBase) return safeUrl(trimmed, fallback);

  try {
    const url = new URL(trimmed, resolvedBase);
    if (url.protocol !== "http:" && url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function safeOrigin(value: unknown, fallback = ""): string {
  const trimmed = trimValue(value);
  if (!trimmed) return fallback;

  try {
    return new URL(trimmed).origin;
  } catch {
    return fallback;
  }
}

export function safeMediaUrl(value: unknown, fallback = ""): string {
  const resolved = safeUrl(value, fallback);
  if (!resolved) return fallback;
  if (resolved.startsWith("data:") || resolved.startsWith("blob:")) return fallback;
  return resolved;
}

export function safeCastUrl(pathname: string, origin: string, fallback: string): string {
  const safePath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const safeBase = safeOrigin(origin, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  try {
    const url = new URL(safePath, safeBase);
    return url.toString();
  } catch {
    return fallback;
  }
}
