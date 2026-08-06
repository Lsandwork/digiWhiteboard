import { NextResponse } from "next/server";
import { blogActor, requireBlogPermission } from "@/lib/blog/api-auth";
import { getBlogSettings, writeBlogAudit } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBlogPermission(request, "blog.view");
  if (!auth.ok) return auth.response;
  const settings = await getBlogSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const auth = await requireBlogPermission(request, "blog.manage_automation");
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = getServiceSupabase();
  const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of [
    "enabled",
    "auto_publish_enabled",
    "emergency_off",
    "human_score_threshold",
    "topic_score_threshold",
    "manual_approval_first_n",
    "ai_images_enabled",
    "max_cost_per_article_cents",
    "daily_cost_limit_cents",
    "weekly_cost_limit_cents",
    "monthly_cost_limit_cents",
    "max_articles_per_week",
    "primary_provider",
    "evaluator_provider",
    "publish_provider",
    "public_ai_disclosure",
    "brand_voice",
    "editorial_rules",
    "voice_sliders",
    "provider_config",
    "setup_step",
    "setup_completed"
  ]) {
    if (key in body) allowed[key] = body[key];
  }
  // Safety: never silently enable auto-publish without explicit true.
  if ("auto_publish_enabled" in allowed && allowed.auto_publish_enabled !== true) {
    allowed.auto_publish_enabled = false;
  }
  const { data, error } = await supabase.from("blog_settings").update(allowed).eq("id", "default").select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeBlogAudit(blogActor(auth.session, auth.role), "settings.updated", "settings", "default", allowed);
  return NextResponse.json({ ok: true, settings: data });
}
