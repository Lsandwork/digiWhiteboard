import { NextResponse } from "next/server";
import { createGingrClient } from "@/lib/integrations/gingr/client";
import { getEmailProvider } from "@/lib/integrations/email/provider";
import { getSmsProvider } from "@/lib/integrations/sms/provider";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function card(
  provider: string,
  displayName: string,
  configured: boolean,
  test?: { ok: boolean; message: string },
  row?: Record<string, unknown> | null
) {
  return {
    provider,
    displayName,
    status: row?.status || (configured ? "connected" : "setup_required"),
    configured,
    lastSuccessAt: row?.last_success_at ?? null,
    lastError: row?.last_error ?? null,
    test: test ?? null
  };
}

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.integrations.manage");
  if (!auth.ok) return auth.response;

  const sms = getSmsProvider();
  const email = getEmailProvider();
  const gingrConfigured = Boolean(process.env.GINGR_API_KEY?.trim());

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
      card("gingr", "Gingr", gingrConfigured, undefined, rows.gingr),
      card("twilio", sms.displayName, sms.isConfigured(), undefined, rows.twilio),
      card("resend", email.displayName, email.isConfigured(), undefined, rows.resend),
      card("gemini", "Gemini AI", Boolean(process.env.GEMINI_API_KEY?.trim()), undefined, rows.gemini),
      card("google_business", "Google Business Profile", false, undefined, rows.google_business),
      card("facebook", "Facebook", false, undefined, rows.facebook),
      card("instagram", "Instagram", false, undefined, rows.instagram),
      card("whatsapp", "WhatsApp", false, undefined, rows.whatsapp),
      card("voice", "AI Voice / Receptionist", false, undefined, rows.voice)
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

  return NextResponse.json({
    ok: false,
    message: "Setup Required: this provider adapter is ready but credentials are not configured."
  });
}
