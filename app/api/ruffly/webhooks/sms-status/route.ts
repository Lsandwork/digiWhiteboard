import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Twilio Message Status Callback.
 * Configured automatically by the SMS provider when NEXT_PUBLIC_SITE_URL is set.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const messageSid = String(form.get("MessageSid") || form.get("SmsSid") || "").trim();
  const messageStatus = String(form.get("MessageStatus") || form.get("SmsStatus") || "").trim();
  const errorCodeRaw = String(form.get("ErrorCode") || "").trim();
  const to = String(form.get("To") || "").trim();
  const from = String(form.get("From") || "").trim();
  const errorCode = errorCodeRaw ? Number(errorCodeRaw) : null;

  if (!messageSid) {
    return NextResponse.json({ ok: false, error: "Missing MessageSid" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
    const failed = messageStatus === "undelivered" || messageStatus === "failed";
    const delivered = messageStatus === "delivered";
    const now = new Date().toISOString();
    await supabase.from("ruffly_provider_connections").upsert(
      {
        provider: "twilio",
        display_name: "Twilio SMS",
        status: failed ? "error" : "connected",
        ...(delivered ? { last_success_at: now, last_error: null, last_error_at: null } : {}),
        ...(failed
          ? {
              last_error_at: now,
              last_error:
                `SMS ${messageStatus} to ${to || "unknown"} from ${from || "unknown"}` +
                (errorCode ? ` (Twilio ${errorCode})` : "") +
                ` [${messageSid}]`
            }
          : {}),
        updated_at: now
      },
      { onConflict: "provider" }
    );
  } catch {
    // Best-effort status persistence; never fail the Twilio callback hard.
  }

  return NextResponse.json({ ok: true, messageSid, messageStatus, errorCode });
}
