import { NextResponse } from "next/server";
import { AI_DISCLOSURE, detectHandoffSignals, shouldHandoffToStaff } from "@/lib/ruffly/ai/guardrails";
import { isRufflyWebchatEnabled } from "@/lib/ruffly/flags";
import { getServiceSupabase } from "@/lib/supabase/server";
import { hashToken, newOpaqueToken } from "@/lib/ruffly/tokens/signed-token";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = (process.env.RUFFLY_WEBCHAT_ALLOWED_ORIGINS || "https://fitdog.com,https://www.fitdog.com,https://ruffly.ruffops.com")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, "").toLowerCase())
  .filter(Boolean);

const SITE_KEY = process.env.RUFFLY_WEBCHAT_SITE_KEY?.trim() || "";

const recentHits = new Map<string, { count: number; resetAt: number }>();

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "").toLowerCase();
}

function rateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const current = recentHits.get(key);
  if (!current || current.resetAt <= now) {
    recentHits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

export async function POST(request: Request) {
  if (!isRufflyWebchatEnabled()) {
    if (process.env.RUFFLY_WEBCHAT_DEV_BYPASS === "true" && process.env.NODE_ENV !== "production") {
      // allow local bypass
    } else {
      return NextResponse.json({ error: "Web chat is not enabled." }, { status: 403 });
    }
  }

  const body = (await request.json()) as {
    message?: string;
    siteKey?: string;
    origin?: string;
    visitorToken?: string;
    name?: string;
    dogName?: string;
  };

  if (SITE_KEY && String(body.siteKey || "") !== SITE_KEY) {
    return NextResponse.json({ error: "Invalid site key." }, { status: 403 });
  }

  const origin = normalizeOrigin(String(body.origin || request.headers.get("origin") || ""));
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return NextResponse.json({ error: "Origin not allowlisted." }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`${origin}:${ip}`)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });

  const signals = detectHandoffSignals(message);
  const handoff = shouldHandoffToStaff({ ...signals, lacksVerifiedInfo: false });

  const supabase = getServiceSupabase();
  const visitorRaw = body.visitorToken || newOpaqueToken();
  const visitorHash = hashToken(visitorRaw);

  let conversationId: string | null = null;
  try {
    const { data: visitor } = await supabase
      .from("ruffly_webchat_visitors")
      .select("id, conversation_id")
      .eq("visitor_token_hash", visitorHash)
      .maybeSingle();

    conversationId = visitor?.conversation_id ?? null;
    if (!conversationId) {
      const { data: conversation } = await supabase
        .from("ruffly_conversations")
        .insert({
          channel: "webchat",
          status: handoff.handoff ? "waiting_staff" : "open",
          is_lead: true,
          ai_active: !handoff.handoff,
          last_message_preview: message.slice(0, 240),
          last_message_at: new Date().toISOString(),
          metadata: { name: body.name ?? null, dogName: body.dogName ?? null, origin }
        })
        .select("id")
        .single();
      conversationId = conversation?.id ?? null;

      await supabase.from("ruffly_webchat_visitors").upsert({
        visitor_token_hash: visitorHash,
        conversation_id: conversationId,
        domain: origin,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        last_seen_at: new Date().toISOString()
      });

      await supabase.from("ruffly_leads").insert({
        conversation_id: conversationId,
        lead_type: "general_inquiry",
        stage: handoff.handoff ? "needs_follow_up" : "ai_responded",
        source: "webchat",
        original_message: message,
        priority: handoff.handoff ? "high" : "normal"
      });
    }

    if (conversationId) {
      await supabase.from("ruffly_messages").insert({
        conversation_id: conversationId,
        direction: "inbound",
        channel: "webchat",
        body: message
      });
    }
  } catch {
    // Tables may not exist yet — still return a safe reply.
  }

  if (handoff.handoff) {
    return NextResponse.json({
      reply: "I’m connecting you with a Fitdog team member who can help with that. Someone will follow up shortly.",
      handoff: true,
      reason: handoff.reason,
      visitorToken: visitorRaw,
      disclosure: AI_DISCLOSURE
    });
  }

  return NextResponse.json({
    reply:
      "Thanks for reaching out! I can share approved Fitdog info from our knowledge base once articles are published. Leave your name and dog’s name and our team will follow up.",
    handoff: false,
    visitorToken: visitorRaw,
    disclosure: AI_DISCLOSURE
  });
}
