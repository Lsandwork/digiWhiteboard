import assert from "node:assert/strict";

process.env.ADMIN_SESSION_SECRET = "test-only-session-secret";

async function main() {
  const {
    LOGIN_THROTTLE_RULES,
    checkLoginThrottle,
    clearLoginThrottle,
    clientIpFromRequest,
    loginThrottleKeys,
    recordLoginFailure,
    resetLoginThrottleMemoryForTests
  } = await import("../lib/admin/rate-limit");

  const keys = loginThrottleKeys("203.0.113.7", "Staff@Fitdog.com");
  assert.ok(!JSON.stringify(keys).includes("203.0.113.7"), "raw IP is not stored in keys");
  assert.ok(!JSON.stringify(keys).toLowerCase().includes("staff@fitdog.com"), "raw email is not stored in keys");
  assert.deepEqual(keys, loginThrottleKeys(" 203.0.113.7 ", "staff@fitdog.com "), "keys are normalized");

  // --- Memory layer (no shared store): the old limiter reset on every check and never locked.
  resetLoginThrottleMemoryForTests();
  const t0 = Date.parse("2026-10-15T12:00:00.000Z");
  for (let i = 0; i < LOGIN_THROTTLE_RULES.ip_user.max - 1; i += 1) {
    assert.equal((await checkLoginThrottle(null, keys, t0)).allowed, true, `attempt ${i + 1} allowed`);
    await recordLoginFailure(null, keys, t0);
  }
  assert.equal((await checkLoginThrottle(null, keys, t0)).allowed, true, "4 failures still allowed");
  await recordLoginFailure(null, keys, t0);
  const locked = await checkLoginThrottle(null, keys, t0 + 1_000);
  assert.equal(locked.allowed, false, "5th failure locks the client+account pair");
  assert.ok(locked.retryAfterMs > 14 * 60_000 && locked.retryAfterMs <= 15 * 60_000);
  assert.equal((await checkLoginThrottle(null, keys, t0 + 15 * 60_000 + 1)).allowed, true, "lock expires");

  const otherClient = loginThrottleKeys("198.51.100.9", "staff@fitdog.com");
  assert.equal((await checkLoginThrottle(null, otherClient, t0 + 1_000)).allowed, true, "employee on another network is not locked out");

  // Success clears only the client+account counter.
  resetLoginThrottleMemoryForTests();
  for (let i = 0; i < 4; i += 1) await recordLoginFailure(null, keys, t0);
  await clearLoginThrottle(null, keys);
  await recordLoginFailure(null, keys, t0);
  assert.equal((await checkLoginThrottle(null, keys, t0)).allowed, true, "success reset the client+account counter");

  // Account-wide lock is brief (anti-lockout).
  resetLoginThrottleMemoryForTests();
  for (let i = 0; i < LOGIN_THROTTLE_RULES.user.max; i += 1) {
    await recordLoginFailure(null, loginThrottleKeys(`10.0.${Math.floor(i / 250)}.${i % 250}`, "staff@fitdog.com"), t0);
  }
  const accountLock = await checkLoginThrottle(null, otherClient, t0);
  assert.equal(accountLock.allowed, false, "distributed guessing triggers the account lock");
  assert.ok(accountLock.retryAfterMs <= 5 * 60_000, "account-wide lock is at most 5 minutes");

  // Password spraying from one IP.
  resetLoginThrottleMemoryForTests();
  for (let i = 0; i < LOGIN_THROTTLE_RULES.ip.max; i += 1) {
    await recordLoginFailure(null, loginThrottleKeys("203.0.113.50", `user${i}@fitdog.com`), t0);
  }
  assert.equal((await checkLoginThrottle(null, loginThrottleKeys("203.0.113.50", "fresh@fitdog.com"), t0)).allowed, false);

  // --- Shared store: lock recorded by another instance is honored.
  resetLoginThrottleMemoryForTests();
  const rpcCalls: Array<Record<string, unknown>> = [];
  const lockedStore = {
    from: () => ({
      select: () => ({
        in: (_column: string, values: string[]) => ({
          gt: () =>
            Promise.resolve({
              data: values.includes(keys.ip_user) ? [{ locked_until: new Date(t0 + 10 * 60_000).toISOString() }] : [],
              error: null
            })
        })
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) })
    }),
    rpc: (_fn: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      return Promise.resolve({ data: null, error: null });
    }
  };
  const store = lockedStore as any;
  const shared = await checkLoginThrottle(store, keys, t0);
  assert.equal(shared.allowed, false, "lock from another serverless instance applies");
  assert.ok(Math.abs(shared.retryAfterMs - 10 * 60_000) < 5);

  await recordLoginFailure(store, keys, t0);
  assert.equal(rpcCalls.length, 3, "one atomic RPC per scope");
  assert.deepEqual(rpcCalls.map((call) => call.p_max).sort(), [5, 40, 100].map(Number).sort());

  // --- Shared store failing or hanging never blocks sign-in.
  resetLoginThrottleMemoryForTests();
  const brokenStore = {
    from: () => ({ select: () => ({ in: () => ({ gt: () => Promise.reject(new Error("db down")) }) }) }),
    rpc: () => Promise.reject(new Error("db down"))
  };
  assert.equal((await checkLoginThrottle(brokenStore as any, keys, t0)).allowed, true);
  const hangingStore = {
    from: () => ({ select: () => ({ in: () => ({ gt: () => new Promise(() => undefined) }) }) }),
    rpc: () => new Promise(() => undefined)
  };
  const started = Date.now();
  assert.equal((await checkLoginThrottle(hangingStore as any, keys, t0)).allowed, true);
  await recordLoginFailure(hangingStore as any, keys, t0);
  assert.ok(Date.now() - started < 2_500, "slow store is bounded by the throttle timeout");

  const req = new Request("https://ruffops.test/api/admin/login", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
  assert.equal(clientIpFromRequest(req), "203.0.113.7");
  assert.equal(clientIpFromRequest(new Request("https://ruffops.test/")), "unknown");

  console.log("login throttle tests passed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
