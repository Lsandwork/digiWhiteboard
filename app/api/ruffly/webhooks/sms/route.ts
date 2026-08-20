import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/integrations/sms/twilio-signature";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { applySmsOptOut } from "@/lib/ruffly/consent/gate";
import { normalizePhone } from "@/lib/ruffly/consent/normalize";
import { isSmsOptOutRequest, OPT_OUT_CONFIRMATION } from "@/lib/ruffly/consent/opt-out";
import { isRufflySmsSendingEnabled } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  const params: Record<string, string> = {};
  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(json)) {
      params[key] = value == null ? "" : String(value);
    }
  } else {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      params[key] = String(value);
    }
  }
  return params;
}

export async function POST(request: Request) {
  const params = await parseBody(request).catch(() => null);
  if (!params) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const signature = request.headers.get("x-twilio-signature");
  const skipVerify = process.env.RUFFLY_SMS_WEBHOOK_SKIP_VERIFY === "true" && process.env.NODE_ENV !== "production";
  if (!skipVerify) {
    if (!authToken) {
      return NextResponse.json({ error: "SMS webhook not configured." }, { status: 503 });
    }
    const url = process.env.RUFFLY_SMS_WEBHOOK_URL?.trim() || request.url;
    const valid = verifyTwilioSignature({
      authToken,
      signature,
      url,
      params
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 401 });
    }
  }

  const from = params.From || params.from || "";
  const body = params.Body || params.body || "";
  const phoneNormalized = normalizePhone(from);
  const supabase = getServiceSupabase();

  let contactId: string | null = null;
  if (phoneNormalized) {
    const { data: contact } = await supabase
      .from("ruffly_contacts")
      .select("id")
      .eq("phone_normalized", phoneNormalized)
      .maybeSingle();
    contactId = contact?.id ?? null;
  }

  if (isSmsOptOutRequest(body)) {
    await applySmsOptOut({
      contactId,
      phone: from,
      source: "inbound_sms",
      rawBody: body
    });
    if (isRufflySmsSendingEnabled() && from) {
      await getSmsProvider().send({
        to: from,
        body: OPT_OUT_CONFIRMATION,
        purpose: "transactional",
        idempotencyKey: `ruffly-opt-out-confirm:${contactId || from}`.slice(0, 64),
        costMetadata: { category: "CLIENT_TRANSACTIONAL", templateKey: "ruffly_opt_out_confirm" }
      });
    }
    return NextResponse.json({ ok: true, optOut: true });
  }

  let conversationId: string | null = null;
  if (contactId) {
    const { data: existing } = await supabase
      .from("ruffly_conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("channel", "sms")
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    conversationId = existing?.id ?? null;
  }

  if (!conversationId) {
    const { data: created } = await supabase
      .from("ruffly_conversations")
      .insert({
        contact_id: contactId,
        channel: "sms",
        status: "waiting_staff",
        last_message_preview: body.slice(0, 240),
        last_message_at: new Date().toISOString()
      })
      .select("id")
      .single();
    conversationId = created?.id ?? null;
  }

  if (conversationId) {
    await supabase.from("ruffly_messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      channel: "sms",
      body,
      metadata: { from }
    });
    await supabase
      .from("ruffly_conversations")
      .update({
        status: "waiting_staff",
        last_message_at: new Date().toISOString(),
        last_message_preview: body.slice(0, 240),
        unread_count: 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", conversationId);
  }

  return NextResponse.json({ ok: true, conversationId });
}
