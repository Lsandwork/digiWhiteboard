import { NextResponse } from "next/server";
import { requireRufflyPermission } from "@/lib/ruffly/api-auth";
import { RUFFLY_STARTER_KNOWLEDGE_ARTICLES } from "@/lib/ruffly/knowledge/starter-articles";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.knowledge.manage");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ruffly_knowledge_articles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ articles: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load articles.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json({
        articles: [],
        warning: "Ruffly tables not migrated yet. Run supabase migration 044_ruffly_core.sql."
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRufflyPermission(request, "ruffly.knowledge.manage");
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = String(body.action || "create");
  const supabase = getServiceSupabase();

  try {
    if (action === "seed_starter") {
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

      if (!toInsert.length) {
        const { data: articles } = await supabase
          .from("ruffly_knowledge_articles")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);
        return NextResponse.json({
          ok: true,
          inserted: 0,
          skipped: RUFFLY_STARTER_KNOWLEDGE_ARTICLES.length,
          message: "Starter Fitdog articles already exist.",
          articles: articles ?? []
        });
      }

      const { data: inserted, error } = await supabase.from("ruffly_knowledge_articles").insert(toInsert).select("*");
      if (error) throw error;

      const { data: articles } = await supabase
        .from("ruffly_knowledge_articles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      return NextResponse.json({
        ok: true,
        inserted: inserted?.length ?? toInsert.length,
        skipped: existingTitles.size,
        message: `Imported ${inserted?.length ?? toInsert.length} published customer-visible Fitdog articles.`,
        articles: articles ?? []
      });
    }

    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const category = String(body.category || "General").trim() || "General";
    if (!title || !content) {
      return NextResponse.json({ error: "Title and content are required." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ruffly_knowledge_articles")
      .insert({
        title,
        content,
        category,
        source: body.source ? String(body.source) : null,
        location: body.location ? String(body.location) : null,
        status: body.status === "draft" ? "draft" : "published",
        audience: "customer",
        customer_visible: true,
        ai_enabled: body.ai_enabled === false ? false : true,
        effective_at: new Date().toISOString()
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, article: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save articles.";
    if (message.includes("does not exist") || message.includes("schema cache")) {
      return NextResponse.json(
        { error: "Ruffly tables not migrated yet. Run supabase migration 044_ruffly_core.sql." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
