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
    "full_auto_enabled",
    "wordpress_mirror_enabled",
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
    "posts_per_week",
    "min_hours_between_posts",
    "schedule_jitter_min_minutes",
    "schedule_jitter_max_minutes",
    "quiet_hours_start",
    "quiet_hours_end",
    "scheduler_timezone",
    "automation_config",
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
  // Booleans must be explicit true to enable.
  for (const flag of ["auto_publish_enabled", "full_auto_enabled", "wordpress_mirror_enabled"] as const) {
    if (flag in allowed && allowed[flag] !== true) allowed[flag] = false;
  }
  // Real photography only — AI-generated images look fake and are never enabled.
  if ("ai_images_enabled" in allowed && allowed.ai_images_enabled === true) {
    return NextResponse.json(
      {
        error:
          "AI-generated images are disabled for Fitdog blog and social. Use Digi Board Bulk Photo Upload photos or licensed web photography."
      },
      { status: 400 }
    );
  }
  allowed.ai_images_enabled = false;
  const { data, error } = await supabase.from("blog_settings").update(allowed).eq("id", "default").select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeBlogAudit(blogActor(auth.session, auth.role), "settings.updated", "settings", "default", allowed);
  return NextResponse.json({ ok: true, settings: data });
}
