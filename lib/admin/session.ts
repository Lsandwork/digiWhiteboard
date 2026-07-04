import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, SESSION_TTL_MS, getSessionSecret } from "@/lib/admin/session-constants";

export { ADMIN_SESSION_COOKIE } from "@/lib/admin/session-constants";

export type SessionPayload = {
  sub: string;
  id?: string;
  role?: string;
  exp: number;
};

export type AdminSession = {
  email: string;
  adminUserId?: string;
  role?: string;
};

function signPayload(encoded: string) {
  return createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
}

export function createAdminSessionToken(session: AdminSession, ttlMs = SESSION_TTL_MS) {
  const payload: SessionPayload = {
    sub: session.email,
    id: session.adminUserId,
    role: session.role,
    exp: Date.now() + ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = signPayload(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return {
      email: payload.sub,
      adminUserId: payload.id,
      role: payload.role
    };
  } catch {
    return null;
  }
}

export function getAdminSessionCookieOptions(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function getAdminSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${ADMIN_SESSION_COOKIE}=([^;]+)`));
  return verifyAdminSessionToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}

/** @deprecated Use getAdminSession().email */
export function getAdminSessionUsernameFromRequest(request: Request) {
  return getAdminSessionFromRequest(request)?.email ?? null;
}
