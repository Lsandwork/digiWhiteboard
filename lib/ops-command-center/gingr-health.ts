/**
 * Composite Gingr connectivity for Ops Command Center / System Health.
 * Do not treat webhook audit alone as "Gingr down" — boards can stay live via
 * dog row updates and back-of-house API even when audit inserts lag.
 */

export type GingrHealthStatus = "healthy" | "degraded" | "offline" | "unknown";

export type GingrHealthSnapshot = {
  status: GingrHealthStatus;
  label: string;
  detail: string;
  webhookAt: string | null;
  lastSeenAt: string | null;
  freshestAt: string | null;
};

function ageMs(iso: string | null | undefined, nowMs: number) {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, nowMs - parsed);
}

function freshestIso(...values: Array<string | null | undefined>) {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

export function evaluateGingrHealth(input: {
  lastWebhookAt?: string | null;
  lastDogSeenAt?: string | null;
  nowMs?: number;
}): GingrHealthSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const webhookAt = input.lastWebhookAt ?? null;
  const lastSeenAt = input.lastDogSeenAt ?? null;
  const freshestAt = freshestIso(webhookAt, lastSeenAt);
  const webhookAge = ageMs(webhookAt, nowMs);
  const seenAge = ageMs(lastSeenAt, nowMs);
  const freshestAge = ageMs(freshestAt, nowMs);

  if (freshestAge == null) {
    return {
      status: "unknown",
      label: "Gingr ● Status unknown",
      detail: "No Gingr webhook or board dog sync timestamps yet.",
      webhookAt,
      lastSeenAt,
      freshestAt
    };
  }

  if (freshestAge <= 15 * 60_000) {
    const webhookLag =
      webhookAge != null && webhookAge > 15 * 60_000 && seenAge != null && seenAge <= 15 * 60_000;
    return {
      status: "healthy",
      label: "Gingr ● Connected",
      detail: webhookLag
        ? `Board sync live (dog seen ${Math.round((seenAge || 0) / 60000)}m ago). Webhook audit lagging ${Math.round((webhookAge || 0) / 60000)}m — intake still working.`
        : `Last Gingr activity ${Math.round(freshestAge / 60000)} minute(s) ago.`,
      webhookAt,
      lastSeenAt,
      freshestAt
    };
  }

  if (freshestAge <= 60 * 60_000) {
    return {
      status: "degraded",
      label: "Gingr ● Sync delayed",
      detail: `Gingr synchronization delayed — last activity ${Math.round(freshestAge / 60000)} minutes ago.`,
      webhookAt,
      lastSeenAt,
      freshestAt
    };
  }

  return {
    status: "offline",
    label: "Gingr ● Disconnected",
    detail: `No fresh Gingr activity for ${Math.round(freshestAge / 60000)} minutes. Check webhook URL (/api/gingr/webhook) and Gingr API credentials.`,
    webhookAt,
    lastSeenAt,
    freshestAt
  };
}
