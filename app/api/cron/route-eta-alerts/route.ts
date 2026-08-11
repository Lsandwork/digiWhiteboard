import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { processOwnerEtaAlerts } from "@/lib/route-generator/owner-tracking";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Real owner ETA SMS only (Samsara GPS + policy gates).
 * Jasper demo SMS is intentionally NOT invoked here — that path sent morning
 * “departing at 9:08pm” texts in production and must never auto-run again.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processOwnerEtaAlerts();
    return NextResponse.json({ ok: true, ...result, jasperDemo: { skipped: true, reason: "removed_from_production_cron" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ETA alert cron failed" },
      { status: 500 }
    );
  }
}
