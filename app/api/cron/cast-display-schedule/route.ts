import { NextResponse } from "next/server";
import { applyCastDisplaySchedule } from "@/lib/remote-cast/schedule";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keeps cast digital whiteboards on a fixed building schedule without touching
 * Gingr sync paths. Runs every 15 minutes; desired-state only (no spam).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const summary = await applyCastDisplaySchedule(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cast display schedule cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
