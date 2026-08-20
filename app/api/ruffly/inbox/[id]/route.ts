import { NextResponse } from "next/server";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { canSendToContact } from "@/lib/ruffly/consent/gate";
import { isRufflySmsSendingEnabled } from "@/lib/ruffly/flags";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const auth = await requireRufflyPermission(request, "ruffly.inbox.view");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const supabase = getServiceSupabase();
    const [{ data: conversation, error: cErr }, { data: messages, error: mErr }] = await Promise.all([
      supabase
        .from("ruffly_conversations")
        .select("*, contact:ruffly_contacts(*)")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("ruffly_messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true })
    ]);
    if (cErr) throw cErr;
    if (mErr) throw mErr;
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ conversation, messages: messages ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  const auth = await requireRufflyPermission(request, "ruffly.inbox.reply");
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "reply");
    const supabase = getServiceSupabase();

    if (action === "note") {
      const { data, error } = await supabase
        .from("ruffly_messages")
        .insert({
          conversation_id: id,
          direction: "internal",
          channel: "manual",
          body: String(body.body ?? ""),
          sender_admin_id: auth.session?.adminUserId ?? null
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ message: data });
    }

    if (action === "assign") {
      const assignAuth = await requireRufflyPermission(request, "ruffly.inbox.assign");
      if (!assignAuth.ok) return assignAuth.response;
      const { data, error } = await supabase
        .from("ruffly_conversations")
        .update({ assigned_employee_id: body.assigned_employee_id ?? null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ conversation: data });
    }

    if (action === "status") {
      const { data, error } = await supabase
        .from("ruffly_conversations")
        .update({
          status: body.status,
          snoozed_until: body.snoozed_until ?? null,
          updated_at: new Date().toISOString(),
          closed_at: body.status === "closed" ? new Date().toISOString() : null
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ conversation: data });
    }

    // reply
    const text = String(body.body ?? "").trim();
    if (!text) return NextResponse.json({ error: "Message body is required." }, { status: 400 });

    const { data: conversation } = await supabase
      .from("ruffly_conversations")
      .select("id, contact_id, channel")
      .eq("id", id)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

    const channel = String(body.channel ?? conversation.channel ?? "sms");

    const { data: message, error: insertError } = await supabase
      .from("ruffly_messages")
      .insert({
        conversation_id: id,
        direction: "outbound",
        channel,
        body: text,
        sender_admin_id: auth.session?.adminUserId ?? null,
        delivery_status: channel === "sms" ? "queued" : "queued"
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    if (channel === "sms" && conversation.contact_id) {
      const gate = await canSendToContact({
        contactId: conversation.contact_id,
        channel: "sms",
        purpose: "transactional"
      });
      if (!gate.allowed) {
        await supabase.from("ruffly_messages").delete().eq("id", message.id);
        return NextResponse.json({ error: gate.reason || "Send blocked by consent rules." }, { status: 403 });
      }
      const { data: contact } = await supabase
        .from("ruffly_contacts")
        .select("phone, phone_normalized")
        .eq("id", conversation.contact_id)
        .maybeSingle();
      if (isRufflySmsSendingEnabled() && contact?.phone) {
        const sms = getSmsProvider();
        const sent = await sms.send({
          to: contact.phone,
          body: text,
          purpose: "transactional",
          idempotencyKey: `ruffly-inbox:${message.id}`.slice(0, 64),
          costMetadata: { category: "CLIENT_RUFFLY_REPLY", templateKey: "ruffly_inbox_reply" }
        });
        if (!sent.ok) {
          await supabase.from("ruffly_messages").delete().eq("id", message.id);
          return NextResponse.json({ error: sent.error || "SMS failed." }, { status: 502 });
        }
        await supabase
          .from("ruffly_messages")
          .update({ delivery_status: "sent", provider_message_id: sent.providerMessageId ?? null })
          .eq("id", message.id);
      }
    }

    await supabase
      .from("ruffly_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 240),
        status: "waiting_client",
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    return NextResponse.json({ message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
