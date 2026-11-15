import { createHmac, timingSafeEqual } from "crypto";
import { getSessionSecret } from "@/lib/admin/session-constants";

/** Signed unsubscribe tokens — email alone must not unsubscribe arbitrary subscribers. */
const TOKEN_TTL_MS = 365 * 24 * 60 * 60_000;

function sign(encoded: string) {
  return createHmac("sha256", getSessionSecret()).update(`newsletter-unsub:${encoded}`).digest("base64url");
}

export function createNewsletterUnsubscribeToken(email: string, now = Date.now()) {
  const normalized = email.trim().toLowerCase();
  const payload = Buffer.from(JSON.stringify({ e: normalized, exp: now + TOKEN_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyNewsletterUnsubscribeToken(token: string | null | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { e?: string; exp?: number };
    if (!payload.e || typeof payload.exp !== "number" || payload.exp < now) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.e)) return null;
    return payload.e;
  } catch {
    return null;
  }
}
