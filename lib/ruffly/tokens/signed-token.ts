import { createHmac, timingSafeEqual, randomBytes, createHash } from "crypto";

function secret() {
  // Dedicated secret only — do not fall back to Gingr webhook or admin session keys.
  return process.env.RUFFLY_TOKEN_SECRET?.trim() || "";
}

export type RufflyTokenPayload = {
  typ: "review" | "feedback" | "consent" | "webchat";
  sub: string;
  exp: number;
  meta?: Record<string, string>;
};

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function signRufflyToken(payload: Omit<RufflyTokenPayload, "exp"> & { ttlSeconds: number }): string {
  const key = secret();
  if (!key) throw new Error("RUFFLY_TOKEN_SECRET is not configured.");
  const exp = Math.floor(Date.now() / 1000) + payload.ttlSeconds;
  const body: RufflyTokenPayload = {
    typ: payload.typ,
    sub: payload.sub,
    exp,
    meta: payload.meta
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyRufflyToken(token: string): RufflyTokenPayload | null {
  const key = secret();
  if (!key) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = createHmac("sha256", key).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as RufflyTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
