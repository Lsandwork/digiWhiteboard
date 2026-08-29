import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { evaluateAndPushHeatAlert } from "@/lib/staff/heat-alert";
import { getServiceSupabase, SERVICE_SUPABASE_CRON_TIMEOUT_MS } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Poll Santa Monica temperature and push an urgent staff whiteboard Heat Alert
 * (plus Super Admin SMS via createAndPushStaffNotice) when ≥ 80°F.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase({ timeoutMs: SERVICE_SUPABASE_CRON_TIMEOUT_MS });
    const result = await evaluateAndPushHeatAlert(supabase);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Heat alert cron failed.";
    return NextResponse.json({ ok: false, action: "error", error: message }, { status: 500 });
  }
}
