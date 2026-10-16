import { NextResponse } from "next/server";
import { POST as boardGingrWebhook } from "@/app/api/gingr/webhook/route";
import { ingestGingrWebhook } from "@/lib/integrations/gingr/webhooks/process";
import type { GingrWebhookPayload } from "@/lib/integrations/gingr/types";
import { isRufflyEnabled } from "@/lib/ruffly/flags";

export const dynamic = "force-dynamic";

/**
 * Board pipeline (live transitions, Shelly, fighter alerts, Ops sync) for the same delivery.
 * Gingr posts to one webhook URL; since 2026-08-01 that URL is this endpoint, so without
 * this hand-off the board receiver gets nothing. Never throws — Ruffly ingest must still run.
 */
async function forwardToBoardPipeline(rawBody: string, requestUrl: string): Promise<Response | null> {
  try {
    return await boardGingrWebhook(
      new Request(new URL("/api/gingr/webhook", requestUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawBody
      })
    );
  } catch (error) {
    console.error("[ruffly-gingr-webhook] board pipeline failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Ruffly Gingr webhook endpoint (parallel to board /api/gingr/webhook).
 * Configure in Gingr as: https://staff.ruffops.com/api/ruffly/webhooks/gingr
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: GingrWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as GingrWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const board = forwardToBoardPipeline(rawBody, request.url);

  if (!isRufflyEnabled() && process.env.RUFFLY_WEBHOOKS_ALWAYS_ACCEPT !== "true") {
    const boardResponse = await board;
    if (boardResponse?.ok) return NextResponse.json({ ok: true, board: true, ruffly: "disabled" });
    return NextResponse.json({ error: "Ruffly is disabled." }, { status: 503 });
  }

  try {
    const [result] = await Promise.all([ingestGingrWebhook(payload), board]);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }
    // Acknowledge quickly; expensive work is queued.
    return NextResponse.json({ ok: true, duplicate: result.duplicate ?? false, eventId: result.eventId });
  } catch (error) {
    await board;
    const message = error instanceof Error ? error.message : "Webhook ingest failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
