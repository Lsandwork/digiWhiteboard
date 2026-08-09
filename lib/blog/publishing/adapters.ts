import { absoluteBlogUrl } from "@/lib/blog/site-url";
import { publicBlogHref } from "@/lib/blog/public-path";

export type PublishPayload = {
  title: string;
  slug: string;
  excerpt: string;
  html: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  publishedAt?: string | null;
  canonicalPath?: string;
};

export type PublishResult = {
  ok: boolean;
  provider: string;
  publishedUrl?: string;
  externalId?: string;
  error?: string;
  responseSummary?: Record<string, unknown>;
};

export async function publishNative(payload: PublishPayload): Promise<PublishResult> {
  const publishedUrl = absoluteBlogUrl(publicBlogHref(payload.slug));
  return {
    ok: true,
    provider: "native",
    publishedUrl,
    responseSummary: { mode: "native", slug: payload.slug }
  };
}

export async function publishWordPress(payload: PublishPayload): Promise<PublishResult> {
  const base = process.env.WORDPRESS_URL?.replace(/\/$/, "");
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const appPassword = process.env.WORDPRESS_APPLICATION_PASSWORD?.trim();
  if (!base || !username || !appPassword) {
    return { ok: false, provider: "wordpress", error: "WordPress is not configured." };
  }

  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const canonicalUrl =
    payload.canonicalPath != null
      ? payload.canonicalPath.startsWith("http")
        ? payload.canonicalPath
        : absoluteBlogUrl(payload.canonicalPath)
      : undefined;

  try {
    const response = await fetch(`${base}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: payload.seoTitle || payload.title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        content: payload.html,
        status: "publish",
        meta: {
          // Yoast / Rank Math friendly keys when those plugins expose REST meta.
          _yoast_wpseo_title: payload.seoTitle || payload.title,
          _yoast_wpseo_metadesc: payload.metaDescription || payload.excerpt,
          _yoast_wpseo_canonical: canonicalUrl,
          rank_math_title: payload.seoTitle || payload.title,
          rank_math_description: payload.metaDescription || payload.excerpt,
          rank_math_canonical_url: canonicalUrl
        }
      }),
      signal: controller.signal
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      // Retry without meta if plugin meta registration rejects the payload.
      if (response.status === 400 || response.status === 403) {
        const retry = await fetch(`${base}/wp-json/wp/v2/posts`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: payload.seoTitle || payload.title,
            slug: payload.slug,
            excerpt: payload.metaDescription || payload.excerpt,
            content: payload.html,
            status: "publish"
          }),
          signal: controller.signal
        });
        const retryJson = (await retry.json().catch(() => ({}))) as Record<string, unknown>;
        if (!retry.ok) {
          return {
            ok: false,
            provider: "wordpress",
            error: `WordPress publish failed (${retry.status})`,
            responseSummary: retryJson
          };
        }
        return {
          ok: true,
          provider: "wordpress",
          publishedUrl: typeof retryJson.link === "string" ? retryJson.link : undefined,
          externalId: retryJson.id != null ? String(retryJson.id) : undefined,
          responseSummary: { id: retryJson.id, link: retryJson.link, metaSkipped: true }
        };
      }
      return {
        ok: false,
        provider: "wordpress",
        error: `WordPress publish failed (${response.status})`,
        responseSummary: json
      };
    }
    return {
      ok: true,
      provider: "wordpress",
      publishedUrl: typeof json.link === "string" ? json.link : undefined,
      externalId: json.id != null ? String(json.id) : undefined,
      responseSummary: { id: json.id, link: json.link, canonicalUrl }
    };
  } catch (error) {
    return {
      ok: false,
      provider: "wordpress",
      error: error instanceof Error ? error.message : "WordPress request failed"
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function publishWebhook(payload: PublishPayload, idempotencyKey: string): Promise<PublishResult> {
  const url = process.env.BLOG_PUBLISH_WEBHOOK_URL?.trim();
  const secret = process.env.BLOG_PUBLISH_WEBHOOK_SECRET?.trim();
  if (!url) return { ok: false, provider: "webhook", error: "BLOG_PUBLISH_WEBHOOK_URL is not configured." };

  // Basic SSRF guard: https only, no localhost.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, provider: "webhook", error: "Invalid webhook URL." };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, provider: "webhook", error: "Webhook URL must use https." };
  }
  if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/i.test(parsed.hostname)) {
    return { ok: false, provider: "webhook", error: "Webhook host is not allowlisted." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RuffOps-Idempotency-Key": idempotencyKey,
        ...(secret ? { "X-RuffOps-Webhook-Secret": secret } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        provider: "webhook",
        error: `Webhook publish failed (${response.status})`,
        responseSummary: json
      };
    }
    return {
      ok: true,
      provider: "webhook",
      publishedUrl: typeof json.url === "string" ? json.url : undefined,
      responseSummary: json
    };
  } catch (error) {
    return {
      ok: false,
      provider: "webhook",
      error: error instanceof Error ? error.message : "Webhook request failed"
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function publishArticle(
  provider: string,
  payload: PublishPayload,
  idempotencyKey: string
): Promise<PublishResult> {
  switch (provider) {
    case "wordpress":
      return publishWordPress(payload);
    case "webhook":
      return publishWebhook(payload, idempotencyKey);
    case "native":
    default:
      return publishNative(payload);
  }
}
