import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import {
  extractWebhookEventId,
  isWebhookPing,
  sanitizeWebhookPayload,
  verifySamsaraWebhookSignature
} from "@/lib/live-tracking/samsara-webhook";
import { isSamsaraTrackingWebhooksEnabled } from "@/lib/live-tracking/flags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Samsara webhook receiver.
 * Validates signature, stores event idempotently, returns quickly.
 * Heavy processing happens via cron/worker.
 */
export async function POST(request: Request) {
  if (!isSamsaraTrackingWebhooksEnabled()) {
    return NextResponse.json({ ok: false, error: "Webhooks disabled" }, { status: 503 });
  }

  const rawBody = await request.text();
  const secret = process.env.SAMSARA_WEBHOOK_SECRET?.trim() || "";
  const verification = verifySamsaraWebhookSignature({
    rawBody,
    timestampHeader: request.headers.get("X-Samsara-Timestamp"),
    signatureHeader: request.headers.get("X-Samsara-Signature"),
    secret
  });

  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: verification.reason }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (isWebhookPing(payload)) {
    return NextResponse.json({ ok: true, ping: true });
  }

  const eventId = extractWebhookEventId(payload) || `anon-${verification.timestamp}-${hashLite(rawBody)}`;
  const eventType =
    typeof payload === "object" && payload
      ? String((payload as Record<string, unknown>).eventType ?? (payload as Record<string, unknown>).type ?? "unknown")
      : "unknown";

  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("transport_tracking_webhook_events").insert({
      provider: "samsara",
      event_id: eventId,
      event_type: eventType,
      status: "queued",
      payload_sanitized: sanitizeWebhookPayload(payload)
    });

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      // Queue job row even if webhook table insert fails post-migration lag
      await supabase.from("transport_tracking_jobs").insert({
        job_type: "process_samsara_webhook",
        status: "queued",
        payload: { eventId, eventType }
      });
    } else {
      await supabase.from("transport_tracking_jobs").insert({
        job_type: "process_samsara_webhook",
        status: "queued",
        payload: { eventId, eventType },
        correlation_id: eventId
      });
    }
  } catch {
    // Still acknowledge to avoid Samsara retry storms when DB is temporarily unavailable.
  }

  return NextResponse.json({ ok: true, queued: true });
}

function hashLite(value: string) {
  let h = 0;
  for (let i = 0; i < Math.min(value.length, 200); i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
