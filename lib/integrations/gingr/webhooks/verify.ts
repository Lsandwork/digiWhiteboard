import { createHmac, timingSafeEqual } from "crypto";
import type { GingrWebhookPayload } from "@/lib/integrations/gingr/types";

/** Same HMAC construction used by the existing staff board Gingr webhook. */
export function verifyGingrWebhookSignature(
  payload: GingrWebhookPayload,
  key: string | undefined = process.env.GINGR_WEBHOOK_SIGNATURE_KEY
): boolean {
  if (!key || !payload.signature) return false;
  const entityId = payload.entity_id == null ? "" : String(payload.entity_id);
  const message = `${payload.webhook_type ?? ""}${entityId}${payload.entity_type ?? ""}`;
  const expected = createHmac("sha256", key).update(message).digest("hex");
  const received = String(payload.signature);
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function gingrWebhookIdempotencyKey(payload: GingrWebhookPayload): string {
  const type = String(payload.webhook_type ?? "unknown");
  const entityId = payload.entity_id == null ? "none" : String(payload.entity_id);
  const entityType = String(payload.entity_type ?? "none");
  const signature = String(payload.signature ?? "nosig");
  return `gingr:${type}:${entityType}:${entityId}:${signature.slice(0, 24)}`;
}

export function sanitizeGingrWebhookPayload(payload: GingrWebhookPayload): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...payload };
  delete clone.signature;
  // Never persist credential-like fields if present in entity_data
  const data = payload.entity_data;
  if (data && typeof data === "object") {
    const cleaned: Record<string, unknown> = { ...data };
    for (const key of Object.keys(cleaned)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("password") ||
        lower.includes("secret") ||
        lower.includes("token") ||
        lower.includes("card") ||
        lower.includes("cvv")
      ) {
        cleaned[key] = "[redacted]";
      }
    }
    clone.entity_data = cleaned;
  }
  return clone;
}
