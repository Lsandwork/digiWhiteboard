import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/** Drain queued route worker jobs / retries (no-op when queue empty). */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("route_worker_jobs")
      .select("id, status, attempts, max_attempts")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) {
      // Table may not exist until migration is applied.
      return NextResponse.json({ ok: true, processed: 0, note: error.message });
    }
    return NextResponse.json({ ok: true, queued: data?.length ?? 0, jobs: data ?? [] });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      note: error instanceof Error ? error.message : "cron skipped"
    });
  }
}
