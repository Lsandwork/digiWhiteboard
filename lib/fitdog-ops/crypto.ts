import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { fitdogSessionEncryptionKey } from "@/lib/fitdog-ops/config";

function keyBytes() {
  const secret = fitdogSessionEncryptionKey();
  if (!secret) throw new Error("FITDOG_SESSION_ENCRYPTION_KEY (or ADMIN_SESSION_SECRET) is required.");
  return createHash("sha256").update(secret).digest();
}

export function encryptFitdogSession(payload: Record<string, unknown>): Record<string, unknown> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptFitdogSession(envelope: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!envelope || typeof envelope !== "object") return null;
  if (!envelope.data || !envelope.iv || !envelope.tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(String(envelope.iv), "base64"));
    decipher.setAuthTag(Buffer.from(String(envelope.tag), "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(envelope.data), "base64")),
      decipher.final()
    ]);
    return JSON.parse(decrypted.toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
