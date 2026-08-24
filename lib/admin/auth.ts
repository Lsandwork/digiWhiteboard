import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getServiceSupabase } from "@/lib/supabase/server";
import { findAdminUsersForLogin, verifyAdminUserPassword, type AdminUserRecord } from "@/lib/admin/users";
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
  if (normalized && !normalized.includes("@")) {
    lookups.push(`${normalized}@fitdog.com`);
  }
  return [...new Set(lookups.filter(Boolean))];
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Bound DB calls so a stalled query cannot block env/demo login. */
const AUTH_QUERY_TIMEOUT_MS = 2_500;
const ENV_ATTACH_TIMEOUT_MS = 800;

function authSupabase(timeoutMs = AUTH_QUERY_TIMEOUT_MS) {
  return getServiceSupabase({ timeoutMs });
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type AdminAuthResult = {
  ok: boolean;
  unavailable?: boolean;
  email: string;
  adminUserId?: string;
  role?: string;
  forcePasswordChange?: boolean;
  isDemo?: boolean;
  demoRole?: string;
  source: "database" | "env" | "demo";
};

function isAuthTimeout(error: unknown) {
  return error instanceof Error && /timed out/i.test(error.message);
}

function resultFromDbUser(dbUser: AdminUserRecord, source: AdminAuthResult["source"]): AdminAuthResult {
  const isDemoDbUser = dbUser.email.endsWith("@demo.com");
  return {
    ok: true,
    email: dbUser.email,
    adminUserId: dbUser.id,
    role: dbUser.role,
    demoRole: isDemoDbUser ? dbUser.role : undefined,
    forcePasswordChange: dbUser.force_password_change,
    isDemo: isDemoDbUser,
    source
  };
}

async function envPasswordMatches(password: string) {
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (hash) return bcrypt.compare(password, hash);
  const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!legacyPassword) return false;
  return safeEqual(password, legacyPassword);
}

function pickLoginUser(users: AdminUserRecord[], normalized: string) {
  const active = users.filter((user) => user.status === "active");
  const withDomain = normalized.includes("@") ? normalized : `${normalized}@fitdog.com`;
  return (
    active.find((user) => user.email === normalized) ||
    active.find((user) => user.email === withDomain) ||
    active.find((user) => user.email === SUPER_ADMIN_EMAIL) ||
    null
  );
}

async function lookupLoginUsers(emails: string[], timeoutMs = AUTH_QUERY_TIMEOUT_MS) {
  const supabase = authSupabase(timeoutMs);
  return withTimeout(findAdminUsersForLogin(supabase, emails), timeoutMs, "admin user lookup");
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

  const envValid = isSuperAdminLoginAlias(normalized) ? await envPasswordMatches(password) : false;

  // Env `admin` login must succeed even when Supabase is down or slow.
  // Do not wait on settings/lookups before accepting a valid env password.
  if (envValid) {
    let superAdmin: AdminUserRecord | null = null;
    try {
      const users = await lookupLoginUsers([SUPER_ADMIN_EMAIL], ENV_ATTACH_TIMEOUT_MS);
      superAdmin = pickLoginUser(users, SUPER_ADMIN_EMAIL);
    } catch {
      superAdmin = null;
    }
    if (superAdmin) return resultFromDbUser(superAdmin, "env");
    return {
      ok: true,
      email: SUPER_ADMIN_EMAIL,
      role: "owner_admin",
      source: "env"
    };
  }

  try {
    const users = await lookupLoginUsers(loginLookupEmails(normalized));
    const dbUser = pickLoginUser(users, normalized);
    if (dbUser && (await verifyAdminUserPassword(dbUser, password))) {
      return resultFromDbUser(dbUser, "database");
    }
  } catch (error) {
    if (isAuthTimeout(error)) {
      return { ok: false, unavailable: true, email: normalized, source: "database" };
    }
    return { ok: false, unavailable: true, email: normalized, source: "database" };
  }

  return { ok: false, email: normalized, source: "database" };
}

/** @deprecated Use verifyAdminCredentials */
export async function verifyAdminPassword(username: string, password: string) {
  const result = await verifyAdminCredentials(username, password);
  return result.ok;
}
