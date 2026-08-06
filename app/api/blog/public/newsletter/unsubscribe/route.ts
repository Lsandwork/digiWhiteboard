import { NextResponse } from "next/server";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("blog_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("email", email);
    if (error) throw error;
    await writeBlogAudit(null, "newsletter.unsubscribe", "subscriber", email, {});
    return NextResponse.json({ ok: true, message: "You have been unsubscribed." });
  } catch {
    return NextResponse.json(
      { error: "Unable to update subscription right now. Email contact@fitdog.com for help." },
      { status: 503 }
    );
  }
}
