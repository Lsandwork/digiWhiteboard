/**
 * Jasper pickup DEMO SMS — permanently disabled in production paths.
 *
 * ROOT CAUSE (2026-08-11 owner complaint):
 * `/api/cron/route-eta-alerts` (every 2 minutes) called `maybeAdvanceJasperDemoSms()`,
 * which was hardwired to text 2139131391 with “driver departing … at 9:08pm”.
 * That path ignored quiet hours (real owner SMS ends 8:00 PM PT) and could also
 * create a new session in the morning and send the same 9:08pm copy at 9:26 AM.
 *
 * This module must never send SMS. Keep the export so any leftover imports fail safe.
 */

export function isJasperDemoSmsEnabled(): boolean {
  return false;
}

export function todayLa(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(nowMs));
}

export function laMinutesSinceMidnight(nowMs: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

export function isWithinJasperDemoSmsWindow(_nowMs: number = Date.now()): boolean {
  return false;
}

export function jasperDemoDepartAtMs(nowMs: number = Date.now()): number {
  // Kept for tests/docs only — not used to send.
  const dateLa = todayLa(nowMs);
  // Approximate 21:08 PT without importing CSV helpers (dead path).
  return Date.parse(`${dateLa}T21:08:00-07:00`);
}

export function formatJasperDepartLabel(departAtMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(new Date(departAtMs))
    .toLowerCase()
    .replace(/\s/g, "");
}

/**
 * Hard no-op. Never texts. Never creates demo sessions.
 * Callers in cron / track must not reintroduce Twilio sends here.
 */
export async function maybeAdvanceJasperDemoSms(_options?: {
  force?: boolean;
  to?: string;
  nowMs?: number;
}): Promise<Record<string, unknown>> {
  return {
    skipped: true,
    ok: true,
    reason: "jasper_demo_sms_permanently_disabled",
    detail:
      "Jasper demo SMS is permanently disabled after production texts at 9:08pm / wrong-time morning sends. Real owner ETA SMS uses processOwnerEtaAlerts + sms-policy only."
  };
}
