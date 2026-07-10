/**
 * Never throw from URL parsing — Safari surfaces invalid values as
 * "The string did not match the expected pattern."
 */

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
