import { NextResponse } from "next/server";
import { requireBlogPermission } from "@/lib/blog/api-auth";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const statuses = searchParams.get("statuses");
  const id = searchParams.get("id");
  const supabase = getServiceSupabase();

  if (id) {
    const { data, error } = await supabase.from("blog_articles").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: runs } = await supabase
      .from("blog_agent_runs")
      .select("*")
      .eq("article_id", id)
      .order("created_at", { ascending: true });
    const { data: history } = await supabase
      .from("blog_status_history")
      .select("*")
      .eq("article_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ ok: true, article: data, agentRuns: runs || [], history: history || [] });
  }

  let query = supabase
    .from("blog_articles")
    .select(
      "id, title, slug, status, human_editorial_score, topic_quality_score, natural_voice_score, empathy_score, scheduled_for, published_at, published_url, updated_at, author_profile, primary_keyword"
    )
    .order("updated_at", { ascending: false })
    .limit(150);
  if (status) query = query.eq("status", status);
  if (statuses) query = query.in("status", statuses.split(",").map((s) => s.trim()).filter(Boolean));
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, articles: data || [] });
}
