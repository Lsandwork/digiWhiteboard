import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const recentByIp = new Map<string, number>();

function rateLimited(ip: string) {
  const now = Date.now();
  const last = recentByIp.get(ip) || 0;
  if (now - last < 15_000) return true;
  recentByIp.set(ip, now);
  return false;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    consent?: boolean;
    website?: string; // honeypot
  };

  if (body.website) {
    return NextResponse.json({ ok: true, message: "Thanks!" });
  }

  const email = String(body.email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!body.consent) {
    return NextResponse.json({ error: "Consent is required to subscribe." }, { status: 400 });
  }

  let stored = false;
  let duplicate = false;
  try {
    const supabase = getServiceSupabase();
    const { data: existing } = await supabase.from("blog_subscribers").select("id, status").eq("email", email).maybeSingle();
    if (existing?.id) {
      duplicate = true;
      if (existing.status !== "active") {
        await supabase
          .from("blog_subscribers")
          .update({ status: "active", consent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
      stored = true;
    } else {
      const { error } = await supabase.from("blog_subscribers").insert({
        email,
        status: "active",
        source: "blog_public",
        consent_at: new Date().toISOString(),
        sync_status: "pending"
      });
      if (error) throw error;
      stored = true;
    }
  } catch {
    // table may not exist yet — still try email provider / report honest state
    stored = false;
  }

  const provider = getEmailProvider();
  let emailed = false;
  if (provider.isConfigured()) {
    const result = await provider.send({
      to: email,
      purpose: "marketing",
      subject: "You're on the Fitdog tips list",
      html: "<p>Thanks for subscribing to Fitdog dog-care tips. You can unsubscribe anytime by replying STOP or using the unsubscribe link in future emails.</p>",
      text: "Thanks for subscribing to Fitdog dog-care tips."
    });
    emailed = result.ok;
  }

  await writeBlogAudit(null, "newsletter.subscribe", "subscriber", email, {
    stored,
    duplicate,
    emailed,
    providerConfigured: provider.isConfigured()
  });

  if (!stored && !provider.isConfigured()) {
    return NextResponse.json(
      {
        error:
          "Newsletter storage is not ready yet. Ask Fitdog staff to apply the blog subscribers migration, or configure the email provider."
      },
      { status: 503 }
    );
  }

  if (duplicate) {
    return NextResponse.json({
      ok: true,
      message: "You are already on the list. We kept your subscription active."
    });
  }

  return NextResponse.json({
    ok: true,
    message: emailed
      ? "Thanks — check your inbox for a confirmation note."
      : "Thanks — your subscription was saved and will sync when email delivery is configured."
  });
}
