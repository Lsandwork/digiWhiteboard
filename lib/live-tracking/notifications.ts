import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import {
  isLiveTrackingShadowMode,
  isTrackingEmailEnabled,
  isTrackingSmsEnabled
} from "@/lib/live-tracking/flags";
import { DEFAULT_TEMPLATES, renderTrackingTemplate, templateKeyForEvent } from "@/lib/live-tracking/templates";
import { maskPhone } from "@/lib/live-tracking/privacy";
import { writeTrackingAuditEvent } from "@/lib/live-tracking/audit";

export function idempotencyKey(routeStopOrSessionId: string, eventType: string, channel: string) {
  return `tracking:${routeStopOrSessionId}:${eventType}:${channel}`;
}

async function loadTemplate(templateKey: string): Promise<string> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("transport_tracking_notification_templates")
      .select("body")
      .eq("template_key", templateKey)
      .eq("active", true)
      .maybeSingle();
    if (data?.body) return String(data.body);
  } catch {
    // fall through
  }
  return DEFAULT_TEMPLATES[templateKey] || DEFAULT_TEMPLATES.pickup_15;
}

export async function queueThresholdNotification(params: {
  sessionId: string;
  eventType: string;
  direction: "pickup" | "dropoff";
  dogNames: string[];
  trackingUrl: string;
  arrivalTime?: string | null;
  phone?: string | null;
  email?: string | null;
  thresholdReachedAt?: string;
  channels?: Array<"sms" | "email">;
}) {
  const supabase = getServiceSupabase();
  const shadow = isLiveTrackingShadowMode();
  const channels = params.channels ?? ["sms", "email"];
  const templateKey = templateKeyForEvent(params.eventType, params.direction);
  const template = await loadTemplate(templateKey);
  const body = renderTrackingTemplate(template, {
    dog_names: params.dogNames.join(" & "),
    tracking_url: params.eventType === "live_15" || params.eventType === "delay" ? params.trackingUrl : "",
    arrival_time: params.arrivalTime || "",
    direction: params.direction
  });

  const created: string[] = [];

  for (const channel of channels) {
    if (channel === "sms" && !params.phone) continue;
    if (channel === "email" && !params.email) continue;
    if (channel === "sms" && !isTrackingSmsEnabled() && !shadow) continue;
    if (channel === "email" && !isTrackingEmailEnabled() && !shadow) continue;

    const key = idempotencyKey(params.sessionId, params.eventType, channel);
    const { data, error } = await supabase
      .from("transport_tracking_notifications")
      .upsert(
        {
          session_id: params.sessionId,
          event_type: params.eventType,
          channel,
          idempotency_key: key,
          status: shadow ? "shadow_recorded" : "queued",
          body,
          recipient_masked: channel === "sms" ? maskPhone(params.phone) : params.email?.replace(/(.{2}).+(@.+)/, "$1***$2"),
          threshold_reached_at: params.thresholdReachedAt || new Date().toISOString(),
          provider: channel === "sms" ? "twilio" : "resend"
        },
        { onConflict: "idempotency_key", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (!error && data?.id) created.push(String(data.id));
  }

  return { created, shadow, body };
}

export async function processQueuedNotifications(limit = 20) {
  if (isLiveTrackingShadowMode()) {
    return { processed: 0, note: "shadow_mode" };
  }

  const supabase = getServiceSupabase();
  const { data: jobs, error } = await supabase
    .from("transport_tracking_notifications")
    .select("*")
    .eq("status", "queued")
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (error || !jobs?.length) return { processed: 0, error: error?.message };

  let processed = 0;
  for (const job of jobs) {
    await supabase
      .from("transport_tracking_notifications")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", job.id);

    try {
      if (job.channel === "sms") {
        if (!isTrackingSmsEnabled()) throw new Error("SMS disabled");
        const session = await supabase
          .from("transport_tracking_sessions")
          .select("owner_phone_e164")
          .eq("id", job.session_id)
          .maybeSingle();
        const to = session.data?.owner_phone_e164;
        if (!to) throw new Error("Missing owner phone");
        const result = await getSmsProvider().send({
          to,
          body: String(job.body),
          purpose: "transactional",
          idempotencyKey: String(job.idempotency_key)
        });
        if (!result.ok) throw new Error(result.error || "SMS failed");
        await supabase
          .from("transport_tracking_notifications")
          .update({
            status: "sent",
            provider_message_id: result.providerMessageId ?? null,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
      } else if (job.channel === "email") {
        if (!isTrackingEmailEnabled()) throw new Error("Email disabled");
        const session = await supabase
          .from("transport_tracking_sessions")
          .select("owner_email")
          .eq("id", job.session_id)
          .maybeSingle();
        const to = session.data?.owner_email;
        if (!to) throw new Error("Missing owner email");
        const emailProvider = getEmailProvider();
        const result = await emailProvider.send({
          to,
          subject: "Fitdog transportation update",
          html: `<p>${String(job.body).replace(/\n/g, "<br/>")}</p>`,
          text: String(job.body),
          purpose: "transactional"
        });
        if (!result.ok) throw new Error(result.error || "Email failed");
        await supabase
          .from("transport_tracking_notifications")
          .update({
            status: "sent",
            provider_message_id: result.providerMessageId ?? null,
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);
      } else {
        throw new Error(`Unsupported channel ${job.channel}`);
      }
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "send failed";
      await supabase
        .from("transport_tracking_notifications")
        .update({
          status: "failed",
          failure_reason: message.slice(0, 500),
          retry_count: Number(job.retry_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      await writeTrackingAuditEvent({
        action: "live_tracking.notification_failed",
        entityType: "transport_tracking_notification",
        entityId: String(job.id),
        reason: message
      });
    }
  }

  return { processed };
}
