import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSecret } from "@/lib/admin/session-constants";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
const BROWSER_JAR_COOKIE = "fitdog_browser_jar";
const BROWSER_JAR_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_JAR_HOSTS = 8;

export type BrowserBookmark = {
  id: string;
  label: string;
  url: string;
};

export type BrowserCookieJar = Record<string, string>;

export const DEFAULT_BROWSER_BOOKMARKS: BrowserBookmark[] = [
  { id: "gingr", label: "Gingr", url: "https://www.fitdog.gingrapp.com" },
  { id: "google", label: "Google", url: "https://www.google.com" },
  { id: "staff-board", label: "Staff Whiteboard", url: "/staff" },
  { id: "lobby-board", label: "Lobby Whiteboard", url: "/lobby" }
];

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((value) => value > 255)) return true;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isAllowedBrowserHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isPrivateIpv4(host)) return false;
  return true;
}

export function parseBrowserTarget(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let href = trimmed;
  if (!/^https?:\/\//i.test(href)) {
    if (/^\/\S*/.test(trimmed)) {
      return null;
    }
    if (trimmed.includes(".") && !trimmed.includes(" ")) {
      href = `https://${trimmed}`;
    } else {
      href = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
    }
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isAllowedBrowserHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveBrowserNavigation(input: string, origin: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\/\S*/.test(trimmed)) {
    try {
      const url = new URL(trimmed, origin);
      if (url.origin !== origin) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  const parsed = parseBrowserTarget(trimmed);
  return parsed?.toString() ?? null;
}

export function buildBrowserProxyUrl(target: string): string {
  return `/api/admin/browser/proxy?url=${encodeURIComponent(target)}`;
}

function signBrowserJarPayload(encoded: string): string {
  return createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
}

export function encodeBrowserCookieJar(jar: BrowserCookieJar): string {
  const payload = Buffer.from(
    JSON.stringify({
      jar,
      exp: Date.now() + BROWSER_JAR_TTL_MS
    })
  ).toString("base64url");
  const signature = signBrowserJarPayload(payload);
  return `${payload}.${signature}`;
}

export function decodeBrowserCookieJar(value: string | null | undefined): BrowserCookieJar {
  if (!value) return {};
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return {};

  const expected = signBrowserJarPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      jar?: BrowserCookieJar;
      exp?: number;
    };
    if (!parsed.jar || typeof parsed.jar !== "object") return {};
    if (typeof parsed.exp === "number" && parsed.exp < Date.now()) return {};
    return parsed.jar;
  } catch {
    return {};
  }
}

export function readBrowserJarCookie(cookieHeader: string | null): BrowserCookieJar {
  if (!cookieHeader) return {};
  const match = cookieHeader.match(new RegExp(`${BROWSER_JAR_COOKIE}=([^;]+)`));
  if (!match?.[1]) return {};
  return decodeBrowserCookieJar(decodeURIComponent(match[1]));
}

export function mergeSetCookieHeaders(existing: string | undefined, setCookies: string[], hostname: string): string {
  const jar = new Map<string, string>();

  if (existing) {
    for (const part of existing.split(";")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }

  for (const header of setCookies) {
    const first = header.split(";")[0]?.trim();
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }

  const merged = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  if (!merged) return "";
  void hostname;
  return merged;
}

export function trimBrowserCookieJar(jar: BrowserCookieJar, activeHost: string): BrowserCookieJar {
  const next: BrowserCookieJar = { ...jar, [activeHost]: jar[activeHost] ?? "" };
  const hosts = Object.keys(next);
  if (hosts.length <= MAX_JAR_HOSTS) return next;

  const keep = new Set([activeHost, ...hosts.slice(-(MAX_JAR_HOSTS - 1))]);
  return Object.fromEntries(Object.entries(next).filter(([host]) => keep.has(host)));
}

export function rewriteHtmlForBrowserProxy(html: string, pageUrl: URL, proxyBase: string): string {
  const encodeTarget = (url: string) => `${proxyBase}${encodeURIComponent(url)}`;
  const baseTag = `<base href="${pageUrl.origin}/">`;

  let output = html;
  if (/<head\b/i.test(output)) {
    output = output.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  } else {
    output = `${baseTag}${output}`;
  }

  output = output.replace(/\b(href|action)=["'](https?:\/\/[^"'#]+)["']/gi, (_, attr: string, url: string) => {
    return `${attr}="${encodeTarget(url)}"`;
  });

  output = output.replace(/\b(href|action)=["'](\/[^"']*)["']/gi, (_, attr: string, path: string) => {
    return `${attr}="${encodeTarget(`${pageUrl.origin}${path}`)}"`;
  });

  return output;
}

export { BROWSER_JAR_COOKIE };
