import { getServiceSupabase } from "@/lib/supabase/server";
import { publishWordPress, type PublishPayload, type PublishResult } from "@/lib/blog/publishing/adapters";
import { publicBlogHref } from "@/lib/blog/public-path";
import { absoluteBlogUrl } from "@/lib/blog/site-url";
import { writeBlogAudit } from "@/lib/blog/service";

export async function testWordPressConnection(): Promise<{
  ok: boolean;
  message: string;
  detail?: Record<string, unknown>;
}> {
  const base = process.env.WORDPRESS_URL?.replace(/\/$/, "");
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const appPassword = process.env.WORDPRESS_APPLICATION_PASSWORD?.trim();
  if (!base || !username || !appPassword) {
    return {
      ok: false,
      message: "Set WORDPRESS_URL, WORDPRESS_USERNAME, and WORDPRESS_APPLICATION_PASSWORD."
    };
  }
  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  try {
    const response = await fetch(`${base}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(15_000)
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        message: `WordPress auth failed (${response.status})`,
        detail: json
      };
    }
    return {
      ok: true,
      message: `Connected as ${String(json.name || json.slug || username)}`,
      detail: { id: json.id, name: json.name }
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "WordPress connection failed"
    };
  }
}

export async function mirrorArticleToWordPress(
  articleId: string,
  actor?: string
): Promise<PublishResult> {
  const supabase = getServiceSupabase();
  const { data: article, error } = await supabase.from("blog_articles").select("*").eq("id", articleId).single();
  if (error || !article) {
    return { ok: false, provider: "wordpress", error: "Article not found" };
  }

  const canonical = absoluteBlogUrl(publicBlogHref(String(article.slug)));
  const payload: PublishPayload = {
    title: String(article.title),
    slug: String(article.slug),
    excerpt: String(article.excerpt || ""),
    html: String(article.body_html || ""),
    seoTitle: article.seo_title,
    metaDescription: article.meta_description,
    publishedAt: article.published_at || new Date().toISOString(),
    canonicalPath: publicBlogHref(String(article.slug))
  };

  const result = await publishWordPress(payload);
  const idempotencyKey = `blog-wp-mirror-${articleId}-${article.version || 1}-${result.ok ? "ok" : Date.now()}`;

  await supabase.from("blog_publish_attempts").insert({
    article_id: articleId,
    idempotency_key: idempotencyKey,
    status: result.ok ? "succeeded" : "failed",
    request_summary: {
      provider: "wordpress",
      destination: "wordpress",
      mirror: true,
      canonical
    },
    response_summary: result.responseSummary || {},
    published_url: result.publishedUrl ?? null,
    error: result.error ?? null
  });

  if (result.ok) {
    const meta = {
      ...(typeof article.provider_usage === "object" && article.provider_usage
        ? (article.provider_usage as Record<string, unknown>)
        : {}),
      wordpress_url: result.publishedUrl,
      wordpress_id: result.externalId
    };
    await supabase
      .from("blog_articles")
      .update({
        provider_usage: meta,
        updated_at: new Date().toISOString()
      })
      .eq("id", articleId);
  }

  await writeBlogAudit(actor, result.ok ? "article.wordpress_mirrored" : "article.wordpress_mirror_failed", "article", articleId, {
    url: result.publishedUrl,
    error: result.error
  });
  return result;
}
