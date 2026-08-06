import { getServiceSupabase } from "@/lib/supabase/server";
import { getBlogSettings } from "@/lib/blog/service";
import { absoluteBlogUrl, publicBlogHref } from "@/lib/blog/site-url";

export type DashboardRange = "7d" | "30d" | "90d" | "year";

const DRAFT_STATUSES = [
  "DRAFTING",
  "EDITING",
  "PRACTICAL_REVIEW",
  "EMPATHY_REVIEW",
  "NATURAL_VOICE_REVIEW",
  "SEO_REVIEW",
  "NEEDS_CHANGES",
  "IMAGE_SELECTION",
  "IMAGE_REVIEW",
  "FACT_CHECK",
  "BRAND_REVIEW",
  "BRIEF_READY",
  "RESEARCHING",
  "OUTLINING"
];

function rangeStart(range: DashboardRange) {
  const now = Date.now();
  if (range === "7d") return new Date(now - 7 * 86400000);
  if (range === "90d") return new Date(now - 90 * 86400000);
  if (range === "year") {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1);
  }
  return new Date(now - 30 * 86400000);
}

function previousRange(range: DashboardRange, currentStart: Date) {
  const now = new Date();
  const ms = now.getTime() - currentStart.getTime();
  return new Date(currentStart.getTime() - ms);
}

async function countArticles(statuses: string[], gte?: string, lt?: string) {
  const supabase = getServiceSupabase();
  let query = supabase.from("blog_articles").select("id", { count: "exact", head: true }).in("status", statuses);
  if (gte) query = query.gte("published_at", gte);
  if (lt) query = query.lt("published_at", lt);
  const { count } = await query;
  return count || 0;
}

async function countByStatus(status: string) {
  const supabase = getServiceSupabase();
  const { count } = await supabase.from("blog_articles").select("id", { count: "exact", head: true }).eq("status", status);
  return count || 0;
}

export async function getBlogDashboardData(range: DashboardRange = "30d") {
  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();
  const start = rangeStart(range);
  const prevStart = previousRange(range, start);
  const startIso = start.toISOString();
  const prevStartIso = prevStart.toISOString();
  const nowIso = new Date().toISOString();

  const [
    publishedInRange,
    publishedPrev,
    publishedTotal,
    draftCount,
    humanReview,
    approved,
    scheduled,
    failed,
    topicIdeas,
    subscriberCount,
    subscribersInRange,
    subscribersPrev,
    recentArticles,
    upcoming,
    pipelineTopics,
    pipelineDrafts,
    pipelineReview,
    pipelineApproved,
    pipelineScheduled,
    activity,
    categoryRows,
    aiJobs,
    recentSubscribers
  ] = await Promise.all([
    countArticles(["PUBLISHED"], startIso),
    countArticles(["PUBLISHED"], prevStartIso, startIso),
    countByStatus("PUBLISHED"),
    countArticles(DRAFT_STATUSES),
    countByStatus("HUMAN_REVIEW"),
    countByStatus("APPROVED"),
    countByStatus("SCHEDULED"),
    countByStatus("FAILED"),
    (async () => {
      const { count } = await supabase
        .from("blog_topics")
        .select("id", { count: "exact", head: true })
        .in("status", ["idea", "scored", "approved"]);
      return count || 0;
    })(),
    (async () => {
      const { count } = await supabase
        .from("blog_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      return count || 0;
    })(),
    (async () => {
      const { count } = await supabase
        .from("blog_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", startIso);
      return count || 0;
    })(),
    (async () => {
      const { count } = await supabase
        .from("blog_subscribers")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", prevStartIso)
        .lt("created_at", startIso);
      return count || 0;
    })(),
    supabase
      .from("blog_articles")
      .select(
        "id, title, slug, status, published_at, updated_at, reading_minutes, cover_image_path, cover_alt, category_slug, human_editorial_score, scheduled_for, published_url"
      )
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .limit(8),
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, scheduled_for, updated_at, cover_image_path, reading_minutes")
      .in("status", ["SCHEDULED", "APPROVED", "DRAFTING", "HUMAN_REVIEW"])
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .limit(8),
    supabase
      .from("blog_topics")
      .select("id, title, status, updated_at, topic_quality_score")
      .in("status", ["idea", "scored", "approved"])
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, updated_at, cover_image_path, human_editorial_score")
      .in("status", DRAFT_STATUSES)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, updated_at, cover_image_path, human_editorial_score, fact_check_status")
      .eq("status", "HUMAN_REVIEW")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, updated_at, cover_image_path, human_editorial_score, fact_check_status")
      .eq("status", "APPROVED")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, scheduled_for, updated_at, cover_image_path")
      .eq("status", "SCHEDULED")
      .order("scheduled_for", { ascending: true })
      .limit(6),
    supabase
      .from("blog_audit_logs")
      .select("id, actor, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("blog_articles").select("category_slug, status").eq("status", "PUBLISHED"),
    supabase
      .from("blog_generation_jobs")
      .select("id, job_type, status, created_at, error")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("blog_subscribers")
      .select("id, email, status, created_at, consent_at")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(8)
  ]);

  const publishedDelta =
    publishedPrev === 0
      ? publishedInRange > 0
        ? 100
        : 0
      : Math.round(((publishedInRange - publishedPrev) / publishedPrev) * 100);

  const subscriberDelta =
    subscribersPrev === 0
      ? subscribersInRange > 0
        ? 100
        : 0
      : Math.round(((subscribersInRange - subscribersPrev) / subscribersPrev) * 100);

  const categoryMap = new Map<string, number>();
  for (const row of categoryRows.data || []) {
    const key = String(row.category_slug || "other");
    categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
  }
  const categoryTotal = [...categoryMap.values()].reduce((a, b) => a + b, 0) || 0;
  const categories = [...categoryMap.entries()]
    .map(([slug, count]) => ({
      slug,
      label: slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      count,
      percent: categoryTotal ? Math.round((count / categoryTotal) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const lowScoreArticles = (pipelineDrafts.data || [])
    .filter((row) => Number(row.human_editorial_score || 0) > 0 && Number(row.human_editorial_score) < Number(settings.human_score_threshold || 90))
    .slice(0, 3);

  const insights = [
    topicIdeas > 0
      ? {
          id: "topics",
          text: `${topicIdeas} topic idea${topicIdeas === 1 ? "" : "s"} ready for review or generation`,
          tone: "info" as const
        }
      : null,
    humanReview > 0
      ? {
          id: "review",
          text: `${humanReview} article${humanReview === 1 ? "" : "s"} waiting in Human Review`,
          tone: "warn" as const
        }
      : null,
    lowScoreArticles.length
      ? {
          id: "quality",
          text: `${lowScoreArticles.length} draft${lowScoreArticles.length === 1 ? "" : "s"} below the human-quality threshold`,
          tone: "warn" as const
        }
      : null,
    failed > 0
      ? {
          id: "failed",
          text: `${failed} article${failed === 1 ? "" : "s"} in Failed status need attention`,
          tone: "danger" as const
        }
      : null
  ].filter(Boolean);

  return {
    range,
    publicBlogUrl: absoluteBlogUrl(publicBlogHref()),
    settings: {
      enabled: Boolean(settings.enabled),
      autoPublish: Boolean(settings.auto_publish_enabled),
      emergencyOff: Boolean(settings.emergency_off),
      humanScoreThreshold: Number(settings.human_score_threshold || 90),
      aiImagesEnabled: Boolean(settings.ai_images_enabled)
    },
    kpis: {
      articlesPublished: {
        value: publishedInRange,
        total: publishedTotal,
        deltaPercent: publishedDelta,
        available: true,
        label: "Articles Published"
      },
      totalViews: {
        value: null,
        available: false,
        reason: "Analytics not connected",
        label: "Total Views"
      },
      engagementRate: {
        value: null,
        available: false,
        reason: "Engagement tracking not connected",
        label: "Avg. Engagement Rate"
      },
      avgReadTime: {
        value: null,
        available: false,
        reason: "Measured read time not connected",
        label: "Avg. Read Time"
      },
      newsletterSubs: {
        value: subscriberCount,
        newInRange: subscribersInRange,
        deltaPercent: subscriberDelta,
        available: true,
        label: "Newsletter Subs"
      }
    },
    performance: {
      available: false,
      reason: "Pageview analytics are not connected yet. Publish counts and editorial queues are live.",
      series: [] as Array<{ date: string; views: number }>,
      summary: {
        views: null,
        visitors: null,
        uniqueVisitors: null,
        bounceRate: null,
        shares: null,
        saves: null
      }
    },
    topArticles: (recentArticles.data || []).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      slug: String(row.slug || ""),
      publishedAt: row.published_at ? String(row.published_at) : null,
      readingMinutes: Number(row.reading_minutes || 0) || null,
      coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
      coverAlt: row.cover_alt ? String(row.cover_alt) : String(row.title),
      views: null as number | null,
      href: `/admin/automatic-blog?page=editor&id=${row.id}`,
      publicHref: row.slug ? absoluteBlogUrl(publicBlogHref(row.slug)) : null
    })),
    calendar: (upcoming.data || []).map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: String(row.status),
      when: row.scheduled_for ? String(row.scheduled_for) : row.updated_at ? String(row.updated_at) : null,
      coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
      readingMinutes: Number(row.reading_minutes || 0) || null,
      href: `/admin/automatic-blog?page=editor&id=${row.id}`
    })),
    pipeline: {
      topicIdeas: {
        count: topicIdeas,
        items: (pipelineTopics.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          status: String(row.status),
          updatedAt: row.updated_at ? String(row.updated_at) : null,
          score: row.topic_quality_score != null ? Number(row.topic_quality_score) : null,
          kind: "topic" as const
        }))
      },
      drafts: {
        count: draftCount,
        items: (pipelineDrafts.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          status: String(row.status),
          updatedAt: row.updated_at ? String(row.updated_at) : null,
          coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
          score: row.human_editorial_score != null ? Number(row.human_editorial_score) : null,
          kind: "article" as const
        }))
      },
      needsReview: {
        count: humanReview,
        items: (pipelineReview.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          status: String(row.status),
          updatedAt: row.updated_at ? String(row.updated_at) : null,
          coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
          score: row.human_editorial_score != null ? Number(row.human_editorial_score) : null,
          factCheckStatus: row.fact_check_status ? String(row.fact_check_status) : null,
          kind: "article" as const
        }))
      },
      approved: {
        count: approved,
        items: (pipelineApproved.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          status: String(row.status),
          updatedAt: row.updated_at ? String(row.updated_at) : null,
          coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
          score: row.human_editorial_score != null ? Number(row.human_editorial_score) : null,
          factCheckStatus: row.fact_check_status ? String(row.fact_check_status) : null,
          kind: "article" as const
        }))
      },
      scheduled: {
        count: scheduled,
        items: (pipelineScheduled.data || []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          status: String(row.status),
          updatedAt: row.scheduled_for ? String(row.scheduled_for) : row.updated_at ? String(row.updated_at) : null,
          coverImage: row.cover_image_path ? String(row.cover_image_path) : null,
          kind: "article" as const
        }))
      }
    },
    activity: (activity.data || []).map((row) => ({
      id: String(row.id),
      actor: row.actor ? String(row.actor) : "system",
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: row.entity_id ? String(row.entity_id) : null,
      createdAt: String(row.created_at),
      details: (row.details || {}) as Record<string, unknown>
    })),
    recentSubscribers: (recentSubscribers.data || []).map((row) => ({
      id: String(row.id),
      email: String(row.email),
      createdAt: String(row.consent_at || row.created_at)
    })),
    categories,
    aiAssistant: {
      image: "/assets/fitdog/social-moments/posters/social-moment-05.jpg",
      imageAlt: "Fitdog puppy photo from approved media library",
      insights,
      jobs: (aiJobs.data || []).map((row) => ({
        id: String(row.id),
        type: String(row.job_type),
        status: String(row.status),
        createdAt: String(row.created_at),
        error: row.error ? String(row.error) : null
      })),
      trending: {
        available: false,
        reason: "Trend data not connected"
      }
    },
    promo: {
      image: "/assets/fitdog/social-moments/posters/social-moment-02.jpg",
      imageAlt: "Fitdog dog on a Southern California beach",
      headline: "Fitdog adventures. Every day.",
      href: absoluteBlogUrl(publicBlogHref("/category/adventures"))
    },
    counts: {
      drafts: draftCount,
      needsReview: humanReview,
      approved,
      scheduled,
      published: publishedTotal,
      failed,
      topics: topicIdeas,
      subscribers: subscriberCount
    }
  };
}

export async function searchBlogDashboard(query: string) {
  const q = query.trim();
  if (q.length < 2) return { articles: [], topics: [], categories: [], tags: [], authors: [] };
  const supabase = getServiceSupabase();
  const like = `%${q}%`;
  const [articles, topics, categories, tags, authors] = await Promise.all([
    supabase
      .from("blog_articles")
      .select("id, title, slug, status, category_slug")
      .or(`title.ilike.${like},slug.ilike.${like},excerpt.ilike.${like}`)
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("blog_topics")
      .select("id, title, status")
      .ilike("title", like)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase.from("blog_categories").select("id, slug, label").or(`label.ilike.${like},slug.ilike.${like}`).limit(8),
    supabase.from("blog_tags").select("id, slug, label").or(`label.ilike.${like},slug.ilike.${like}`).limit(8),
    supabase.from("blog_authors").select("id, slug, name").or(`name.ilike.${like},slug.ilike.${like}`).limit(8)
  ]);
  return {
    articles: articles.data || [],
    topics: topics.data || [],
    categories: categories.data || [],
    tags: tags.data || [],
    authors: authors.data || []
  };
}
