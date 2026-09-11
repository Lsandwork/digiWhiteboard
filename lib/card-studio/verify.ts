import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export function createVerificationSecret() {
  return randomBytes(32).toString("hex");
}

export function signVerificationToken(cardUuid: string, secret: string) {
  const body = Buffer.from(JSON.stringify({ cardUuid, v: 1 })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySignedToken(token: string, secret: string): { cardUuid: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { cardUuid?: string };
    if (!payload.cardUuid) return null;
    return { cardUuid: payload.cardUuid };
  } catch {
    return null;
  }
}

export function publicVerificationPath(token: string) {
  return `/card-studio/verify/${encodeURIComponent(token)}`;
}

export function publicCardStatusLabel(status: string, expirationDate?: string | null) {
  if (status === "revoked") return "REVOKED";
  if (status === "expired") return "EXPIRED";
  if (expirationDate && new Date(expirationDate).getTime() < Date.now()) return "EXPIRED";
  if (status === "active" || status === "printed") return "VALID";
  return status.toUpperCase();
}
