import { getServiceSupabase } from "@/lib/supabase/server";
import { estimateSmsCostUsd } from "@/lib/integrations/sms/cost-events";

const RECONCILE_MIN_AGE_MS = 3 * 60 * 1000;
const RECONCILE_BATCH = 40;

type TwilioMessageResource = {
  sid?: string;
  num_segments?: string;
  price?: string;
  status?: string;
};

async function fetchTwilioMessage(sid: string): Promise<TwilioMessageResource | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!accountSid || !authToken) return null;

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${sid}.json`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return (await response.json()) as TwilioMessageResource;
}

function mapTwilioStatus(status: string | undefined): string {
  const value = String(status || "").toLowerCase();
  if (value === "delivered") return "delivered";
  if (value === "undelivered" || value === "failed") return "undelivered";
  return "sent";
}

/** Background reconciliation — fetches Twilio Message Resource by SID (no Body/To stored). */
export async function reconcileSmsCostEvents(limit = RECONCILE_BATCH): Promise<{
  checked: number;
  reconciled: number;
  skippedPending: number;
  errors: string[];
}> {
  const supabase = getServiceSupabase();
  const cutoff = new Date(Date.now() - RECONCILE_MIN_AGE_MS).toISOString();

  const { data: rows, error } = await supabase
    .from("sms_cost_events")
    .select("id, provider_message_sid, created_at")
    .not("provider_message_sid", "is", null)
    .is("reconciled_at", null)
    .eq("status", "sent")
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { checked: 0, reconciled: 0, skippedPending: 0, errors: [error.message] };
  }

  let reconciled = 0;
  let skippedPending = 0;
  const errors: string[] = [];

  for (const row of rows ?? []) {
    const sid = String(row.provider_message_sid || "");
    if (!sid) continue;

    const resource = await fetchTwilioMessage(sid);
    if (!resource) {
      errors.push(`${sid}: Twilio fetch failed`);
      continue;
    }

    const numSegmentsRaw = resource.num_segments ? Number(resource.num_segments) : 0;
    if (!numSegmentsRaw || numSegmentsRaw <= 0) {
      skippedPending += 1;
      continue;
    }

    const price = resource.price ? Math.abs(Number(resource.price)) : null;
    const status = mapTwilioStatus(resource.status);

    await supabase
      .from("sms_cost_events")
      .update({
        actual_segments: numSegmentsRaw,
        actual_cost: price != null && Number.isFinite(price) ? price : estimateSmsCostUsd(numSegmentsRaw),
        status,
        reconciled_at: new Date().toISOString(),
        reconcile_error: null
      })
      .eq("id", row.id);

    reconciled += 1;
  }

  return { checked: rows?.length ?? 0, reconciled, skippedPending, errors: errors.slice(0, 10) };
}

/** Report Smart Encoding recommendation — does not change Twilio console settings. */
export function twilioSmartEncodingReport(): {
  usesMessagingService: boolean;
  smartEncodingRecommended: boolean;
  setting: string;
  note: string;
} {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";
  const usesMessagingService = Boolean(messagingServiceSid);
  return {
    usesMessagingService,
    smartEncodingRecommended: usesMessagingService,
    setting:
      "Twilio Console > Messaging > Services > [your service] > Content Settings > Enable Smart Encoding",
    note: usesMessagingService
      ? "Smart Encoding can convert some Unicode to GSM-7 as a safety net, but RuffOps templates should already be GSM-safe."
      : "Configure TWILIO_MESSAGING_SERVICE_SID to use a Messaging Service; Smart Encoding applies per Messaging Service."
  };
}
