import { NextResponse } from "next/server";
import { ingestGingrWebhook } from "@/lib/integrations/gingr/webhooks/process";
import type { GingrWebhookPayload } from "@/lib/integrations/gingr/types";
import { isRufflyEnabled } from "@/lib/ruffly/flags";

export const dynamic = "force-dynamic";

/**
 * Ruffly Gingr webhook endpoint (parallel to board /api/gingr/webhook).
 * Configure in Gingr as: https://staff.ruffops.com/api/ruffly/webhooks/gingr
 */
export async function POST(request: Request) {
  if (!isRufflyEnabled() && process.env.RUFFLY_WEBHOOKS_ALWAYS_ACCEPT !== "true") {
    return NextResponse.json({ error: "Ruffly is disabled." }, { status: 503 });
  }

  let payload: GingrWebhookPayload;
  try {
    payload = (await request.json()) as GingrWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    const result = await ingestGingrWebhook(payload);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    // Acknowledge quickly; expensive work is queued.
    return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false, eventId: result.eventId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook ingest failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
