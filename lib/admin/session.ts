import { createHmac, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, SESSION_TTL_MS, getSessionSecret } from "@/lib/admin/session-constants";

export { ADMIN_SESSION_COOKIE } from "@/lib/admin/session-constants";

export type SessionPayload = {
  sub: string;
  id?: string;
  role?: string;
  mustChangePassword?: boolean;
  isDemo?: boolean;
  demoRole?: string;
  // Impersonation ("Log In As Employee"): original admin identity so the
  // impersonated session can be reverted. Signed server-side, never trusted from client.
  impEmail?: string;
  impId?: string;
  impRole?: string;
  exp: number;
};

export type AdminSession = {
  email: string;
  adminUserId?: string;
  role?: string;
  mustChangePassword?: boolean;
  isDemo?: boolean;
  demoRole?: string;
  impersonatorEmail?: string;
  impersonatorAdminId?: string;
  impersonatorRole?: string;
};

function signPayload(encoded: string) {
  return createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
}

export function createAdminSessionToken(session: AdminSession, ttlMs = SESSION_TTL_MS) {
  const payload: SessionPayload = {
    sub: session.email,
    id: session.adminUserId,
    role: session.role,
    mustChangePassword: session.mustChangePassword ?? false,
    isDemo: session.isDemo ?? false,
    demoRole: session.demoRole,
    impEmail: session.impersonatorEmail,
    impId: session.impersonatorAdminId,
    impRole: session.impersonatorRole,
    exp: Date.now() + ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;

  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;

    const expected = signPayload(encoded);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return {
      email: payload.sub,
      adminUserId: payload.id,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword ?? false,
      isDemo: payload.isDemo ?? false,
      demoRole: payload.demoRole,
      impersonatorEmail: payload.impEmail,
      impersonatorAdminId: payload.impId,
      impersonatorRole: payload.impRole
    };
  } catch {
    return null;
  }
}

function shouldShareAcrossRuffops(requestHost?: string | null) {
  const host = (requestHost ?? "").trim().toLowerCase().split(":", 1)[0];
  return (
    host === "ruffops.com" ||
    host.endsWith(".ruffops.com") ||
    process.env.ADMIN_COOKIE_DOMAIN === ".ruffops.com"
  );
}

export function getAdminSessionCookieOptions(
  maxAgeSeconds = SESSION_TTL_MS / 1000,
  requestHost?: string | null
) {
  const shareAcrossRuffops = shouldShareAcrossRuffops(requestHost);

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || shareAcrossRuffops,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(shareAcrossRuffops ? { domain: ".ruffops.com" as const } : {})
  };
}

function hostOnlyCookieOptions(maxAgeSeconds: number, requestHost?: string | null) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" || shouldShareAcrossRuffops(requestHost),
    path: "/",
    maxAge: maxAgeSeconds
  };
}

function serializeSetCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
  }
) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) {
    const normalized =
      options.sameSite === "lax" || options.sameSite === "Lax"
        ? "Lax"
        : options.sameSite === "strict" || options.sameSite === "Strict"
          ? "Strict"
          : "None";
    parts.push(`SameSite=${normalized}`);
  }
  return parts.join("; ");
}

function collectSetCookies(response: NextResponse) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [...response.headers.entries()]
        .filter(([key]) => key.toLowerCase() === "set-cookie")
        .map(([, value]) => value);
}

/**
 * Logout only. Never call this in the same response as setAdminSessionCookie —
 * Safari drops the new session when Max-Age=0 and a new value share one name.
 */
export function clearAdminSessionCookies(response: NextResponse, requestHost?: string | null) {
  const expired = new Date(0);
  const base = {
    ...hostOnlyCookieOptions(0, requestHost),
    expires: expired
  };

  response.headers.append("Set-Cookie", serializeSetCookie(ADMIN_SESSION_COOKIE, "", base));
  response.headers.append(
    "Set-Cookie",
    serializeSetCookie(ADMIN_SESSION_COOKIE, "", { ...base, domain: ".ruffops.com" })
  );
}

/**
 * Write the session with Next.js cookies.set() (host-only). That is the path
 * that actually sticks in Safari. Optionally add a shared Domain=.ruffops.com
 * copy without expiring anything in this response.
 */
export function setAdminSessionCookie(
  response: NextResponse,
  token: string,
  requestHost?: string | null
) {
  const hostOnly = hostOnlyCookieOptions(SESSION_TTL_MS / 1000, requestHost);
  response.cookies.set(ADMIN_SESSION_COOKIE, token, hostOnly);

  if (!shouldShareAcrossRuffops(requestHost)) return;

  const alreadyHasDomain = collectSetCookies(response).some(
    (value) =>
      value.startsWith(`${ADMIN_SESSION_COOKIE}=`) &&
      value.includes("Domain=.ruffops.com") &&
      !/Max-Age=0(?:;|$)/.test(value)
  );
  if (alreadyHasDomain) return;

  response.headers.append(
    "Set-Cookie",
    serializeSetCookie(ADMIN_SESSION_COOKIE, token, {
      ...hostOnly,
      domain: ".ruffops.com"
    })
  );
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sessionTokensFromCookieHeader(cookieHeader: string) {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const escaped = ADMIN_SESSION_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`, "g");
  for (const match of cookieHeader.matchAll(matcher)) {
    const token = decodeCookieValue(match[1] ?? "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function sessionFromCookieHeader(cookieHeader: string) {
  for (const token of sessionTokensFromCookieHeader(cookieHeader)) {
    const session = verifyAdminSessionToken(token);
    if (session) return session;
  }
  return null;
}

export async function getAdminSession() {
  const headerList = await headers();
  const fromHeader = sessionFromCookieHeader(headerList.get("cookie") ?? "");
  if (fromHeader) return fromHeader;

  const cookieStore = await cookies();
  const stored = typeof cookieStore.getAll === "function" ? cookieStore.getAll() : [];
  for (const cookie of stored) {
    if (cookie.name !== ADMIN_SESSION_COOKIE) continue;
    const session = verifyAdminSessionToken(cookie.value);
    if (session) return session;
  }
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function getAdminSessionFromRequest(request: Request) {
  return sessionFromCookieHeader(request.headers.get("cookie") ?? "");
}

/** @deprecated Use getAdminSession().email */
export function getAdminSessionUsernameFromRequest(request: Request) {
  return getAdminSessionFromRequest(request)?.email ?? null;
}
