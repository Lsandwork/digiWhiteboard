import { NextResponse } from "next/server";
import { archivePreviousDayCrossoverMessages } from "@/lib/staff/admin-ops";
import { isPacificMidnightHour } from "@/lib/staff/front-desk-log";
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
 * Scheduled around Pacific midnight (07:05 + 08:05 UTC covers PST/PDT).
 * Idempotent: only mutates previous-day notes that are not already Archived.
 * Staff-ops GET also catch-up archives so Open Log stays correct if cron is late.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") === "1";
  if (!force && !isPacificMidnightHour()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not 12:00 AM Pacific hour." });
  }

  try {
    const supabase = getServiceSupabase();
    const result = await archivePreviousDayCrossoverMessages(supabase, "system:midnight-cron");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crossover midnight archive failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
