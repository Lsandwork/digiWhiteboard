import { createHmac } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionSecret } from "@/lib/admin/session-constants";

type ThrottleRule = { max: number; windowMs: number; lockMs: number };

/**
 * ip_user stops guessing one account from one client; ip stops spraying many
 * accounts from one client; user stops distributed guessing of one account but
 * only locks briefly so it cannot be used to keep an employee locked out.
 */
export const LOGIN_THROTTLE_RULES = {
  ip_user: { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  ip: { max: 40, windowMs: 15 * 60_000, lockMs: 15 * 60_000 },
  user: { max: 100, windowMs: 60 * 60_000, lockMs: 5 * 60_000 }
} satisfies Record<string, ThrottleRule>;

type Scope = keyof typeof LOGIN_THROTTLE_RULES;
const SCOPES = Object.keys(LOGIN_THROTTLE_RULES) as Scope[];
const DB_TIMEOUT_MS = 800;
const MEMORY_MAX_KEYS = 10_000;

export type LoginThrottleKeys = Record<Scope, string>;

type ThrottleStore = Pick<SupabaseClient, "from" | "rpc">;

function hashKey(scope: Scope, value: string) {
  return `${scope}:${createHmac("sha256", getSessionSecret()).update(`login-throttle:${scope}:${value}`).digest("base64url")}`;
}

export function loginThrottleKeys(clientIp: string, username: string): LoginThrottleKeys {
  const ip = clientIp.trim() || "unknown";
  const user = username.trim().toLowerCase();
  return {
    ip_user: hashKey("ip_user", `${ip}|${user}`),
    ip: hashKey("ip", ip),
    user: hashKey("user", user)
  };
}

/** Vercel overwrites x-forwarded-for / x-real-ip at the edge, so the first hop is the client. */
export function clientIpFromRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

// ---------- In-memory layer (per instance; always active, and the only layer if the DB is unavailable)

type MemoryRecord = { failures: number; windowStartedAt: number; lockedUntil: number };
const memory = new Map<string, MemoryRecord>();

function memoryLockedUntil(key: string, now: number) {
  const record = memory.get(key);
  return record && record.lockedUntil > now ? record.lockedUntil : 0;
}

function memoryFail(key: string, rule: ThrottleRule, now: number) {
  const existing = memory.get(key);
  const windowExpired = !existing || now - existing.windowStartedAt > rule.windowMs;
  const record: MemoryRecord = windowExpired
    ? { failures: 0, windowStartedAt: now, lockedUntil: existing?.lockedUntil ?? 0 }
    : existing;
  record.failures += 1;
  if (record.failures >= rule.max) {
    record.lockedUntil = now + rule.lockMs;
    record.failures = 0;
  }
  if (memory.size >= MEMORY_MAX_KEYS && !memory.has(key)) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(key, record);
}

export function resetLoginThrottleMemoryForTests() {
  memory.clear();
}

// ---------- Shared layer (Supabase, atomic upsert in admin_login_throttle_fail)

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("login throttle timeout")), ms))
  ]);
}

export async function checkLoginThrottle(
  store: ThrottleStore | null,
  keys: LoginThrottleKeys,
  now = Date.now()
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  let lockedUntil = Math.max(...SCOPES.map((scope) => memoryLockedUntil(keys[scope], now)));

  if (store) {
    try {
      const { data, error } = await withTimeout<{ data: Array<{ locked_until: string | null }> | null; error: unknown }>(
        store
          .from("admin_login_throttle")
          .select("locked_until")
          .in("key", SCOPES.map((scope) => keys[scope]))
          .gt("locked_until", new Date(now).toISOString()),
        DB_TIMEOUT_MS
      );
      if (!error) {
        for (const row of data ?? []) {
          const until = row.locked_until ? Date.parse(row.locked_until) : 0;
          if (Number.isFinite(until)) lockedUntil = Math.max(lockedUntil, until);
        }
      }
    } catch {
      // Shared store slow/unavailable: the in-memory layer still applies; never block sign-in on it.
    }
  }

  return lockedUntil > now ? { allowed: false, retryAfterMs: lockedUntil - now } : { allowed: true, retryAfterMs: 0 };
}

export async function recordLoginFailure(store: ThrottleStore | null, keys: LoginThrottleKeys, now = Date.now()) {
  for (const scope of SCOPES) memoryFail(keys[scope], LOGIN_THROTTLE_RULES[scope], now);
  if (!store) return;
  await Promise.all(
    SCOPES.map((scope) => {
      const rule = LOGIN_THROTTLE_RULES[scope];
      return withTimeout(
        store.rpc("admin_login_throttle_fail", {
          p_key: keys[scope],
          p_max: rule.max,
          p_window_seconds: Math.round(rule.windowMs / 1000),
          p_lock_seconds: Math.round(rule.lockMs / 1000)
        }),
        DB_TIMEOUT_MS
      ).catch(() => null);
    })
  );
}

/** Success clears only the client+account counter; ip and account-wide counters keep running. */
export async function clearLoginThrottle(store: ThrottleStore | null, keys: LoginThrottleKeys) {
  memory.delete(keys.ip_user);
  if (!store) return;
  await withTimeout(store.from("admin_login_throttle").delete().eq("key", keys.ip_user), DB_TIMEOUT_MS).catch(() => null);
}
