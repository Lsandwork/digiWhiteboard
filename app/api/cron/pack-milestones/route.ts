import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runPackMilestoneAutomation } from "@/lib/team-engagement/pack-milestone-automation";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Daily-ish milestone sync from staff_directory hire dates (requires migrations 105+). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const summary = await runPackMilestoneAutomation(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pack milestone cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}