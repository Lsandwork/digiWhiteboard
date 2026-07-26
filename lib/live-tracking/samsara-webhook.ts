import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookVerificationResult =
  | { ok: true; timestamp: string }
  | { ok: false; reason: string };

/**
 * Verify Samsara webhook signature:
 * HMAC-SHA256 over `v1:<timestamp>:<raw-body>` compared to X-Samsara-Signature.
 */
export function verifySamsaraWebhookSignature(params: {
  rawBody: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
  secret: string;
  nowMs?: number;
  replayWindowSeconds?: number;
}): WebhookVerificationResult {
  const timestamp = params.timestampHeader?.trim() || "";
  const signatureHeader = params.signatureHeader?.trim() || "";
  if (!timestamp) return { ok: false, reason: "missing_timestamp" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };
  if (!params.secret) return { ok: false, reason: "missing_secret" };

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "invalid_timestamp" };

  const nowMs = params.nowMs ?? Date.now();
  // Samsara timestamps are typically unix seconds
  const tsMs = timestamp.length <= 10 ? tsNum * 1000 : tsNum;
  const windowSec = params.replayWindowSeconds ?? 60 * 5;
  if (Math.abs(nowMs - tsMs) > windowSec * 1000) {
    return { ok: false, reason: "timestamp_outside_replay_window" };
  }

  const signed = `v1:${timestamp}:${params.rawBody}`;
  const expected = createHmac("sha256", params.secret).update(signed).digest("hex");

  // Accept `v1=<hex>` or raw hex, or comma-separated multi-version headers.
  const candidates = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      if (part.startsWith("v1=")) return part.slice(3);
      if (part.startsWith("v1:")) return part.slice(3);
      return part;
    })
    .filter(Boolean);

  if (!candidates.length) return { ok: false, reason: "unsupported_signature_version" };

  const expectedBuf = Buffer.from(expected, "utf8");
  let matched = false;
  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) {
      matched = true;
      break;
    }
  }

  if (!matched) return { ok: false, reason: "signature_mismatch" };
  return { ok: true, timestamp };
}

export function sanitizeWebhookPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const obj = payload as Record<string, unknown>;
  const keep = [
    "eventId",
    "eventType",
    "orgId",
    "webhookId",
    "eventTime",
    "type",
    "data"
  ];
  const out: Record<string, unknown> = {};
  for (const key of keep) {
    if (key in obj) out[key] = obj[key];
  }
  // Strip likely PII nests if present
  if (out.data && typeof out.data === "object") {
    const data = { ...(out.data as Record<string, unknown>) };
    delete data.customer;
    delete data.phone;
    delete data.email;
    delete data.address;
    out.data = data;
  }
  return out;
}

export function extractWebhookEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const id = obj.eventId ?? obj.id ?? obj.event_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function isWebhookPing(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  const type = String(obj.eventType ?? obj.type ?? "").toLowerCase();
  return type.includes("ping") || type === "test";
}
