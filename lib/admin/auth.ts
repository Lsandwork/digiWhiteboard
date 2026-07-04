import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME?.trim() || "admin";
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function verifyAdminPassword(username: string, password: string) {
  const expectedUsername = getAdminUsername();
  if (!safeEqual(username.trim(), expectedUsername)) {
    return false;
  }

  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) {
    return bcrypt.compare(password, hash);
  }

  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!legacyPassword) return false;
  return safeEqual(password, legacyPassword);
}
