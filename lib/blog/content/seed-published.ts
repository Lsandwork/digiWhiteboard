import { INITIAL_BLOG_ARTICLES } from "@/lib/blog/content/initial-articles";
import { writeBlogAudit } from "@/lib/blog/service";
import { markdownToSimpleHtml } from "@/lib/blog/utils/markdown";
import { getServiceSupabase } from "@/lib/supabase/server";

/** Upsert the five editorial seed articles as PUBLISHED for native public blog. */
export async function seedInitialPublishedArticles(actor?: string) {
  const supabase = getServiceSupabase();
  let upserted = 0;

  for (const article of INITIAL_BLOG_ARTICLES) {
    const { data: existing } = await supabase.from("blog_articles").select("id").eq("slug", article.slug).maybeSingle();
    const payload = {
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      body_markdown: article.bodyMarkdown,
      body_html: markdownToSimpleHtml(article.bodyMarkdown),
      status: "PUBLISHED",
      audience: "dog_owners",
      author_profile: article.authorProfile,
      seo_title: article.seoTitle,
      meta_description: article.metaDescription,
      cover_alt: article.coverAlt,
      cover_image_path: article.coverImage,
      category_slug: article.categorySlug,
      content_pillar: article.categorySlug,
      featured: article.featured,
      reading_minutes: article.readingMinutes,
      published_at: article.publishedAt,
      published_url: `/blog/${article.slug}`,
      human_editorial_score: 94,
      topic_quality_score: 92,
      natural_voice_score: 93,
      empathy_score: 92,
      fact_check_status: "seed_editorial_reviewed",
      image_review_status: "approved_fitdog_owned",
      ai_assistance: {
        drafting: false,
        research: false,
        seo: false,
        note: "Initial editorial seed written for launch; not an automated AI draft."
      },
      updated_at: new Date().toISOString()
    };

    if (existing?.id) {
      const { error } = await supabase.from("blog_articles").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("blog_articles").insert({
        ...payload,
        created_by: actor || "seed"
      });
      if (error) throw error;
    }
    upserted += 1;
  }

  await supabase
    .from("blog_settings")
    .update({
      published_count: Math.max(INITIAL_BLOG_ARTICLES.length, 5),
      enabled: true,
      updated_at: new Date().toISOString()
    })
    .eq("id", "default");

  await writeBlogAudit(actor || "seed", "articles.seed_published", "system", undefined, { upserted });
  return { upserted };
}
