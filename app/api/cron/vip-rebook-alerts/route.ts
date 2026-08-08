import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { processVipRebookAlerts } from "@/lib/staff/vip-auto-book";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Daily: Medium VIP re-book alerts after Need to Re-Book has been Yes for 14 days. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const result = await processVipRebookAlerts(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "VIP rebook alert cron failed." },
      { status: 500 }
    );
  }
}
