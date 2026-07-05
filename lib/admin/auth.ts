import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { findAdminUserByEmail, verifyAdminUserPassword } from "@/lib/admin/users";
import { loadAdminSettings } from "@/lib/admin/settings";

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME?.trim() || "admin";
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo/constants";

export type AdminAuthResult = {
  ok: boolean;
  email: string;
  adminUserId?: string;
  role?: string;
  forcePasswordChange?: boolean;
  isDemo?: boolean;
  source: "database" | "env" | "demo";
};

export async function verifyAdminCredentials(username: string, password: string): Promise<AdminAuthResult> {
  const normalized = username.trim().toLowerCase();

  if (normalized === DEMO_EMAIL && password === DEMO_PASSWORD) {
    return {
      ok: true,
      email: DEMO_EMAIL,
      role: "owner_admin",
      forcePasswordChange: false,
      isDemo: true,
      source: "demo"
    };
  }

  try {
    const supabase = getServiceSupabase();
    const dbUser = await findAdminUserByEmail(supabase, normalized);
    if (dbUser && dbUser.status === "active") {
      const valid = await verifyAdminUserPassword(dbUser, password);
      if (valid) {
        return {
          ok: true,
          email: dbUser.email,
          adminUserId: dbUser.id,
          role: dbUser.role,
          forcePasswordChange: dbUser.force_password_change,
          source: "database"
        };
      }
    }
  } catch {
    // Fall through to env auth if DB unavailable.
  }

  const settings = await loadAdminSettings(getServiceSupabase()).catch(() => null);
  if (settings && !settings.allow_env_admin_login) {
    return { ok: false, email: normalized, source: "env" };
  }

  const expectedUsername = getAdminUsername().toLowerCase();
  if (!safeEqual(normalized, expectedUsername)) {
    return { ok: false, email: normalized, source: "env" };
  }

  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) {
    const valid = await bcrypt.compare(password, hash);
    return valid
      ? { ok: true, email: expectedUsername, role: "owner_admin", source: "env" }
      : { ok: false, email: normalized, source: "env" };
  }

  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!legacyPassword) return { ok: false, email: normalized, source: "env" };
  const valid = safeEqual(password, legacyPassword);
  return valid
    ? { ok: true, email: expectedUsername, role: "owner_admin", source: "env" }
    : { ok: false, email: normalized, source: "env" };
}

/** @deprecated Use verifyAdminCredentials */
export async function verifyAdminPassword(username: string, password: string) {
  const result = await verifyAdminCredentials(username, password);
  return result.ok;
}
