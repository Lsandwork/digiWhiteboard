import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export type BridgeAuthPayload = {
  bridgeId: string;
  exp: number;
};

export function createPrintBridgeToken(bridgeId: string, secret: string, ttlMs = 1000 * 60 * 60 * 12) {
  const payload: BridgeAuthPayload = { bridgeId, exp: Date.now() + ttlMs };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyPrintBridgeToken(token: string, secret: string): BridgeAuthPayload | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as BridgeAuthPayload;
    if (!payload.bridgeId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createBridgeSecret() {
  return randomBytes(32).toString("hex");
}

export const PRINT_BRIDGE_PROTOCOL_VERSION = 1;
