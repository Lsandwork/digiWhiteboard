import { INITIAL_BLOG_CATEGORIES } from "@/lib/blog/content/initial-articles";
import { listPublicArticles } from "@/lib/blog/content/public";
import { publicBlogHref } from "@/lib/blog/public-path";
import { absoluteBlogUrl, getPublicBlogSiteOrigin } from "@/lib/blog/site-url";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getPublicBlogSiteOrigin();
  const urls = [
    absoluteBlogUrl(publicBlogHref()),
    absoluteBlogUrl(publicBlogHref("/articles")),
    absoluteBlogUrl(publicBlogHref("/why-fitdog")),
    ...INITIAL_BLOG_CATEGORIES.map((c) => absoluteBlogUrl(publicBlogHref(`/category/${c.slug}`)))
  ];
  const articles = await listPublicArticles({ limit: 500 });
  for (const article of articles) urls.push(absoluteBlogUrl(publicBlogHref(article.slug)));

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
