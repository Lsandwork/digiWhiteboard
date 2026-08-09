import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function keyBytes() {
  const secret =
    process.env.BLOG_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
    process.env.FITDOG_SESSION_ENCRYPTION_KEY?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "ruffops-blog-dev-only-key";
  return createHash("sha256").update(secret).digest();
}

export function encryptBlogSecret(plaintext: string): Record<string, unknown> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptBlogSecret(envelope: Record<string, unknown> | null | undefined): string | null {
  if (!envelope || typeof envelope !== "object") return null;
  if (!envelope.data || !envelope.iv || !envelope.tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(String(envelope.iv), "base64"));
    decipher.setAuthTag(Buffer.from(String(envelope.tag), "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(envelope.data), "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function hasEncryptedSecret(envelope: Record<string, unknown> | null | undefined): boolean {
  return Boolean(envelope && typeof envelope === "object" && envelope.data && envelope.iv && envelope.tag);
}
