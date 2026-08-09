import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getDemoDriveState, getOwnerTrackingDemo } from "@/lib/route-generator/owner-tracking";
import { getPublicSiteUrl } from "@/lib/site-url";

const TOKEN = "jasper";
const TO = "2139131391";
const ACTION = "jasper.demo.sms_session";

type DemoSession = {
  startedAtMs: number;
  to: string;
  trackUrl: string;
  sent: {
    start?: boolean;
    approaching?: boolean;
    pulling_up?: boolean;
    arrived?: boolean;
  };
  completed?: boolean;
};

function todayLa(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

/**
 * Advances the Jasper pickup SMS demo on each cron tick (no Samsara export).
 * Van: Lincoln & Manchester → 7742 Redlands St. Texts 2139131391 as the van approaches / pulls up.
 */
export async function maybeAdvanceJasperDemoSms(options?: {
  force?: boolean;
  to?: string;
}): Promise<Record<string, unknown>> {
  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return { skipped: true, reason: "twilio_not_configured" };
  }

  const supabase = getServiceSupabase();
  const sinceIso = new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("route_audit_events")
    .select("id, new_value, created_at")
    .eq("action", ACTION)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  void todayLa();

  let session = (existing?.new_value || null) as DemoSession | null;
  if (session?.completed && !options?.force) {
    return { skipped: true, reason: "already_completed_today", session };
  }

  const base = getPublicSiteUrl().replace(/\/$/, "");
  const to = options?.to || TO;
  const now = Date.now();

  if (!session) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date(now));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const nineOhEight = Date.parse(
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T21:08:00-07:00`
    );
    const startedAtMs = now > nineOhEight + 120_000 ? now : nineOhEight;
    session = {
      startedAtMs,
      to,
      trackUrl: `${base}/track/${TOKEN}?t=${startedAtMs}`,
      sent: {}
    };
  }

  const clock = Math.max(now, session.startedAtMs);
  const drive = getDemoDriveState(clock, session.startedAtMs, TOKEN);
  const view = getOwnerTrackingDemo(TOKEN, { startedAtMs: session.startedAtMs, nowMs: clock });
  const sentPhase: string[] = [];

  async function sendPhase(phase: keyof DemoSession["sent"], body: string) {
    if (session!.sent[phase]) return;
    const result = await sms.send({
      to: session!.to,
      body,
      purpose: "transactional",
      idempotencyKey: `jasper-demo:${phase}:${session!.startedAtMs}`.slice(0, 64)
    });
    if (result.ok) {
      session!.sent[phase] = true;
      sentPhase.push(phase);
    } else {
      return { ok: false, error: result.error, phase };
    }
    return result;
  }

  let sendError: string | undefined;
  if (!session.sent.start) {
    const res = await sendPhase(
      "start",
      `Fitdog: Jasper pickup — driver departing Lincoln & Manchester at 9:08pm. About ${drive.etaMinutes} min to 7742 Redlands St, Playa Del Rey. Track live: ${session.trackUrl}`
    );
    if (res && "error" in res && res.error) sendError = String(res.error);
  } else if (
    !session.sent.approaching &&
    !drive.arrived &&
    drive.etaMinutes <= 5 &&
    drive.etaMinutes > 2
  ) {
    await sendPhase(
      "approaching",
      `Fitdog: Jasper's driver is about ${drive.etaMinutes} min away from 7742 Redlands St. Live map: ${session.trackUrl}`
    );
  } else if (
    !session.sent.pulling_up &&
    !drive.arrived &&
    (drive.etaMinutes <= 2 || drive.routeProgress >= 0.92 || view.status === "pulling_up")
  ) {
    await sendPhase(
      "pulling_up",
      `Fitdog: driver is pulling up to Jasper's stop at 7742 Redlands St, Playa Del Rey right now. ${session.trackUrl}`
    );
  } else if (!session.sent.arrived && drive.arrived) {
    await sendPhase(
      "arrived",
      `Fitdog: your driver has arrived for Jasper at 7742 Redlands St, Playa Del Rey. ${session.trackUrl}`
    );
    session.completed = true;
  }

  if (session.sent.arrived) session.completed = true;

  if (existing?.id) {
    await supabase.from("route_audit_events").update({ new_value: session }).eq("id", existing.id);
  } else {
    await supabase.from("route_audit_events").insert({
      action: ACTION,
      entity_type: "demo",
      entity_id: TOKEN,
      actor_email: "cron",
      actor_role: "system",
      new_value: session,
      reason: "Jasper pickup live-track demo SMS"
    });
  }

  return {
    ok: !sendError,
    trackUrl: session.trackUrl,
    startedAtMs: session.startedAtMs,
    etaMinutes: drive.etaMinutes,
    headline: view.headline,
    progress: drive.routeProgress,
    sentPhase,
    sent: session.sent,
    completed: Boolean(session.completed),
    error: sendError
  };
}
