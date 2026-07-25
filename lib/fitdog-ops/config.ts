import type { FitdogIntegrationMode } from "@/lib/fitdog-ops/types";

export function fitdogEnvMode(): FitdogIntegrationMode {
  const mode = String(process.env.FITDOG_INTEGRATION_MODE || "playwright").trim().toLowerCase();
  if (mode === "api" || mode === "webhook" || mode === "playwright") return mode;
  return "playwright";
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

export function fitdogSessionEncryptionKey(): string | null {
  return process.env.FITDOG_SESSION_ENCRYPTION_KEY?.trim() || process.env.ADMIN_SESSION_SECRET?.trim() || null;
}
