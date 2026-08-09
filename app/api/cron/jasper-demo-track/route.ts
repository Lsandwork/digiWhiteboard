import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getDemoDriveState, getOwnerTrackingDemo } from "@/lib/route-generator/owner-tracking";
import { getPublicSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Trigger Jasper pickup demo SMS (Lincoln & Manchester → Redlands).
 * Auth: CRON_SECRET bearer or x-vercel-cron.
 *
 * GET/POST /api/cron/jasper-demo-track?to=2139131391&phase=start|pulling_up|arrived
 */
export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "2139131391";
  const phase = (url.searchParams.get("phase") || "start").toLowerCase();
  const startedAtMs = Number(url.searchParams.get("t") || Date.now());
  const token = "jasper";

  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured." }, { status: 503 });
  }

  const base = getPublicSiteUrl().replace(/\/$/, "");
  const trackUrl = `${base}/track/${token}?t=${startedAtMs}`;
  const drive = getDemoDriveState(Date.now(), startedAtMs, token);
  const view = getOwnerTrackingDemo(token, { startedAtMs, nowMs: Date.now() });

  let body: string;
  if (phase === "pulling_up") {
    body = `Fitdog: driver is pulling up to Jasper's stop at 7742 Redlands St, Playa Del Rey right now. ${trackUrl}`;
  } else if (phase === "arrived") {
    body = `Fitdog: your driver has arrived for Jasper at 7742 Redlands St, Playa Del Rey. ${trackUrl}`;
  } else if (phase === "approaching") {
    body = `Fitdog: Jasper's driver is about ${drive.etaMinutes} min away from 7742 Redlands St. Live map: ${trackUrl}`;
  } else {
    body = `Fitdog: Jasper pickup — driver departing Lincoln & Manchester at 9:08pm. About ${drive.etaMinutes} min to 7742 Redlands St, Playa Del Rey. Track live: ${trackUrl}`;
  }

  const sent = await sms.send({
    to,
    body,
    purpose: "transactional",
    idempotencyKey: `jasper-cron:${phase}:${to}:${startedAtMs}`.slice(0, 64)
  });

  return NextResponse.json({
    ok: sent.ok,
    phase,
    to,
    body,
    trackUrl,
    startedAtMs,
    etaMinutes: drive.etaMinutes,
    headline: view.headline,
    subline: view.subline,
    stop: view.stopAddress,
    vehicle: drive.vehicle,
    error: sent.error,
    providerMessageId: sent.providerMessageId
  });
}
