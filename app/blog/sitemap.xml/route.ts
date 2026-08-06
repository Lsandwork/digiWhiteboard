import { INITIAL_BLOG_CATEGORIES } from "@/lib/blog/content/initial-articles";
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
  const articles = await listPublicArticles({ limit: 500 });
  const urls = [`${base}/blog`, `${base}/blog/articles`, ...INITIAL_BLOG_CATEGORIES.map((c) => `${base}/blog/category/${c.slug}`)];
  for (const article of articles) urls.push(`${base}/blog/${article.slug}`);

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((loc) => `<url><loc>${loc}</loc></url>`)
    .join("")}</urlset>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "s-maxage=300, stale-while-revalidate"
    }
  });
}
