import { NextResponse } from "next/server";
import { syncLiveFleetTelemetry } from "@/lib/live-fleet/sync";
import { ensureLiveFleetSchema } from "@/lib/live-fleet/ensure-schema";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const SCHEMA_RECHECK_MS = 30 * 60 * 1000;
let lastLiveFleetSchemaAt = 0;
let lastLiveFleetSchema: Awaited<ReturnType<typeof ensureLiveFleetSchema>> | null = null;

async function ensureLiveFleetSchemaCached() {
  if (lastLiveFleetSchema?.ready && Date.now() - lastLiveFleetSchemaAt < SCHEMA_RECHECK_MS) {
    return lastLiveFleetSchema;
  }
  const schema = await ensureLiveFleetSchema(getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS }));
  lastLiveFleetSchema = schema;
  lastLiveFleetSchemaAt = Date.now();
  return schema;
}

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

  const schema = await ensureLiveFleetSchemaCached();
  const result = await syncLiveFleetTelemetry({ force: true });
  return NextResponse.json({
    ok: true,
    schemaReady: schema.ready,
    schemaDetail: schema.detail,
    synced: result.synced,
    skipped: result.skipped,
    updateCount: result.updateCount,
    hasNextPage: result.hasNextPage,
    configured: result.configured,
    simulated: result.simulated,
    lastError: result.lastError
  });
}
