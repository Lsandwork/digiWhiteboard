import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { createTopicFromInput, seedBlogTopics } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;
  const supabase = getServiceSupabase();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  let query = supabase.from("blog_topics").select("*").order("topic_quality_score", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, topics: data || [] });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.action === "seed") {
    const auth = await requireBlogPermission(request, "blog.create");
    if (!auth.ok) return auth.response;
    const result = await seedBlogTopics(blogActor(auth.session, auth.role));
    return NextResponse.json({ ok: true, ...result });
  }

  const auth = await requireBlogPermission(request, "blog.submit_idea");
  if (!auth.ok) return auth.response;
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  try {
    const result = await createTopicFromInput({
      title,
      readerConcern: String(body.readerConcern || ""),
      primaryTakeaway: String(body.primaryTakeaway || ""),
      angle: String(body.angle || ""),
      pillarSlug: body.pillarSlug ? String(body.pillarSlug) : undefined,
      tonePreset: body.tonePreset ? String(body.tonePreset) : undefined,
      localRelevance: body.localRelevance ? String(body.localRelevance) : undefined,
      createdBy: blogActor(auth.session, auth.role)
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create topic." },
      { status: 500 }
    );
  }
}
