import { getServiceSupabase } from "@/lib/supabase/server";
import { DEFAULT_HUMAN_SCORE_THRESHOLD, DEFAULT_TOPIC_SCORE_THRESHOLD } from "@/lib/blog/constants";
import { scoreHumanEditorialQuality } from "@/lib/blog/editorial/human-score";
import { scoreTopicQuality } from "@/lib/blog/editorial/topic-score";
import { orchestrateArticleGeneration } from "@/lib/blog/pipeline/orchestrate";
import { publishArticle } from "@/lib/blog/publishing/adapters";
import { BLOG_SEED_TOPICS } from "@/lib/blog/topics/seed-topics";
import { slugifyBlogTitle } from "@/lib/blog/utils/slug";
import { randomUUID } from "crypto";

export async function writeBlogAudit(actor: string | null | undefined, action: string, entityType: string, entityId?: string, details?: Record<string, unknown>) {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("blog_audit_logs").insert({
      actor: actor ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      details: details ?? {}
    });
  } catch {
    // audit must not break primary flow
  }
}

export async function getBlogSettings() {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("blog_settings").select("*").eq("id", "default").maybeSingle();
  if (error) throw error;
  return (
    data ?? {
      id: "default",
      enabled: false,
      auto_publish_enabled: false,
      emergency_off: false,
      human_score_threshold: DEFAULT_HUMAN_SCORE_THRESHOLD,
      topic_score_threshold: DEFAULT_TOPIC_SCORE_THRESHOLD,
      manual_approval_first_n: 25,
      published_count: 0,
      ai_images_enabled: false,
      setup_completed: false,
      setup_step: 0
    }
  );
}

export async function seedBlogTopics(createdBy?: string) {
  const supabase = getServiceSupabase();
  const { data: pillars } = await supabase.from("blog_content_pillars").select("id, slug");
  const pillarMap = new Map((pillars || []).map((row) => [String(row.slug), String(row.id)]));
  const { data: existing } = await supabase.from("blog_topics").select("title");
  const existingTitles = new Set((existing || []).map((row) => String(row.title).toLowerCase()));

  const rows = [];
  for (const topic of BLOG_SEED_TOPICS) {
    if (existingTitles.has(topic.title.toLowerCase())) continue;
    const scored = scoreTopicQuality({
      title: topic.title,
      readerConcern: topic.readerConcern,
      primaryTakeaway: topic.primaryTakeaway,
      angle: topic.angle,
      localRelevance: topic.localRelevance,
      pillar: topic.pillar,
      existingTitles: [...existingTitles]
    });
    rows.push({
      title: topic.title,
      working_title: topic.title,
      pillar_id: pillarMap.get(topic.pillar) ?? null,
      audience: "dog_owners",
      reader_concern: topic.readerConcern,
      primary_takeaway: topic.primaryTakeaway,
      angle: topic.angle,
      tone_preset: topic.tonePreset,
      local_relevance: topic.localRelevance ?? "",
      topic_quality_score: scored.score,
      topic_score_breakdown: scored.breakdown,
      status: scored.score >= DEFAULT_TOPIC_SCORE_THRESHOLD ? "scored" : "idea",
      source_mode: "seed",
      created_by: createdBy ?? null
    });
  }
  if (rows.length) {
    const { error } = await supabase.from("blog_topics").insert(rows);
    if (error) throw error;
  }
  return { inserted: rows.length, skipped: BLOG_SEED_TOPICS.length - rows.length };
}

export async function createTopicFromInput(input: {
  title: string;
  readerConcern?: string;
  primaryTakeaway?: string;
  angle?: string;
  pillarSlug?: string;
  tonePreset?: string;
  localRelevance?: string;
  createdBy?: string;
}) {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase.from("blog_topics").select("title");
  const scored = scoreTopicQuality({
    title: input.title,
    readerConcern: input.readerConcern || "",
    primaryTakeaway: input.primaryTakeaway || "",
    angle: input.angle || "",
    localRelevance: input.localRelevance,
    pillar: input.pillarSlug,
    existingTitles: (existing || []).map((row) => String(row.title))
  });
  let pillarId: string | null = null;
  if (input.pillarSlug) {
    const { data: pillar } = await supabase
      .from("blog_content_pillars")
      .select("id")
      .eq("slug", input.pillarSlug)
      .maybeSingle();
    pillarId = pillar?.id ? String(pillar.id) : null;
  }
  const { data, error } = await supabase
    .from("blog_topics")
    .insert({
      title: input.title,
      working_title: input.title,
      pillar_id: pillarId,
      reader_concern: input.readerConcern || "",
      primary_takeaway: input.primaryTakeaway || "",
      angle: input.angle || "",
      tone_preset: input.tonePreset || "service_explanation",
      local_relevance: input.localRelevance || "",
      topic_quality_score: scored.score,
      topic_score_breakdown: { ...scored.breakdown, deductions: scored.deductions },
      status: scored.rejected ? "idea" : "scored",
      rejection_reason: scored.rejectionReason ?? null,
      source_mode: "manual",
      created_by: input.createdBy ?? null
    })
    .select("*")
    .single();
  if (error) throw error;
  return { topic: data, score: scored };
}

export async function generateArticleFromTopic(topicId: string, actor?: string) {
  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();
  if (settings.emergency_off) {
    throw new Error("Automatic Blog emergency stop is enabled.");
  }

  const { data: topic, error: topicError } = await supabase.from("blog_topics").select("*").eq("id", topicId).single();
  if (topicError || !topic) throw topicError || new Error("Topic not found");

  const topicScore = Number(topic.topic_quality_score || 0);
  const topicThreshold = Number(settings.topic_score_threshold || DEFAULT_TOPIC_SCORE_THRESHOLD);
  if (topicScore < topicThreshold) {
    throw new Error(`Topic Quality Score ${topicScore} is below threshold ${topicThreshold}.`);
  }

  const briefPayload = {
    topic: topic.title,
    workingTitle: topic.working_title || topic.title,
    audience: topic.audience,
    readerConcern: topic.reader_concern,
    primaryTakeaway: topic.primary_takeaway,
    angle: topic.angle,
    tonePreset: topic.tone_preset,
    localRelevance: topic.local_relevance,
    primaryKeyword: topic.primary_keyword,
    fitdogConnection: "daycare evaluations, boarding preparation, training, or enrichment support"
  };

  const { data: brief, error: briefError } = await supabase
    .from("blog_content_briefs")
    .insert({
      topic_id: topicId,
      payload: briefPayload,
      status: "ready",
      created_by: actor ?? null
    })
    .select("*")
    .single();
  if (briefError) throw briefError;

  const { data: previousArticles } = await supabase
    .from("blog_articles")
    .select("body_markdown")
    .order("created_at", { ascending: false })
    .limit(8);
  const previousOpenings = (previousArticles || []).map((row) => String(row.body_markdown || "").slice(0, 120));

  const threshold = Number(settings.human_score_threshold || DEFAULT_HUMAN_SCORE_THRESHOLD);
  const orchestration = await orchestrateArticleGeneration({
    brief: {
      title: String(topic.working_title || topic.title),
      audience: String(topic.audience || "dog_owners"),
      readerConcern: String(topic.reader_concern || ""),
      primaryTakeaway: String(topic.primary_takeaway || ""),
      angle: String(topic.angle || ""),
      tonePreset: String(topic.tone_preset || "service_explanation"),
      primaryKeyword: String(topic.primary_keyword || ""),
      localRelevance: String(topic.local_relevance || ""),
      fitdogConnection: "daycare, boarding, training, or enrichment"
    },
    threshold,
    previousOpenings
  });
  const draft = orchestration.draft;
  const factReview = orchestration.reviews.find((review) => review.agentName === "fact_check_safety");
  const requiresManualFact = Boolean(factReview?.output?.requiresManualApproval);
  const status =
    orchestration.blocked || draft.humanScore.score < threshold
      ? "NEEDS_CHANGES"
      : requiresManualFact
        ? "FACT_CHECK"
        : "HUMAN_REVIEW";

  let slug = draft.slug;
  const { data: slugHit } = await supabase.from("blog_articles").select("id").eq("slug", slug).maybeSingle();
  if (slugHit?.id) slug = `${slug}-${Date.now().toString(36)}`;

  const { data: article, error: articleError } = await supabase
    .from("blog_articles")
    .insert({
      topic_id: topicId,
      brief_id: brief.id,
      title: draft.title,
      slug,
      excerpt: draft.excerpt,
      body_html: draft.bodyHtml,
      body_markdown: draft.bodyMarkdown,
      status,
      audience: topic.audience,
      reader_concern: topic.reader_concern,
      primary_takeaway: topic.primary_takeaway,
      content_pillar: topic.pillar_id ? String(topic.pillar_id) : "",
      tone_preset: topic.tone_preset,
      author_profile: "Fitdog Team",
      ai_assistance: {
        drafting: draft.usedAi,
        research: false,
        seo: true,
        editing: false,
        empathy_review: true,
        natural_voice_review: true,
        fact_check: true,
        social_media: true
      },
      primary_keyword: topic.primary_keyword,
      seo_title: draft.seoTitle,
      meta_description: draft.metaDescription,
      topic_quality_score: topicScore,
      human_editorial_score: draft.humanScore.score,
      natural_voice_score: draft.humanScore.naturalVoiceScore,
      empathy_score: draft.humanScore.empathyScore,
      fact_check_status: requiresManualFact ? "needs_manual" : factReview?.ok ? "passed_rules" : "failed",
      image_review_status: "pending",
      estimated_cost_cents: draft.estimatedCostCents,
      provider_usage: { provider: draft.provider, model: draft.model },
      quality_reports: {
        human: draft.humanScore,
        agentNotes: draft.agentNotes,
        reviews: orchestration.reviews,
        blockReasons: orchestration.blockReasons
      },
      social_package: orchestration.socialPackage,
      claims: (factReview?.output?.claims as unknown[]) || [],
      created_by: actor ?? null
    })
    .select("*")
    .single();
  if (articleError) throw articleError;

  await supabase.from("blog_article_versions").insert({
    article_id: article.id,
    version: 1,
    title: article.title,
    body_html: article.body_html,
    body_markdown: article.body_markdown,
    snapshot: { status, humanScore: draft.humanScore, blockReasons: orchestration.blockReasons },
    created_by: actor ?? null
  });
  await supabase.from("blog_status_history").insert({
    article_id: article.id,
    from_status: null,
    to_status: status,
    note: draft.agentNotes.join(" "),
    actor: actor ?? null
  });
  await supabase.from("blog_agent_runs").insert({
    article_id: article.id,
    topic_id: topicId,
    agent_name: "human_first_writer",
    provider: draft.provider ?? "deterministic",
    model: draft.model ?? null,
    input_summary: briefPayload.topic,
    output: { excerpt: draft.excerpt, notes: draft.agentNotes },
    score: draft.humanScore.score,
    ok: true,
    cost_cents: draft.estimatedCostCents
  });
  for (const review of orchestration.reviews) {
    await supabase.from("blog_agent_runs").insert({
      article_id: article.id,
      topic_id: topicId,
      agent_name: review.agentName,
      provider: review.agentName === "final_human_quality" || review.agentName === "natural_voice_evaluator" ? "rules" : "rules",
      model: "editorial-v1",
      input_summary: `${review.agentName} independent review`,
      output: { findings: review.findings, recommendations: review.recommendations, ...review.output },
      score: review.score,
      ok: review.ok,
      cost_cents: 0
    });
  }
  if (draft.estimatedCostCents > 0) {
    await supabase.from("blog_usage_records").insert({
      article_id: article.id,
      provider: draft.provider || "gemini",
      model: draft.model || null,
      units: 1,
      cost_cents: draft.estimatedCostCents,
      notes: "article generation"
    });
  }
  await supabase.from("blog_topics").update({ status: "used", updated_at: new Date().toISOString() }).eq("id", topicId);
  await writeBlogAudit(actor, "article.generated", "article", String(article.id), { status, score: draft.humanScore.score });

  return article;
}

export async function transitionArticleStatus(articleId: string, toStatus: string, actor?: string, note?: string) {
  const supabase = getServiceSupabase();
  const { data: article, error } = await supabase.from("blog_articles").select("*").eq("id", articleId).single();
  if (error || !article) throw error || new Error("Article not found");
  const { error: updateError } = await supabase
    .from("blog_articles")
    .update({ status: toStatus, updated_at: new Date().toISOString(), approved_by: toStatus === "APPROVED" ? actor ?? null : article.approved_by })
    .eq("id", articleId);
  if (updateError) throw updateError;
  await supabase.from("blog_status_history").insert({
    article_id: articleId,
    from_status: article.status,
    to_status: toStatus,
    note: note || "",
    actor: actor ?? null
  });
  await writeBlogAudit(actor, "article.status", "article", articleId, { from: article.status, to: toStatus, note });
  return { ...article, status: toStatus };
}

export async function rescoreArticle(articleId: string) {
  const supabase = getServiceSupabase();
  const { data: article, error } = await supabase.from("blog_articles").select("*").eq("id", articleId).single();
  if (error || !article) throw error || new Error("Article not found");
  const humanScore = scoreHumanEditorialQuality({
    title: String(article.title),
    body: String(article.body_markdown || article.body_html || ""),
    excerpt: String(article.excerpt || "")
  });
  const settings = await getBlogSettings();
  const threshold = Number(settings.human_score_threshold || DEFAULT_HUMAN_SCORE_THRESHOLD);
  const nextStatus = humanScore.score >= threshold ? article.status === "NEEDS_CHANGES" ? "HUMAN_REVIEW" : article.status : "NEEDS_CHANGES";
  await supabase
    .from("blog_articles")
    .update({
      human_editorial_score: humanScore.score,
      natural_voice_score: humanScore.naturalVoiceScore,
      empathy_score: humanScore.empathyScore,
      quality_reports: { ...(article.quality_reports || {}), human: humanScore },
      status: nextStatus,
      updated_at: new Date().toISOString()
    })
    .eq("id", articleId);
  return humanScore;
}

export async function publishBlogArticle(articleId: string, actor?: string) {
  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();
  if (settings.emergency_off) throw new Error("Emergency stop is enabled.");

  const { data: article, error } = await supabase.from("blog_articles").select("*").eq("id", articleId).single();
  if (error || !article) throw error || new Error("Article not found");

  const publishedCount = Number(settings.published_count || 0);
  const firstN = Number(settings.manual_approval_first_n || 25);
  if (publishedCount < firstN && article.status !== "APPROVED" && article.status !== "SCHEDULED") {
    throw new Error(`First ${firstN} articles require APPROVED status before publishing.`);
  }
  if (Number(article.human_editorial_score || 0) < Number(settings.human_score_threshold || DEFAULT_HUMAN_SCORE_THRESHOLD)) {
    throw new Error("Human Editorial Score is below threshold.");
  }
  if (!settings.ai_images_enabled && article.cover_media_id) {
    // cover optional; if present must be approved — checked below when media exists
  }
  if (article.cover_media_id) {
    const { data: media } = await supabase.from("blog_media_assets").select("*").eq("id", article.cover_media_id).maybeSingle();
    if (media && media.approval_status !== "approved") {
      throw new Error("Cover image is not approved.");
    }
    if (media && media.source_class === "ai_generated_approved" && !settings.ai_images_enabled) {
      throw new Error("AI-generated images are disabled.");
    }
  }

  await transitionArticleStatus(articleId, "PUBLISHING", actor, "Publishing started");
  const idempotencyKey = `blog-publish-${articleId}-${article.version || 1}`;
  const destination = String(article.publish_destination || settings.publish_provider || "native");
  const result = await publishArticle(
    destination,
    {
      title: String(article.title),
      slug: String(article.slug),
      excerpt: String(article.excerpt || ""),
      html: String(article.body_html || ""),
      seoTitle: article.seo_title,
      metaDescription: article.meta_description,
      publishedAt: new Date().toISOString(),
      canonicalPath: `/blog/${article.slug}`
    },
    idempotencyKey
  );

  await supabase.from("blog_publish_attempts").upsert(
    {
      article_id: articleId,
      idempotency_key: idempotencyKey,
      status: result.ok ? "succeeded" : "failed",
      request_summary: { destination },
      response_summary: result.responseSummary || {},
      published_url: result.publishedUrl ?? null,
      error: result.error ?? null
    },
    { onConflict: "idempotency_key" }
  );

  if (!result.ok) {
    await transitionArticleStatus(articleId, "FAILED", actor, result.error || "Publish failed");
    throw new Error(result.error || "Publish failed");
  }

  await supabase
    .from("blog_articles")
    .update({
      status: "PUBLISHED",
      published_at: new Date().toISOString(),
      published_url: result.publishedUrl ?? `/blog/${article.slug}`,
      updated_at: new Date().toISOString()
    })
    .eq("id", articleId);
  await supabase
    .from("blog_settings")
    .update({ published_count: publishedCount + 1, updated_at: new Date().toISOString() })
    .eq("id", "default");
  await writeBlogAudit(actor, "article.published", "article", articleId, { url: result.publishedUrl, provider: result.provider });
  return { ...article, status: "PUBLISHED", published_url: result.publishedUrl };
}

export async function getBlogOverview() {
  const supabase = getServiceSupabase();
  const settings = await getBlogSettings();
  const statuses = [
    "IDEA",
    "HUMAN_REVIEW",
    "NEEDS_CHANGES",
    "APPROVED",
    "SCHEDULED",
    "PUBLISHED",
    "FAILED",
    "IMAGE_REVIEW",
    "DRAFTING"
  ];
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    const { count } = await supabase
      .from("blog_articles")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    counts[status] = count || 0;
  }
  const { count: topicCount } = await supabase.from("blog_topics").select("id", { count: "exact", head: true });
  const { data: recent } = await supabase
    .from("blog_articles")
    .select("id, title, status, human_editorial_score, topic_quality_score, updated_at, published_url")
    .order("updated_at", { ascending: false })
    .limit(8);
  const { data: usage } = await supabase
    .from("blog_usage_records")
    .select("cost_cents, created_at")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  const monthCost = (usage || []).reduce((sum, row) => sum + Number(row.cost_cents || 0), 0);
  return {
    settings,
    counts,
    topicCount: topicCount || 0,
    recent: recent || [],
    monthCostCents: monthCost
  };
}

export function newIdempotencyKey(prefix = "blog") {
  return `${prefix}-${randomUUID()}`;
}

export { slugifyBlogTitle };
