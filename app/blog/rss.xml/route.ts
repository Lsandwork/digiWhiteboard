import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function siteBase() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://staff.ruffops.com").replace(/\/$/, "");
}

export async function GET() {
  const base = siteBase();
  let items = "";
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("blog_articles")
      .select("title, slug, excerpt, published_at, updated_at")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .limit(50);
    items = (data || [])
      .map((article) => {
        const link = `${base}/blog/${article.slug}`;
        return `<item><title><![CDATA[${article.title}]]></title><link>${link}</link><guid>${link}</guid><description><![CDATA[${article.excerpt || ""}]]></description><pubDate>${new Date(article.published_at || article.updated_at || Date.now()).toUTCString()}</pubDate></item>`;
      })
      .join("");
  } catch {
    items = "";
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Fitdog Blog</title><link>${base}/blog</link><description>Practical dog care guidance from Fitdog</description>${items}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "s-maxage=600, stale-while-revalidate"
    }
  });
}
