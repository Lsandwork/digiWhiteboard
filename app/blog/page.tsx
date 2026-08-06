import Link from "next/link";
import type { Metadata } from "next";
import { isBlogPublicEnabled } from "@/lib/blog/flags";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fitdog Blog | Practical dog care guidance",
  description: "Thoughtful, practical articles for dog owners from the Fitdog team.",
  alternates: { canonical: "/blog" }
};

export default async function BlogHomePage() {
  if (!isBlogPublicEnabled()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">Fitdog Blog</h1>
        <p className="mt-3 text-slate-600">The public blog is temporarily unavailable.</p>
      </main>
    );
  }

  let articles: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    published_at: string | null;
    author_profile: string;
  }> = [];

  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("blog_articles")
      .select("id, title, slug, excerpt, published_at, author_profile")
      .eq("status", "PUBLISHED")
      .order("published_at", { ascending: false })
      .limit(30);
    articles = data || [];
  } catch {
    articles = [];
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-100 via-white to-emerald-50">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">Fitdog</p>
        <h1 className="mt-2 font-serif text-4xl text-stone-900 md:text-5xl">Blog</h1>
        <p className="mt-3 max-w-2xl text-lg text-stone-700">
          Practical guidance for dog owners — written to be useful, calm, and honest.
        </p>
        <ul className="mt-10 space-y-8">
          {articles.map((article) => (
            <li key={article.id} className="border-t border-stone-200 pt-6">
              <Link href={`/blog/${article.slug}`} className="group block">
                <h2 className="font-serif text-2xl text-stone-900 group-hover:text-emerald-800">{article.title}</h2>
                <p className="mt-2 text-stone-600">{article.excerpt}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-stone-500">
                  {article.author_profile || "Fitdog Team"}
                  {article.published_at ? ` · ${new Date(article.published_at).toLocaleDateString()}` : ""}
                </p>
              </Link>
            </li>
          ))}
          {!articles.length ? (
            <li className="text-stone-600">Published articles will appear here after editorial approval.</li>
          ) : null}
        </ul>
      </div>
    </main>
  );
}
