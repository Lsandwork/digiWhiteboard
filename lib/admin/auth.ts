import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { findAdminUserByEmail, verifyAdminUserPassword, type AdminUserRecord } from "@/lib/admin/users";
import { loadAdminSettings } from "@/lib/admin/settings";
import { DEMO_PASSWORD, findDemoAccount } from "@/lib/demo/constants";

/** Canonical Super Admin identity (Lonnie Sandoval). */
export const SUPER_ADMIN_EMAIL = "lonnie@fitdog.com";

export function getAdminUsername() {
  return process.env.ADMIN_USERNAME?.trim() || "admin";
}

/** Usernames that should resolve to the Lonnie Sandoval Super Admin account. */
export function isSuperAdminLoginAlias(username: string) {
  const normalized = username.trim().toLowerCase();
  return (
    normalized === "admin" ||
    normalized === "admin@fitdog.com" ||
    normalized === SUPER_ADMIN_EMAIL ||
    normalized === getAdminUsername().toLowerCase()
  );
}

function loginLookupEmails(username: string) {
  const normalized = username.trim().toLowerCase();
  const lookups = [normalized];
  if (isSuperAdminLoginAlias(normalized)) {
    lookups.push(SUPER_ADMIN_EMAIL);
  }
  return [...new Set(lookups.filter(Boolean))];
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Login must stay usable even when Supabase is slow/degraded. Bound each DB
 * call so a stalled query falls back to env/demo auth instead of hanging ~40s.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export type AdminAuthResult = {
  ok: boolean;
  email: string;
  adminUserId?: string;
  role?: string;
  forcePasswordChange?: boolean;
  isDemo?: boolean;
  demoRole?: string;
  source: "database" | "env" | "demo";
};

async function resolveSuperAdminRecord(): Promise<AdminUserRecord | null> {
  try {
    const supabase = getServiceSupabase();
    const user = await withTimeout(findAdminUserByEmail(supabase, SUPER_ADMIN_EMAIL), 8000, "super admin lookup");
    if (user && user.status === "active") return user;
  } catch {
    // ignore
  }
  return null;
}

export async function verifyAdminCredentials(username: string, password: string): Promise<AdminAuthResult> {
  const normalized = username.trim().toLowerCase();

  const demoAccount = findDemoAccount(normalized);
  if (demoAccount && password === DEMO_PASSWORD) {
    return {
      ok: true,
      email: demoAccount.email,
      role: demoAccount.role,
      demoRole: demoAccount.role,
      forcePasswordChange: false,
      isDemo: true,
      source: "demo"
    };
  }

  try {
    const supabase = getServiceSupabase();
    for (const email of loginLookupEmails(normalized)) {
      const dbUser = await withTimeout(findAdminUserByEmail(supabase, email), 8000, "admin user lookup");
      if (!dbUser || dbUser.status !== "active") continue;
      const valid = await verifyAdminUserPassword(dbUser, password);
      if (!valid) continue;
      const isDemoDbUser = dbUser.email.endsWith("@demo.com");
      return {
        ok: true,
        email: dbUser.email,
        adminUserId: dbUser.id,
        role: dbUser.role,
        demoRole: isDemoDbUser ? dbUser.role : undefined,
        forcePasswordChange: dbUser.force_password_change,
        isDemo: isDemoDbUser,
        source: "database"
      };
    }
  } catch {
    // Fall through to env auth if DB unavailable.
  }

  const settings = await withTimeout(loadAdminSettings(getServiceSupabase()), 8000, "admin settings")
    .catch(() => null);
  if (settings && !settings.allow_env_admin_login) {
    return { ok: false, email: normalized, source: "env" };
  }

  const expectedUsername = getAdminUsername().toLowerCase();
  if (!isSuperAdminLoginAlias(normalized) && !safeEqual(normalized, expectedUsername)) {
    return { ok: false, email: normalized, source: "env" };
  }

  let envValid = false;
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) {
    envValid = await bcrypt.compare(password, hash);
  } else {
    const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
    if (!legacyPassword) return { ok: false, email: normalized, source: "env" };
    envValid = safeEqual(password, legacyPassword);
  }

  if (!envValid) return { ok: false, email: normalized, source: "env" };

  // Env "admin" login is the same person as Lonnie Sandoval Super Admin.
  const superAdmin = await resolveSuperAdminRecord();
  if (superAdmin) {
    return {
      ok: true,
      email: superAdmin.email,
      adminUserId: superAdmin.id,
      role: superAdmin.role || "owner_admin",
      forcePasswordChange: superAdmin.force_password_change,
      source: "env"
    };
  }

  return {
    ok: true,
    email: SUPER_ADMIN_EMAIL,
    role: "owner_admin",
    source: "env"
  };
}

/** @deprecated Use verifyAdminCredentials */
export async function verifyAdminPassword(username: string, password: string) {
  const result = await verifyAdminCredentials(username, password);
  return result.ok;
}
