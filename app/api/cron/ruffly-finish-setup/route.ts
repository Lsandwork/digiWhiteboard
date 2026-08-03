import { NextResponse } from "next/server";
import { runGingrContactReconciliation } from "@/lib/integrations/gingr/sync/reconcile";
import { RUFFLY_STARTER_KNOWLEDGE_ARTICLES } from "@/lib/ruffly/knowledge/starter-articles";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const header = request.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!bearer) return false;
  const cron = process.env.CRON_SECRET?.trim();
  const finish = process.env.RUFFLY_FINISH_SETUP_TOKEN?.trim();
  return Boolean((cron && bearer === cron) || (finish && bearer === finish));
}

async function finishSetup() {
  const supabase = getServiceSupabase();
  const notes: string[] = [];

  // 1) Business profile + quiet hours + launch marker
  const { error: settingsError } = await supabase.from("ruffly_settings").upsert(
    {
      id: "default",
      business_name: "Fitdog Health & Social Club",
      consent_wording_version: "v1",
      review_request_delay_minutes: 120,
      quiet_hours: {
        start: "21:00",
        end: "08:00",
        timezone: "America/Los_Angeles"
      },
      sending_channels: {
        sms: true,
        email: false
      },
      webchat_enabled: true,
      ai_enabled: true,
      voice_enabled: false,
      campaigns_enabled: false,
      automations_enabled: false,
      setup_step: 20,
      setup_completed: true,
      updated_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );
  if (settingsError) throw settingsError;
  notes.push("settings: launched (setup_completed=true, step 20)");

  // 2) Starter knowledge articles
  const { data: existing, error: existingError } = await supabase
    .from("ruffly_knowledge_articles")
    .select("title")
    .in(
      "title",
      RUFFLY_STARTER_KNOWLEDGE_ARTICLES.map((article) => article.title)
    );
  if (existingError) throw existingError;
  const existingTitles = new Set((existing ?? []).map((row) => String(row.title)));
  const toInsert = RUFFLY_STARTER_KNOWLEDGE_ARTICLES.filter((article) => !existingTitles.has(article.title)).map(
    (article) => ({
      title: article.title,
      category: article.category,
      content: article.content,
      source: article.source,
      location: article.location ?? null,
      status: "published",
      audience: "customer",
      customer_visible: true,
      ai_enabled: true,
      effective_at: new Date().toISOString()
    })
  );
  if (toInsert.length) {
    const { error: insertError } = await supabase.from("ruffly_knowledge_articles").insert(toInsert);
    if (insertError) throw insertError;
  }
  notes.push(`knowledge: inserted ${toInsert.length}, already present ${existingTitles.size}`);

  // 3) Contact sync from Gingr
  let reconcile: unknown = null;
  try {
    reconcile = await runGingrContactReconciliation();
    notes.push("gingr: contact reconciliation ran");
  } catch (error) {
    notes.push(`gingr: reconcile failed (${error instanceof Error ? error.message : "unknown"})`);
  }

  return { ok: true, notes, reconcile };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await finishSetup());
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Finish setup failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
