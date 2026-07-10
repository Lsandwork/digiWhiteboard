import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { processWalkBoardReminders } from "@/lib/walks-board/reminders";

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
    const summary = await processWalkBoardReminders(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Walk board reminder cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
