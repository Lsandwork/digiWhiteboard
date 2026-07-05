import { getSessionSecret } from "@/lib/admin/session-constants";

export type SessionPayload = {
  sub: string;
  id?: string;
  role?: string;
  mustChangePassword?: boolean;
  exp: number;
};

export type AdminSession = {
  email: string;
  adminUserId?: string;
  role?: string;
  mustChangePassword?: boolean;
};

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqualString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function signPayload(encoded: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyAdminSessionTokenEdge(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = await signPayload(encoded);
  if (!timingSafeEqualString(signature, expected)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as SessionPayload;
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return {
      email: payload.sub,
      adminUserId: payload.id,
      role: payload.role,
      mustChangePassword: payload.mustChangePassword ?? false
    };
  } catch {
    return null;
  }
}
