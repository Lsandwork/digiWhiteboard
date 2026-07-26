import { NextResponse } from "next/server";
import { syncSamsaraVehicleFeed, evaluateStaleSessions } from "@/lib/live-tracking/service";
import { processQueuedNotifications } from "@/lib/live-tracking/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";
import { applyEtaUpdate } from "@/lib/live-tracking/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron === "1") return true;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const feed = await syncSamsaraVehicleFeed();
    const stale = await evaluateStaleSessions();
    const notifications = await processQueuedNotifications(25);

    // Process queued webhook jobs lightly
    const supabase = getServiceSupabase();
    const { data: jobs } = await supabase
      .from("transport_tracking_jobs")
      .select("*")
      .eq("status", "queued")
      .eq("job_type", "process_samsara_webhook")
      .order("created_at", { ascending: true })
      .limit(20);

    let webhooksProcessed = 0;
    for (const job of jobs ?? []) {
      await supabase
        .from("transport_tracking_jobs")
        .update({ status: "running", updated_at: new Date().toISOString() })
        .eq("id", job.id);

      try {
        const eventId = String((job.payload as { eventId?: string })?.eventId || "");
        const { data: event } = await supabase
          .from("transport_tracking_webhook_events")
          .select("*")
          .eq("event_id", eventId)
          .maybeSingle();

        const sanitized = (event?.payload_sanitized || {}) as Record<string, unknown>;
        const data = (sanitized.data || {}) as Record<string, unknown>;
        const stopId = String(data.stopId || data.routeStopId || "");
        const eta = data.eta == null ? null : String(data.eta);

        if (stopId && eta) {
          const { data: session } = await supabase
            .from("transport_tracking_sessions")
            .select("id")
            .eq("samsara_stop_id", stopId)
            .maybeSingle();
          if (session?.id) {
            await applyEtaUpdate({
              sessionId: String(session.id),
              etaAt: eta,
              etaSource: "samsara_eta_webhook",
              samsaraEventId: eventId
            });
          }
        }

        if (event?.id) {
          await supabase
            .from("transport_tracking_webhook_events")
            .update({ status: "completed", processed_at: new Date().toISOString() })
            .eq("id", event.id);
        }
        await supabase
          .from("transport_tracking_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
        webhooksProcessed += 1;
      } catch (err) {
        await supabase
          .from("transport_tracking_jobs")
          .update({
            status: "failed",
            last_error: err instanceof Error ? err.message.slice(0, 400) : "failed",
            attempts: Number(job.attempts || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
      }
    }

    return NextResponse.json({
      ok: true,
      feed,
      stale,
      notifications,
      webhooksProcessed
    });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      note: error instanceof Error ? error.message : "cron skipped"
    });
  }
}
