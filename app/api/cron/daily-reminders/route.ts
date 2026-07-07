import { NextResponse } from "next/server";
import { releaseQueuedDailyReminders, sendDueDailyReminders } from "@/lib/staff/daily-reminders";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization")?.trim();
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const summary = await sendDueDailyReminders(supabase);
    await releaseQueuedDailyReminders(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily reminder cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
