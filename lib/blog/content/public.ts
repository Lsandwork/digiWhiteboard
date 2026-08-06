import { INITIAL_BLOG_ARTICLES, INITIAL_BLOG_CATEGORIES, type InitialBlogArticle } from "@/lib/blog/content/initial-articles";
import { publicBlogHref } from "@/lib/blog/public-path";
import { markdownToSimpleHtml } from "@/lib/blog/utils/markdown";
import { getServiceSupabase } from "@/lib/supabase/server";

export type PublicBlogArticle = InitialBlogArticle & {
  bodyHtml: string;
  updatedAt?: string | null;
};

function withHtml(article: InitialBlogArticle, updatedAt?: string | null): PublicBlogArticle {
  return {
    ...article,
    bodyHtml: markdownToSimpleHtml(article.bodyMarkdown),
    updatedAt: updatedAt ?? article.publishedAt
  };
}

export function getSeedArticles(): PublicBlogArticle[] {
  return [...INITIAL_BLOG_ARTICLES]
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .map((article) => withHtml(article));
}

export function getSeedArticleBySlug(slug: string): PublicBlogArticle | null {
  const hit = INITIAL_BLOG_ARTICLES.find((article) => article.slug === slug);
  return hit ? withHtml(hit) : null;
}

export function getSeedCategories() {
  return INITIAL_BLOG_CATEGORIES.map((category) => ({
    ...category,
    count: INITIAL_BLOG_ARTICLES.filter((article) => article.categorySlug === category.slug).length
  }));
}

/** Prefer DB published articles; fall back to editorial seed set so the public blog never looks empty. */
export async function listPublicArticles(options?: {
  category?: string;
  q?: string;
  limit?: number;
}): Promise<PublicBlogArticle[]> {
  const limit = options?.limit ?? 50;
  try {
    const supabase = getServiceSupabase();
    let query = supabase
      .from("blog_articles")
      .select(
        "title, slug, excerpt, body_markdown, body_html, seo_title, meta_description, author_profile, published_at, updated_at, cover_alt, primary_keyword, content_pillar, quality_reports"
      )
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (options?.category) {
      query = query.eq("content_pillar", options.category);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      let rows = data.map((row) => {
        const seed = INITIAL_BLOG_ARTICLES.find((article) => article.slug === row.slug);
        return withHtml(
          {
            slug: String(row.slug),
            title: String(row.title),
            categorySlug: seed?.categorySlug || String(row.content_pillar || "fitdog-news"),
            categoryLabel: seed?.categoryLabel || "Fitdog News",
            excerpt: String(row.excerpt || ""),
            seoTitle: String(row.seo_title || row.title),
            metaDescription: String(row.meta_description || row.excerpt || ""),
            authorProfile: String(row.author_profile || "Fitdog Team"),
            coverImage: seed?.coverImage || "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
            coverAlt: String(row.cover_alt || seed?.coverAlt || row.title),
            readingMinutes: seed?.readingMinutes || Math.max(4, Math.round(String(row.body_markdown || "").split(/\s+/).length / 220)),
            featured: Boolean(seed?.featured),
            publishedAt: String(row.published_at || seed?.publishedAt || new Date().toISOString()),
            bodyMarkdown: String(row.body_markdown || seed?.bodyMarkdown || "")
          },
          row.updated_at ? String(row.updated_at) : null
        );
      });
      if (options?.q) {
        const q = options.q.toLowerCase();
        rows = rows.filter(
          (article) =>
            article.title.toLowerCase().includes(q) ||
            article.excerpt.toLowerCase().includes(q) ||
            article.categoryLabel.toLowerCase().includes(q) ||
            article.bodyMarkdown.toLowerCase().includes(q)
        );
      }
      return rows;
    }
  } catch {
    // fall through to seed
  }

  let articles = getSeedArticles();
  if (options?.category) {
    articles = articles.filter((article) => article.categorySlug === options.category);
  }
  if (options?.q) {
    const q = options.q.toLowerCase();
    articles = articles.filter(
      (article) =>
        article.title.toLowerCase().includes(q) ||
        article.excerpt.toLowerCase().includes(q) ||
        article.categoryLabel.toLowerCase().includes(q) ||
        article.bodyMarkdown.toLowerCase().includes(q)
    );
  }
  return articles.slice(0, limit);
}

export async function getPublicArticle(slug: string): Promise<PublicBlogArticle | null> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("blog_articles")
      .select("*")
      .eq("slug", slug)
      .eq("status", "PUBLISHED")
      .maybeSingle();
    if (data) {
      const seed = INITIAL_BLOG_ARTICLES.find((article) => article.slug === slug);
      return withHtml(
        {
          slug: String(data.slug),
          title: String(data.title),
          categorySlug: seed?.categorySlug || String(data.content_pillar || "fitdog-news"),
          categoryLabel: seed?.categoryLabel || "Fitdog News",
          excerpt: String(data.excerpt || ""),
          seoTitle: String(data.seo_title || data.title),
          metaDescription: String(data.meta_description || data.excerpt || ""),
          authorProfile: String(data.author_profile || "Fitdog Team"),
          coverImage: seed?.coverImage || "/assets/fitdog/social-moments/posters/social-moment-01.jpg",
          coverAlt: String(data.cover_alt || seed?.coverAlt || data.title),
          readingMinutes: seed?.readingMinutes || Math.max(4, Math.round(String(data.body_markdown || "").split(/\s+/).length / 220)),
          featured: Boolean(seed?.featured),
          publishedAt: String(data.published_at || seed?.publishedAt || new Date().toISOString()),
          bodyMarkdown: String(data.body_markdown || seed?.bodyMarkdown || "")
        },
        data.updated_at ? String(data.updated_at) : null
      );
    }
  } catch {
    // fall through
  }
  return getSeedArticleBySlug(slug);
}

export async function getFeaturedArticles(): Promise<PublicBlogArticle[]> {
  const all = await listPublicArticles({ limit: 20 });
  const featured = all.filter((article) => article.featured);
  if (featured.length) return featured;
  return all.slice(0, 3);
}

export function relatedArticles(current: PublicBlogArticle, all: PublicBlogArticle[], limit = 3) {
  return all
    .filter((article) => article.slug !== current.slug)
    .sort((a, b) => {
      const sameCategory = Number(b.categorySlug === current.categorySlug) - Number(a.categorySlug === current.categorySlug);
      if (sameCategory !== 0) return sameCategory;
      return a.publishedAt < b.publishedAt ? 1 : -1;
    })
    .slice(0, limit);
}

export function neighboringArticles(current: PublicBlogArticle, all: PublicBlogArticle[]) {
  const ordered = [...all].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const index = ordered.findIndex((article) => article.slug === current.slug);
  return {
    previous: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
    next: index > 0 ? ordered[index - 1] : null
  };
}

export async function getActivePromotion(): Promise<{
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaUrl: string;
  active: boolean;
} | null> {
  try {
    const supabase = getServiceSupabase();
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("blog_promotions")
      .select("*")
      .eq("active", true)
      .eq("approved", true)
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        title: String(data.title),
        subtitle: String(data.subtitle || ""),
        ctaLabel: String(data.cta_label || "Learn more"),
        ctaUrl: String(data.cta_url || publicBlogHref()),
        active: true
      };
    }
  } catch {
    // no promotion table / not approved
  }
  // Do not invent an offer. Return null so UI shows a service CTA instead.
  return null;
}
