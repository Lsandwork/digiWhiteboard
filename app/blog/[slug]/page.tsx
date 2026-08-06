import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isBlogPublicEnabled } from "@/lib/blog/flags";
import { getBlogSettings } from "@/lib/blog/service";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function getArticle(slug: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("blog_articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const article = await getArticle(slug);
    if (!article) return { title: "Article not found" };
    return {
      title: String(article.seo_title || article.title),
      description: String(article.meta_description || article.excerpt || ""),
      alternates: { canonical: article.canonical_url || `/blog/${article.slug}` },
      openGraph: {
        title: String(article.og_title || article.seo_title || article.title),
        description: String(article.og_description || article.meta_description || article.excerpt || ""),
        type: "article",
        url: `/blog/${article.slug}`
      },
      robots: String(article.robots || "index,follow")
    };
  } catch {
    return { title: "Fitdog Blog" };
  }
}

export default async function BlogArticlePage({ params }: Props) {
  if (!isBlogPublicEnabled()) notFound();
  const { slug } = await params;
  let article: Awaited<ReturnType<typeof getArticle>> = null;
  try {
    article = await getArticle(slug);
  } catch {
    notFound();
  }
  if (!article) notFound();

  let disclosure: string | null = null;
  try {
    const settings = await getBlogSettings();
    disclosure = settings.public_ai_disclosure ? String(settings.public_ai_disclosure) : null;
  } catch {
    disclosure = null;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    author: {
      "@type": "Organization",
      name: article.author_profile || "Fitdog Team"
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-100 via-white to-emerald-50">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-3xl px-4 py-12">
        <nav className="text-sm text-stone-500">
          <Link href="/blog" className="hover:text-emerald-800">
            Blog
          </Link>
          <span aria-hidden> / </span>
          <span>{article.title}</span>
        </nav>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">Fitdog</p>
        <h1 className="mt-2 font-serif text-4xl leading-tight text-stone-900 md:text-5xl">{article.title}</h1>
        <p className="mt-4 text-stone-600">
          {article.author_profile || "Fitdog Team"}
          {article.published_at ? ` · ${new Date(article.published_at).toLocaleDateString()}` : ""}
          {article.updated_at ? ` · Updated ${new Date(article.updated_at).toLocaleDateString()}` : ""}
        </p>
        {article.excerpt ? <p className="mt-6 text-lg text-stone-700">{article.excerpt}</p> : null}
        <div
          className="prose prose-stone mt-10 max-w-none prose-headings:font-serif prose-a:text-emerald-800"
          dangerouslySetInnerHTML={{ __html: String(article.body_html || "") }}
        />
        {disclosure ? (
          <p className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-500">{disclosure}</p>
        ) : null}
        <div className="mt-10 rounded-lg bg-emerald-900 px-5 py-4 text-emerald-50">
          <p className="font-medium">Need hands-on help?</p>
          <p className="mt-1 text-sm text-emerald-100">
            Fitdog can support daycare, boarding, training, grooming, and adventure care when it fits your dog.
          </p>
          <Link href="https://www.fitdog.com" className="mt-3 inline-block text-sm font-semibold underline">
            Visit Fitdog
          </Link>
        </div>
      </article>
    </main>
  );
}
