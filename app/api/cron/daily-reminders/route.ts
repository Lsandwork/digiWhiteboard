import { NextResponse } from "next/server";
import { releaseQueuedDailyReminders, sendDueDailyReminders } from "@/lib/staff/daily-reminders";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const summary = await sendDueDailyReminders(supabase);
    await releaseQueuedDailyReminders(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily reminder cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
