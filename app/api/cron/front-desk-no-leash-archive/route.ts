import { NextResponse } from "next/server";
import { archiveDueNoLeashOpenLogs } from "@/lib/staff/admin-ops";
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
 * Scheduled at 07:00 and 08:00 UTC (Pacific midnight in PDT / PST).
 * Archives Open Front Desk / Open Log rows that contain "No leash" once the
 * following Pacific calendar day begins. Eligibility is date-based, so overdue
 * rows are still archived if the exact midnight tick was missed.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const result = await archiveDueNoLeashOpenLogs(supabase, {
      actor: "system:cron:front-desk-no-leash-archive"
    });
    return NextResponse.json({
      ok: true,
      midnight: isPacificMidnightHour(),
      archived: result.archived,
      archived_ids: result.archivedIds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No leash archive cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
