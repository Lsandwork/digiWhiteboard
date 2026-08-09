import { getServiceSupabase } from "@/lib/supabase/server";
import { getBlogSettings } from "@/lib/blog/service";
import {
  recommendNextSlots,
  schedulerSettingsFromRow,
  startOfLaWeek
} from "@/lib/blog/scheduler/human-like-seo";
import { absoluteBlogUrl } from "@/lib/blog/site-url";
import { publicBlogHref } from "@/lib/blog/public-path";

export async function getPostingAnalytics() {
  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();
  const settingsRow = settings as Record<string, unknown>;
  const sched = schedulerSettingsFromRow(settingsRow);

  const { data: attempts } = await supabase
    .from("blog_publish_attempts")
    .select("id, article_id, status, published_url, error, request_summary, response_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: scheduled } = await supabase
    .from("blog_articles")
    .select("id, title, slug, scheduled_for, primary_keyword, status, social_package, seo_title")
    .eq("status", "SCHEDULED")
    .order("scheduled_for", { ascending: true })
    .limit(20);

  const { data: published } = await supabase
    .from("blog_articles")
    .select("id, title, slug, published_at, published_url, primary_keyword, provider_usage, social_package")
    .eq("status", "PUBLISHED")
    .order("published_at", { ascending: false })
    .limit(30);

  let socialPosts: Array<Record<string, unknown>> = [];
  let connections: Array<Record<string, unknown>> = [];
  try {
    const socialRes = await supabase
      .from("blog_social_posts")
      .select("id, platform, format, status, scheduled_for, posted_at, external_url, error, created_at")
      .order("created_at", { ascending: false })
      .limit(40);
    socialPosts = (socialRes.data || []) as Array<Record<string, unknown>>;
  } catch {
    socialPosts = [];
  }
  try {
    const connRes = await supabase
      .from("blog_social_connections")
      .select("platform, username, status, last_tested_at, last_error");
    connections = (connRes.data || []) as Array<Record<string, unknown>>;
  } catch {
    connections = [];
  }

  const weekStart = startOfLaWeek().toISOString();
  const { count: weekPublished } = await supabase
    .from("blog_articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "PUBLISHED")
    .gte("published_at", weekStart);

  const timeline = [
    ...(attempts || []).map((row) => {
      const summary = (row.request_summary || {}) as Record<string, unknown>;
      const provider = String(summary.provider || summary.destination || "native");
      return {
        kind: "blog_publish" as const,
        id: row.id,
        at: row.created_at,
        status: row.status,
        provider,
        url: row.published_url,
        error: row.error,
        articleId: row.article_id
      };
    }),
    ...(socialPosts || []).map((row) => ({
      kind: "social" as const,
      id: row.id,
      at: row.posted_at || row.created_at,
      status: row.status,
      provider: row.platform,
      url: row.external_url,
      error: row.error,
      format: row.format
    }))
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const channelHealth = buildChannelHealth(attempts || [], socialPosts || [], connections || []);

  const recentKeywords = (published || [])
    .map((row) => String(row.primary_keyword || "").trim())
    .filter(Boolean);
  const recentTimes = (published || [])
    .map((row) => row.published_at)
    .filter(Boolean)
    .map((v) => new Date(String(v)));
  const nextSlots = recommendNextSlots(5, sched, new Date(), recentTimes);

  const advice = buildAdvice({
    settingsRow,
    weekPublished: weekPublished || 0,
    postsPerWeek: sched.postsPerWeek,
    recentKeywords,
    scheduledCount: scheduled?.length || 0,
    channelHealth,
    wordpressConfigured: Boolean(
      process.env.WORDPRESS_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APPLICATION_PASSWORD
    )
  });

  const playbooks = (published || []).slice(0, 8).map((row) => {
    const social = (row.social_package || {}) as Record<string, unknown>;
    return {
      articleId: row.id,
      title: row.title,
      url: row.published_url || absoluteBlogUrl(publicBlogHref(String(row.slug))),
      keyword: row.primary_keyword,
      wordpressUrl: (row.provider_usage as Record<string, unknown> | null)?.wordpress_url || null,
      ctaTips: [
        "Add one internal link to a related Fitdog service page.",
        "Reply to the first 3 comments with a specific Santa Monica tip.",
        "Cut the hook into an Instagram Story sticker the same day."
      ],
      socialCutdowns: social
    };
  });

  // Persist a lightweight daily snapshot (best-effort).
  try {
    await supabase.from("blog_analytics_snapshots").insert({
      provider: "posting_analytics",
      metrics: {
        weekPublished: weekPublished || 0,
        scheduled: scheduled?.length || 0,
        attempts: attempts?.length || 0,
        fullAuto: Boolean(settingsRow.full_auto_enabled),
        wordpressMirror: Boolean(settingsRow.wordpress_mirror_enabled)
      }
    });
  } catch {
    // ignore
  }

  return {
    settings: {
      fullAutoEnabled: Boolean(settingsRow.full_auto_enabled),
      autoPublishEnabled: Boolean(settings.auto_publish_enabled),
      wordpressMirrorEnabled: Boolean(settingsRow.wordpress_mirror_enabled),
      postsPerWeek: sched.postsPerWeek,
      minHoursBetweenPosts: sched.minHoursBetweenPosts,
      emergencyOff: Boolean(settings.emergency_off),
      publishedCount: Number(settings.published_count || 0)
    },
    weekPublished: weekPublished || 0,
    nextScheduled: (scheduled || []).map((row) => ({
      id: row.id,
      title: row.title,
      scheduledFor: row.scheduled_for,
      keyword: row.primary_keyword,
      url: absoluteBlogUrl(publicBlogHref(String(row.slug)))
    })),
    nextAutoSlots: nextSlots.map((slot) => ({
      at: slot.at.toISOString(),
      label: slot.label,
      window: slot.window
    })),
    timeline: timeline.slice(0, 60),
    channelHealth,
    advice,
    playbooks,
    resources: [
      { label: "Public blog", href: absoluteBlogUrl("/blog") },
      { label: "Sitemap", href: absoluteBlogUrl("/blog/sitemap.xml") },
      { label: "RSS", href: absoluteBlogUrl("/blog/rss.xml") },
      { label: "How to use Blog Generator", href: "/admin/blog/help/how-to-use-blog-generator" },
      { label: "Publishing connections", href: "/admin/automatic-blog?page=publishing" },
      { label: "Social Media Generator", href: "/admin/automatic-blog?page=social-generator" },
      ...(process.env.WORDPRESS_URL
        ? [{ label: "WordPress admin", href: `${process.env.WORDPRESS_URL.replace(/\/$/, "")}/wp-admin` }]
        : [])
    ]
  };
}

function buildChannelHealth(
  attempts: Array<Record<string, unknown>>,
  socialPosts: Array<Record<string, unknown>>,
  connections: Array<Record<string, unknown>>
) {
  const channels: Record<
    string,
    { channel: string; success: number; failed: number; lastAt: string | null; lastUrl: string | null; status: string }
  > = {
    native: { channel: "native", success: 0, failed: 0, lastAt: null, lastUrl: null, status: "active" },
    wordpress: { channel: "wordpress", success: 0, failed: 0, lastAt: null, lastUrl: null, status: "configured" }
  };

  for (const row of attempts) {
    const summary = (row.request_summary || {}) as Record<string, unknown>;
    const provider = String(summary.provider || summary.destination || "native");
    if (!channels[provider]) {
      channels[provider] = {
        channel: provider,
        success: 0,
        failed: 0,
        lastAt: null,
        lastUrl: null,
        status: "active"
      };
    }
    if (row.status === "succeeded") channels[provider]!.success += 1;
    else channels[provider]!.failed += 1;
    if (!channels[provider]!.lastAt) {
      channels[provider]!.lastAt = String(row.created_at || "");
      channels[provider]!.lastUrl = row.published_url ? String(row.published_url) : null;
    }
  }

  for (const conn of connections) {
    const platform = String(conn.platform);
    channels[platform] = {
      channel: platform,
      success: socialPosts.filter((p) => p.platform === platform && p.status === "posted").length,
      failed: socialPosts.filter((p) => p.platform === platform && p.status === "failed").length,
      lastAt: conn.last_tested_at ? String(conn.last_tested_at) : null,
      lastUrl: null,
      status: String(conn.status || "disconnected")
    };
  }

  return Object.values(channels).map((row) => ({
    ...row,
    successRate:
      row.success + row.failed === 0 ? null : Math.round((row.success / (row.success + row.failed)) * 100)
  }));
}

function buildAdvice(input: {
  settingsRow: Record<string, unknown>;
  weekPublished: number;
  postsPerWeek: number;
  recentKeywords: string[];
  scheduledCount: number;
  channelHealth: Array<{ channel: string; status: string; failed: number }>;
  wordpressConfigured: boolean;
}) {
  const tips: string[] = [];
  if (input.weekPublished < input.postsPerWeek) {
    tips.push(
      `Cadence: ${input.weekPublished}/${input.postsPerWeek} posts this week — scheduler will fill human-like Tue–Thu slots first.`
    );
  } else {
    tips.push("Weekly cadence target met. Prefer quality over stuffing Friday/Saturday slots.");
  }
  if (input.scheduledCount === 0 && input.settingsRow.full_auto_enabled) {
    tips.push("No posts in the Scheduled queue — cron will pick the highest SEO topic next run.");
  }
  if (!input.wordpressConfigured && input.settingsRow.wordpress_mirror_enabled) {
    tips.push("WordPress mirror is ON but env credentials are missing — add WORDPRESS_* vars.");
  } else if (input.wordpressConfigured) {
    tips.push("WordPress is configured — each native publish can mirror with SEO meta + canonical back to Fitdog.");
  }
  const wp = input.channelHealth.find((c) => c.channel === "wordpress");
  if (wp && wp.failed > 0) {
    tips.push("WordPress has recent failures — check Publishing Connections and retry from cron.");
  }
  if (input.recentKeywords.length) {
    tips.push(
      `Keyword freshness: recently used “${input.recentKeywords.slice(0, 3).join("”, “")}” — scheduler will avoid duplicates.`
    );
  }
  tips.push(
    "SEO tip: publish in LA morning windows when possible, keep titles under ~60 chars, and link one related service page."
  );
  tips.push(
    "Social tip: same-day Instagram Story + Feed cut-down from Social Media Generator beats delayed cross-posts."
  );
  return tips;
}
