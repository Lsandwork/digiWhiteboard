import { NextResponse } from "next/server";
import { verifyNewsletterUnsubscribeToken } from "@/lib/blog/newsletter-unsubscribe";
import { writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const recentByIp = new Map<string, number>();

function rateLimited(ip: string) {
  const now = Date.now();
  const last = recentByIp.get(ip) || 0;
  if (now - last < 5_000) return true;
  recentByIp.set(ip, now);
  return false;
}

async function unsubscribeEmail(email: string) {
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
}

/**
 * Unsubscribe requires a signed token (from the confirmation / future marketing emails).
 * Email-only unsubscribe is rejected so anyone cannot unsubscribe arbitrary addresses.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string; token?: string };
  const tokenEmail = verifyNewsletterUnsubscribeToken(body.token);
  if (!tokenEmail) {
    return NextResponse.json(
      { error: "Use the unsubscribe link from your Fitdog email, or reply STOP to a tips message." },
      { status: 400 }
    );
  }

  const claimed = String(body.email || "")
    .trim()
    .toLowerCase();
  if (claimed && claimed !== tokenEmail) {
    return NextResponse.json({ error: "Unsubscribe link does not match that email." }, { status: 400 });
  }

  try {
    await unsubscribeEmail(tokenEmail);
    return NextResponse.json({ ok: true, message: "You have been unsubscribed." });
  } catch {
    return NextResponse.json(
      { error: "Unable to update subscription right now. Email contact@fitdog.com for help." },
      { status: 503 }
    );
  }
}

/** One-click unsubscribe from email links (`?token=`). */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Please wait a moment before trying again." }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token");
  const tokenEmail = verifyNewsletterUnsubscribeToken(token);
  if (!tokenEmail) {
    return NextResponse.json(
      { error: "Use the unsubscribe link from your Fitdog email, or reply STOP to a tips message." },
      { status: 400 }
    );
  }

  try {
    await unsubscribeEmail(tokenEmail);
    return NextResponse.json({ ok: true, message: "You have been unsubscribed." });
  } catch {
    return NextResponse.json(
      { error: "Unable to update subscription right now. Email contact@fitdog.com for help." },
      { status: 503 }
    );
  }
}
