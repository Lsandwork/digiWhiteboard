import { NextResponse } from "next/server";
import { syncLiveFleetTelemetry } from "@/lib/live-fleet/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Optional background sync so telemetry stays warm when Live Fleet UI is closed.
 * Authenticated via CRON_SECRET like other RuffOps crons.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncLiveFleetTelemetry({ force: true });
  return NextResponse.json({
    ok: true,
    synced: result.synced,
    skipped: result.skipped,
    updateCount: result.updateCount,
    hasNextPage: result.hasNextPage,
    configured: result.configured,
    simulated: result.simulated,
    lastError: result.lastError
  });
}
