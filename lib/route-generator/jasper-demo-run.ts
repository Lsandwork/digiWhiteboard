import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getDemoDriveState, getOwnerTrackingDemo } from "@/lib/route-generator/owner-tracking";
import { civilTimeToUtcMs } from "@/lib/route-generator/samsara-csv";
import { getPublicSiteUrl } from "@/lib/site-url";

const TOKEN = "jasper";
const TO = "2139131391";
const ACTION = "jasper.demo.sms_session";

/** Explicit opt-in only. Production must leave this unset / false. */
export function isJasperDemoSmsEnabled(): boolean {
  return process.env.JASPER_DEMO_SMS_ENABLED === "true";
}

type DemoSession = {
  startedAtMs: number;
  to: string;
  trackUrl: string;
  operatingDateLa: string;
  sent: {
    start?: boolean;
    approaching?: boolean;
    pulling_up?: boolean;
    arrived?: boolean;
  };
  completed?: boolean;
};

export function todayLa(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(nowMs));
}

/** LA wall-clock minutes since midnight for `nowMs`. */
export function laMinutesSinceMidnight(nowMs: number = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Demo SMS may only run in a tight evening window around 9:08pm PT.
 * Morning / midday sends with a 9:08pm departure line are forbidden.
 */
export function isWithinJasperDemoSmsWindow(nowMs: number = Date.now()): boolean {
  const mins = laMinutesSinceMidnight(nowMs);
  // 9:05pm–9:25pm PT inclusive
  return mins >= 21 * 60 + 5 && mins <= 21 * 60 + 25;
}

/** Tonight's 9:08pm in America/Los_Angeles, as epoch ms (handles PST/PDT). */
export function jasperDemoDepartAtMs(nowMs: number = Date.now()): number {
  const dateLa = todayLa(nowMs);
  return civilTimeToUtcMs(`${dateLa}T21:08:00`, "America/Los_Angeles");
}

export function formatJasperDepartLabel(departAtMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(new Date(departAtMs))
    .toLowerCase()
    .replace(/\s/g, "");
}

/**
 * Jasper pickup SMS demo — DISABLED unless JASPER_DEMO_SMS_ENABLED=true.
 * Never call from the production ETA cron or from public track page loads.
 * When enabled, only sends inside the 9:05–9:25pm PT window for today's LA date.
 */
export async function maybeAdvanceJasperDemoSms(options?: {
  force?: boolean;
  to?: string;
  nowMs?: number;
}): Promise<Record<string, unknown>> {
  if (!isJasperDemoSmsEnabled()) {
    return {
      skipped: true,
      reason: "jasper_demo_sms_disabled",
      detail: "Set JASPER_DEMO_SMS_ENABLED=true only for intentional staff demos. Production cron must never enable this."
    };
  }

  const now = options?.nowMs ?? Date.now();
  const operatingDateLa = todayLa(now);

  if (!options?.force && !isWithinJasperDemoSmsWindow(now)) {
    return {
      skipped: true,
      reason: "outside_demo_evening_window",
      operatingDateLa,
      detail: "Demo SMS only allowed 9:05pm–9:25pm America/Los_Angeles."
    };
  }

  const sms = getSmsProvider();
  if (!sms.isConfigured()) {
    return { skipped: true, reason: "twilio_not_configured" };
  }

  const supabase = getServiceSupabase();
  const sinceIso = new Date(now - 20 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("route_audit_events")
    .select("id, new_value, created_at")
    .eq("action", ACTION)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let session = (existing?.new_value || null) as DemoSession | null;

  if (session?.completed && session.operatingDateLa === operatingDateLa && !options?.force) {
    return { skipped: true, reason: "already_completed_today", session };
  }

  if (session && session.operatingDateLa && session.operatingDateLa !== operatingDateLa && !options?.force) {
    session = null;
  }

  const base = getPublicSiteUrl().replace(/\/$/, "");
  const to = options?.to || TO;
  const departAtMs = jasperDemoDepartAtMs(now);

  if (!session || session.completed) {
    // Never start (or text) before the scheduled evening departure unless force.
    if (!options?.force && now < departAtMs - 3 * 60_000) {
      return {
        skipped: true,
        reason: "before_scheduled_departure",
        operatingDateLa,
        departAtMs
      };
    }
    const startedAtMs = options?.force && now > departAtMs + 120_000 ? now : departAtMs;
    session = {
      startedAtMs,
      to,
      trackUrl: `${base}/track/${TOKEN}?t=${startedAtMs}`,
      operatingDateLa,
      sent: {}
    };
  }

  // Hard block: never send the start SMS before the van's scheduled start clock.
  if (!session.sent.start && now < session.startedAtMs - 60_000 && !options?.force) {
    return {
      skipped: true,
      reason: "start_sms_too_early",
      startedAtMs: session.startedAtMs,
      operatingDateLa
    };
  }

  const clock = Math.max(now, session.startedAtMs);
  const drive = getDemoDriveState(clock, session.startedAtMs, TOKEN);
  const view = getOwnerTrackingDemo(TOKEN, { startedAtMs: session.startedAtMs, nowMs: clock });
  const sentPhase: string[] = [];
  const departLabel = formatJasperDepartLabel(session.startedAtMs);

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
      `Fitdog: Jasper pickup — driver departing Lincoln & Manchester at ${departLabel}. About ${drive.etaMinutes} min to 7742 Redlands St, Playa Del Rey. Track live: ${session.trackUrl}`
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

  if (existing?.id && (existing.new_value as DemoSession | null)?.operatingDateLa === operatingDateLa) {
    await supabase.from("route_audit_events").update({ new_value: session }).eq("id", existing.id);
  } else {
    await supabase.from("route_audit_events").insert({
      action: ACTION,
      entity_type: "demo",
      entity_id: TOKEN,
      actor_email: "cron",
      actor_role: "system",
      new_value: session,
      reason: "Jasper pickup live-track demo SMS (explicit enable only)"
    });
  }

  return {
    ok: !sendError,
    trackUrl: session.trackUrl,
    startedAtMs: session.startedAtMs,
    operatingDateLa,
    etaMinutes: drive.etaMinutes,
    headline: view.headline,
    progress: drive.routeProgress,
    sentPhase,
    sent: session.sent,
    completed: Boolean(session.completed),
    error: sendError
  };
}
