import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncVipFitdogDirectory } from "@/lib/staff/vip-auto-book";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily pull of app.fitdog.com class signups into Fitdog owner/dog directory for VIP Auto Book. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const result = await syncVipFitdogDirectory(supabase, { lookbackDays: 14, lookaheadDays: 60 });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "VIP directory cron failed." },
      { status: 500 }
    );
  }
}
