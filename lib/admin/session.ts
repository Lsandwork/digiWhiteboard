import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "fitdog_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type SessionPayload = {
  sub: string;
  exp: number;
};

function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "fitdog-dev-session-secret-change-me"
  );
}

function signPayload(encoded: string) {
  return createHmac("sha256", getSessionSecret()).update(encoded).digest("base64url");
}

export function createAdminSessionToken(username: string) {
  const payload: SessionPayload = {
    sub: username,
    exp: Date.now() + SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
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
    return payload.sub;
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

export async function getAdminSessionUsername() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function getAdminSessionFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${ADMIN_SESSION_COOKIE}=([^;]+)`));
  return verifyAdminSessionToken(match?.[1] ? decodeURIComponent(match[1]) : null);
}
