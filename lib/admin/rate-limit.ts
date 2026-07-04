type AttemptRecord = {
  count: number;
  lockedUntil: number;
};

const attempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

export function checkLoginRateLimit(key: string) {
  const now = Date.now();
  const record = attempts.get(key);

  if (record?.lockedUntil && record.lockedUntil > now) {
    return { allowed: false, retryAfterMs: record.lockedUntil - now };
  }

  if (!record || now - (record.lockedUntil || 0) > WINDOW_MS) {
    attempts.set(key, { count: 0, lockedUntil: 0 });
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordFailedLogin(key: string) {
  const now = Date.now();
  const record = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    record.count = 0;
  }

  attempts.set(key, record);
}

export function clearLoginAttempts(key: string) {
  attempts.delete(key);
}
