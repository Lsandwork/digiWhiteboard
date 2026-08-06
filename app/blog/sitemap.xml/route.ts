import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function siteBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(/\/$/, "");
}

export async function GET() {
  const base = siteBase();
  const urls = [`${base}/blog`];
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("blog_articles")
      .select("slug, updated_at, published_at")
      .eq("status", "PUBLISHED")
      .limit(500);
    for (const article of data || []) {
      urls.push(`${base}/blog/${article.slug}`);
    }
  } catch {
    // empty sitemap body still valid
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((loc) => `<url><loc>${loc}</loc></url>`)
    .join("")}</urlset>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "s-maxage=600, stale-while-revalidate"
    }
  });
}
