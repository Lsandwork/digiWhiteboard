import type { FitdogIntegrationMode } from "@/lib/fitdog-ops/types";

export function fitdogEnvMode(): FitdogIntegrationMode {
  // Prefer the native Fitdog activity-stream API (fast). Playwright remains a fallback mode.
  const mode = String(process.env.FITDOG_INTEGRATION_MODE || "api").trim().toLowerCase();
  if (mode === "api" || mode === "webhook" || mode === "playwright") return mode;
  return "api";
}

export function fitdogSyncEnabled(): boolean {
  const raw = process.env.FITDOG_SYNC_ENABLED;
  if (raw == null || raw === "") return true;
  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

export function fitdogMissedPaymentGraceMinutes(fallback = 60): number {
  const n = Number(process.env.FITDOG_MISSED_PAYMENT_GRACE_MINUTES ?? fallback);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export function fitdogBackfillDays(fallback = 365): number {
  const n = Number(process.env.FITDOG_BACKFILL_DAYS ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}

export function fitdogReconciliationDays(fallback = 30): number {
  const n = Number(process.env.FITDOG_RECONCILIATION_DAYS ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}

export function fitdogWebhookSecret(): string | null {
  return process.env.FITDOG_WEBHOOK_SECRET?.trim() || null;
}

export function fitdogApiBaseUrl(): string | null {
  return process.env.FITDOG_API_BASE_URL?.trim() || null;
}

export function fitdogApiToken(): string | null {
  return process.env.FITDOG_API_TOKEN?.trim() || null;
}

export function fitdogEmployeeEmail(): string | null {
  return process.env.FITDOG_EMPLOYEE_EMAIL?.trim() || null;
}

export function fitdogEmployeePassword(): string | null {
  return process.env.FITDOG_EMPLOYEE_PASSWORD || null;
}

/**
 * Public Fitdog web OAuth client credentials (embedded in app.fitdog.com).
 * Override via env if Fitdog rotates them.
 */
export function fitdogOauthClientId(): string | null {
  return (
    process.env.FITDOG_OAUTH_CLIENT_ID?.trim() ||
    "wuNuuAsOd8iemfAgjMLfbnh4PkIo3TmIpzt2tdSR"
  );
}

export function fitdogOauthClientSecret(): string | null {
  return (
    process.env.FITDOG_OAUTH_CLIENT_SECRET?.trim() ||
    "mSQaKOgyJUj6to65ksD2jsAOPaG3UjISwR9Z6X31ESxUC5QtDew2ZbjwY6XDaRMmSww19MEDNCABe8mdnieU8hWgDYWe5mPv7uVnrsbUbhIxv5tmvfCtBjilY8MHMuaE"
  );
}

export function fitdogSessionEncryptionKey(): string | null {
  return process.env.FITDOG_SESSION_ENCRYPTION_KEY?.trim() || process.env.ADMIN_SESSION_SECRET?.trim() || null;
}

/** Activity items older than this are imported into Past Alerts as resolved. */
export function fitdogHistoryResolveHours(fallback = 48): number {
  const n = Number(process.env.FITDOG_HISTORY_RESOLVE_HOURS ?? fallback);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}
