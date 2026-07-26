import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32; // 256 bits

export function generateTrackingToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashTrackingToken(rawToken: string): string {
  const pepper = process.env.TRACKING_TOKEN_HASH_SECRET?.trim() || "fitdog-tracking-dev-pepper";
  return createHash("sha256").update(`${pepper}:${rawToken}`).digest("hex");
}

export function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function buildTrackingUrl(rawToken: string): string {
  const domain =
    process.env.FITDOG_TRACKING_PUBLIC_DOMAIN?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://staff.ruffops.com";
  const base = domain.replace(/\/$/, "");
  if (base.includes("track.fitdog.com")) {
    return `${base}/t/${rawToken}`;
  }
  return `${base}/track/${rawToken}`;
}

export function isTokenActive(params: {
  notBeforeAt: Date | string;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (params.revokedAt) return false;
  if (now < new Date(params.notBeforeAt)) return false;
  if (now > new Date(params.expiresAt)) return false;
  return true;
}
