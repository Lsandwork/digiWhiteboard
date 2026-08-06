import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.inbox.view");
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const supabase = getServiceSupabase();
    let query = supabase
      .from("ruffly_conversations")
      .select("*, contact:ruffly_contacts(id, first_name, last_name, preferred_name, phone, email, is_vip)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    // "open" means needs staff attention (includes inbound SMS waiting_staff).
    if (status === "open") {
      query = query.in("status", ["open", "waiting_staff"]);
    } else if (status && status !== "all") {
      query = query.eq("status", status);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load inbox.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({ conversations: [], warning: "Ruffly tables not migrated yet." });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.inbox.reply");
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supabase = getServiceSupabase();
    const { data: conversation, error } = await supabase
      .from("ruffly_conversations")
      .insert({
        contact_id: body.contact_id ?? null,
        channel: body.channel ?? "manual",
        status: "open",
        subject: body.subject ?? null,
        last_message_preview: body.body ?? "",
        last_message_at: new Date().toISOString(),
        assigned_employee_id: auth.session?.adminUserId ?? null
      })
      .select("*")
      .single();
    if (error) throw error;

    if (body.body) {
      await supabase.from("ruffly_messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        channel: body.channel ?? "manual",
        body: String(body.body),
        sender_admin_id: auth.session?.adminUserId ?? null
      });
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
