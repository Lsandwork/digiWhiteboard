import { NextResponse } from "next/server";
import { isPacificFiveAm, syncIncidentsFromWebhookInbox } from "@/lib/staff/track-incidents";
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
 * Scheduled at 12:05 and 13:05 UTC; only runs when America/Los_Angeles hour is 5.
 * Catch-up only — does not call Gingr HTTP APIs.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isPacificFiveAm()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not 5:00 AM Pacific." });
  }

  try {
    const supabase = getServiceSupabase();
    const run = await syncIncidentsFromWebhookInbox(supabase, { trigger: "cron" });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Track incidents cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
