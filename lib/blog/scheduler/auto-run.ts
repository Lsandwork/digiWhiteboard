import { getServiceSupabase } from "@/lib/supabase/server";
import {
  generateArticleFromTopic,
  getBlogSettings,
  publishBlogArticle,
  writeBlogAudit
} from "@/lib/blog/service";
import {
  nextHumanLikeSlot,
  remainingPostsThisWeek,
  schedulerSettingsFromRow,
  startOfLaWeek
} from "@/lib/blog/scheduler/human-like-seo";

/**
 * Full-auto mode C: pick best SEO topic → generate → schedule human-like slot → cron publishes.
 * Score gates still apply; emergency_off still blocks.
 */
export async function runFullAutoSeoCycle(actor = "cron") {
  const settings = await getBlogSettings();
  const settingsRow = settings as Record<string, unknown>;
  if (settings.emergency_off) {
    return { skipped: true, reason: "emergency_off" };
  }
  if (!settings.enabled && !settingsRow.full_auto_enabled) {
    // Allow full auto even if public blog flag lags — prefer explicit full_auto.
  }
  if (!settingsRow.full_auto_enabled && !settings.auto_publish_enabled) {
    return { skipped: true, reason: "full_auto_disabled" };
  }
  if (!settingsRow.full_auto_enabled) {
    return { skipped: true, reason: "full_auto_disabled" };
  }

  const supabase = getServiceSupabase();
  const sched = schedulerSettingsFromRow(settingsRow);
  const weekStart = startOfLaWeek();
  const weekStartIso = weekStart.toISOString();

  const { count: weekCount } = await supabase
    .from("blog_articles")
    .select("id", { count: "exact", head: true })
    .in("status", ["SCHEDULED", "PUBLISHED", "PUBLISHING"])
    .gte("scheduled_for", weekStartIso);

  // Also count published_at this week when scheduled_for null
  const { count: publishedWeek } = await supabase
    .from("blog_articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "PUBLISHED")
    .gte("published_at", weekStartIso);

  const used = Math.max(weekCount || 0, publishedWeek || 0);
  const remaining = remainingPostsThisWeek(used, Math.min(sched.postsPerWeek, Number(settings.max_articles_per_week || 7)));
  if (remaining <= 0) {
    return { skipped: true, reason: "weekly_cap", used, postsPerWeek: sched.postsPerWeek };
  }

  // Avoid stacking if something is already scheduled in the near future.
  const { count: upcoming } = await supabase
    .from("blog_articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "SCHEDULED")
    .gte("scheduled_for", new Date().toISOString());
  if ((upcoming || 0) >= 2) {
    return { skipped: true, reason: "enough_scheduled", upcoming };
  }

  const threshold = Number(settings.topic_score_threshold || 85);
  const { data: topics } = await supabase
    .from("blog_topics")
    .select("*")
    .in("status", ["scored", "approved"])
    .gte("topic_quality_score", threshold)
    .order("topic_quality_score", { ascending: false })
    .limit(25);

  const { data: recentArticles } = await supabase
    .from("blog_articles")
    .select("primary_keyword, published_at, scheduled_for")
    .in("status", ["PUBLISHED", "SCHEDULED"])
    .order("updated_at", { ascending: false })
    .limit(40);

  const recentKeywords = new Set(
    (recentArticles || [])
      .map((row) => String(row.primary_keyword || "").trim().toLowerCase())
      .filter(Boolean)
  );

  const topic = (topics || []).find((row) => {
    const kw = String(row.primary_keyword || "").trim().toLowerCase();
    if (kw && recentKeywords.has(kw)) return false;
    return true;
  });

  if (!topic) {
    return { skipped: true, reason: "no_eligible_topic" };
  }

  const article = await generateArticleFromTopic(String(topic.id), actor);
  const humanThreshold = Number(settings.human_score_threshold || 90);
  const score = Number(article.human_editorial_score || 0);
  if (score < humanThreshold || ["NEEDS_CHANGES", "FACT_CHECK"].includes(String(article.status))) {
    await writeBlogAudit(actor, "scheduler.held_for_quality", "article", String(article.id), {
      score,
      status: article.status
    });
    return {
      skipped: false,
      held: true,
      articleId: article.id,
      status: article.status,
      score
    };
  }

  const recentTimes = (recentArticles || [])
    .map((row) => row.scheduled_for || row.published_at)
    .filter(Boolean)
    .map((v) => new Date(String(v)));

  const slot = nextHumanLikeSlot(new Date(), sched, recentTimes, String(article.id));
  const nowIso = new Date().toISOString();
  await supabase
    .from("blog_articles")
    .update({
      status: "SCHEDULED",
      scheduled_for: slot.at.toISOString(),
      approved_by: actor,
      updated_at: nowIso
    })
    .eq("id", article.id);

  await supabase.from("blog_status_history").insert({
    article_id: article.id,
    from_status: article.status,
    to_status: "SCHEDULED",
    note: `Full-auto SEO slot: ${slot.label}`,
    actor
  });
  await writeBlogAudit(actor, "scheduler.auto_scheduled", "article", String(article.id), {
    slot: slot.label,
    topicId: topic.id
  });

  // If slot is already due (shouldn't), publish immediately when auto_publish on.
  if (slot.at.getTime() <= Date.now() + 60_000 && settings.auto_publish_enabled) {
    await publishBlogArticle(String(article.id), actor);
    return { skipped: false, articleId: article.id, publishedNow: true, slot: slot.label };
  }

  return {
    skipped: false,
    articleId: article.id,
    scheduledFor: slot.at.toISOString(),
    slot: slot.label,
    topicId: topic.id
  };
}

export async function retryFailedWordPressMirrors(limit = 3) {
  const settings = await getBlogSettings();
  if (!(settings as Record<string, unknown>).wordpress_mirror_enabled) {
    return { skipped: true, reason: "mirror_off" };
  }
  const supabase = getServiceSupabase();
  const { data: failed } = await supabase
    .from("blog_publish_attempts")
    .select("*")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(40);

  const rows = (failed || []).filter((row) => {
    const summary = row.request_summary as Record<string, unknown> | null;
    return summary?.provider === "wordpress" || summary?.destination === "wordpress" || summary?.mirror === true;
  });

  const { mirrorArticleToWordPress } = await import("@/lib/blog/publishing/wordpress-mirror");
  const results: Array<{ articleId: string; ok: boolean }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const articleId = String(row.article_id);
    if (seen.has(articleId)) continue;
    seen.add(articleId);
    if (results.length >= limit) break;
    try {
      const result = await mirrorArticleToWordPress(articleId, "cron-retry");
      results.push({ articleId, ok: result.ok });
    } catch {
      results.push({ articleId, ok: false });
    }
  }
  return { retried: results.length, results };
}
