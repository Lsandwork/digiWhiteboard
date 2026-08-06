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

function siteBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(/\/$/, "");
}

export async function publishNative(payload: PublishPayload): Promise<PublishResult> {
  const publishedUrl = `${siteBase()}/blog/${payload.slug}`;
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
  try {
    const response = await fetch(`${base}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: payload.title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        content: payload.html,
        status: "publish"
      }),
      signal: controller.signal
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
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
      responseSummary: { id: json.id, link: json.link }
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
