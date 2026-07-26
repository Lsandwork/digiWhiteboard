import { NextResponse } from "next/server";
import { isSmsOptOutRequest, OPT_OUT_CONFIRMATION } from "@/lib/ruffly/consent/opt-out";
import { applySmsOptOut } from "@/lib/ruffly/consent/gate";
import { normalizePhone } from "@/lib/ruffly/consent/normalize";
import { getServiceSupabase } from "@/lib/supabase/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";

export const dynamic = "force-dynamic";

/**
 * Inbound SMS webhook (Twilio-compatible form body).
 * Configure Twilio webhook to POST here.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let from = "";
  let body = "";

  try {
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as { From?: string; Body?: string; from?: string; body?: string };
      from = String(json.From || json.from || "");
      body = String(json.Body || json.body || "");
    } else {
      const form = await request.formData();
      from = String(form.get("From") || form.get("from") || "");
      body = String(form.get("Body") || form.get("body") || "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

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
    if (process.env.RUFFLY_SENDING_SMS_ENABLED === "true" && from) {
      await getSmsProvider().send({ to: from, body: OPT_OUT_CONFIRMATION, purpose: "transactional" });
    }
    return NextResponse.json({ ok: true, optOut: true });
  }

  // Ensure conversation + inbound message
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
