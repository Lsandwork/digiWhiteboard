import { NextResponse } from "next/server";
import { sendDueDailyReminders } from "@/lib/staff/daily-reminders";
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

export async function POST(request: Request) {
  if (!isAuthorizedCron(request) && !process.env.CRON_SECRET) {
    const legacyPassword = process.env.ADMIN_PASSWORD?.trim();
    const headerPassword = request.headers.get("x-admin-password")?.trim();
    if (!legacyPassword || headerPassword !== legacyPassword) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  } else if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const summary = await sendDueDailyReminders(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send due Daily Reminders.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
