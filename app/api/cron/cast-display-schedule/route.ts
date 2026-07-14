import { NextResponse } from "next/server";
import { applyCastDisplaySchedule } from "@/lib/remote-cast/schedule";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get("authorization")?.trim();
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return request.headers.get("x-vercel-cron") === "1";
}

/**
 * Keeps cast digital whiteboards on a fixed building schedule without touching
 * Gingr sync paths. Runs every 15 minutes; desired-state only (no spam).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const summary = await applyCastDisplaySchedule(supabase);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cast display schedule cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
