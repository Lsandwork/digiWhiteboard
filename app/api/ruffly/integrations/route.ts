import { NextResponse } from "next/server";
import { createGingrClient } from "@/lib/integrations/gingr/client";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IntegrationKind = "live" | "planned";

function card(input: {
  provider: string;
  displayName: string;
  configured: boolean;
  kind?: IntegrationKind;
  note?: string;
  test?: { ok: boolean; message: string };
  row?: Record<string, unknown> | null;
}) {
  const kind = input.kind ?? "live";
  const status =
    input.row?.status ||
    (kind === "planned" ? "coming_soon" : input.configured ? "connected" : "setup_required");
  return {
    provider: input.provider,
    displayName: input.displayName,
    status,
    configured: input.configured,
    kind,
    note: input.note ?? null,
    lastSuccessAt: input.row?.last_success_at ?? null,
    lastError: input.row?.last_error ?? null,
    test: input.test ?? null
  };
}

const PLANNED: Record<string, { displayName: string; note: string }> = {
  google_business: {
    displayName: "Google Business Profile",
    note: "Not built yet. Review-request links already use RUFFLY_GOOGLE_REVIEW_URL. Full GBP sync/reply needs Google Business API + OAuth."
  },
  facebook: {
    displayName: "Facebook",
    note: "Not built yet. Review-request links already use RUFFLY_FACEBOOK_REVIEW_URL. Page messaging/posts need a Meta app + Page admin access."
  },
  instagram: {
    displayName: "Instagram",
    note: "Not built yet. Needs Meta Instagram Business login + Graph API before DMs/comments can land in Ruffly."
  },
  whatsapp: {
    displayName: "WhatsApp",
    note: "Not built yet. Needs WhatsApp Business / Meta Cloud API (or Twilio WhatsApp) before chats can land in Ruffly."
  },
  voice: {
    displayName: "AI Voice / Receptionist",
    note: "Not built yet. Gemini is connected for text AI; phone receptionist needs a voice provider + phone number wiring."
  }
};

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.integrations.manage");
  if (!auth.ok) return auth.response;

  const sms = getSmsProvider();
  const email = getEmailProvider();
  const gingrConfigured = Boolean(process.env.GINGR_API_KEY?.trim());
  const googleReviewUrl = Boolean(process.env.RUFFLY_GOOGLE_REVIEW_URL?.trim());
  const facebookReviewUrl = Boolean(process.env.RUFFLY_FACEBOOK_REVIEW_URL?.trim());

  let rows: Record<string, Record<string, unknown>> = {};
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase.from("ruffly_provider_connections").select("*");
    for (const row of data || []) rows[String(row.provider)] = row;
  } catch {
    rows = {};
  }

  return NextResponse.json({
    integrations: [
      card({
        provider: "gingr",
        displayName: "Gingr",
        configured: gingrConfigured,
        row: rows.gingr
      }),
      card({
        provider: "twilio",
        displayName: sms.displayName,
        configured: sms.isConfigured(),
        row: rows.twilio
      }),
      card({
        provider: "resend",
        displayName: email.displayName,
        configured: email.isConfigured(),
        row: rows.resend
      }),
      card({
        provider: "gemini",
        displayName: "Gemini AI",
        configured: Boolean(process.env.GEMINI_API_KEY?.trim()),
        row: rows.gemini
      }),
      card({
        provider: "google_business",
        displayName: PLANNED.google_business.displayName,
        configured: false,
        kind: "planned",
        note:
          PLANNED.google_business.note +
          (googleReviewUrl ? " Review URL is already set in Vercel." : " Review URL is not set yet."),
        row: rows.google_business
      }),
      card({
        provider: "facebook",
        displayName: PLANNED.facebook.displayName,
        configured: false,
        kind: "planned",
        note:
          PLANNED.facebook.note +
          (facebookReviewUrl ? " Review URL is already set in Vercel." : " Review URL is not set yet."),
        row: rows.facebook
      }),
      card({
        provider: "instagram",
        displayName: PLANNED.instagram.displayName,
        configured: false,
        kind: "planned",
        note: PLANNED.instagram.note,
        row: rows.instagram
      }),
      card({
        provider: "whatsapp",
        displayName: PLANNED.whatsapp.displayName,
        configured: false,
        kind: "planned",
        note: PLANNED.whatsapp.note,
        row: rows.whatsapp
      }),
      card({
        provider: "voice",
        displayName: PLANNED.voice.displayName,
        configured: false,
        kind: "planned",
        note: PLANNED.voice.note,
        row: rows.voice
      })
    ]
  });
}

export async function POST(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.integrations.manage");
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as { action?: string; provider?: string };
  const provider = String(body.provider || "");
  const action = String(body.action || "test");

  if (action !== "test") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  if (provider === "gingr") {
    const result = await createGingrClient().testConnection();
    return NextResponse.json(result);
  }
  if (provider === "twilio") {
    return NextResponse.json(await getSmsProvider().testConnection());
  }
  if (provider === "resend") {
    return NextResponse.json(await getEmailProvider().testConnection());
  }
  if (provider === "gemini") {
    const ok = Boolean(process.env.GEMINI_API_KEY?.trim());
    return NextResponse.json({
      ok,
      message: ok ? "GEMINI_API_KEY present." : "Setup Required: set GEMINI_API_KEY."
    });
  }

  const planned = PLANNED[provider];
  if (planned) {
    return NextResponse.json({
      ok: false,
      message: `${planned.displayName} is not connected in code yet — this is not a missing-password issue. ${planned.note}`
    });
  }

  return NextResponse.json({
    ok: false,
    message: "Unknown provider."
  });
}
