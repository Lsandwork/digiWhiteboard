import { NextResponse } from "next/server";
import { runSystemHealthAudit } from "@/lib/admin/system-health-audit";
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
 * Twice-daily system health audit for whiteboard push / Gingr checkout lag.
 * Safe auto-fixes only (Supabase/local) — never calls live Gingr APIs.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const state = await runSystemHealthAudit(supabase, { trigger: "cron", autoFix: true });
    return NextResponse.json({
      ok: true,
      overall_status: state.overall_status,
      last_run_at: state.last_run_at,
      summary: state.runs[0]?.summary ?? null,
      open_issues: state.open_issues.length
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "System health audit cron failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
