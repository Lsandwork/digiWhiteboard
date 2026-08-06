import { listPublicArticles } from "@/lib/blog/content/public";

export const dynamic = "force-dynamic";

function siteBase() {
  return (process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(
    /\/$/,
    ""
  );
}

export async function GET() {
  const base = siteBase();
  const articles = await listPublicArticles({ limit: 50 });
  const items = articles
    .map((article) => {
      const link = `${base}/blog/${article.slug}`;
      return `<item><title><![CDATA[${article.title}]]></title><link>${link}</link><guid>${link}</guid><description><![CDATA[${article.excerpt}]]></description><pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate><category><![CDATA[${article.categoryLabel}]]></category></item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fitdog Blog</title><link>${base}/blog</link><description>Practical dog care guidance from Fitdog</description>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate"
    }
  });
}
