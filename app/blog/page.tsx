import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArticleCard } from "@/components/blog/public/ArticleCard";
import { BlogSidebar } from "@/components/blog/public/BlogSidebar";
import { FeaturedHero } from "@/components/blog/public/FeaturedHero";
import { FitdogBlogFooter } from "@/components/blog/public/FitdogBlogFooter";
import { FitdogBlogHeader } from "@/components/blog/public/FitdogBlogHeader";
import { BlogSearchBar } from "@/components/blog/public/BlogSearchBar";
import { getActivePromotion, getFeaturedArticles, getSeedCategories, listPublicArticles } from "@/lib/blog/content/public";
import { isBlogPublicEnabled } from "@/lib/blog/flags";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fitdog Blog | Practical dog care for LA owners",
  description: "Thoughtful, practical articles for dog owners from the Fitdog team in Santa Monica and Los Angeles.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Fitdog Blog",
    description: "Practical dog care guidance from Fitdog.",
    type: "website",
    url: "/blog"
  }
};

export default async function BlogHomePage() {
  if (!isBlogPublicEnabled()) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-semibold">Fitdog Blog</h1>
        <p className="mt-3 text-[var(--fitdog-muted)]">The public blog is temporarily unavailable.</p>
      </main>
    );
  }

  const [featured, articles, promotion] = await Promise.all([
    getFeaturedArticles(),
    listPublicArticles({ limit: 12 }),
    getActivePromotion()
  ]);
  const latest = articles.filter((article) => !featured.some((item) => item.slug === article.slug)).slice(0, 4);
  const latestCards = latest.length ? latest : articles.slice(0, 4);
  const categories = getSeedCategories().filter((category) => category.count > 0);

  return (
    <>
      <FitdogBlogHeader active="Blog" />
      <FeaturedHero articles={featured.length ? featured : articles.slice(0, 1)} />

      <section className="border-b border-[var(--fitdog-border)] bg-[var(--fitdog-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex flex-wrap gap-2" aria-label="Categories">
            <Link href="/blog/articles" className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--fitdog-dark)] shadow-sm">
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/blog/category/${category.slug}`}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--fitdog-dark)] shadow-sm hover:text-[var(--fitdog-orange)]"
              >
                {category.label}
              </Link>
            ))}
          </div>
          <div className="w-full md:max-w-sm">
            <Suspense fallback={<div className="h-10 rounded bg-white" />}>
              <BlogSearchBar />
            </Suspense>
          </div>
        </div>
      </section>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_320px] md:px-6">
        <section>
          <div className="mb-5 flex items-end justify-between gap-3">
            <h2 className="text-2xl font-extrabold text-[var(--fitdog-dark)]">Latest from the Fitdog Blog</h2>
            <Link href="/blog/articles" className="text-sm font-bold text-[var(--fitdog-orange)] hover:underline">
              View all articles →
            </Link>
          </div>
          {latestCards.length ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {latestCards.map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--fitdog-border)] p-8 text-[var(--fitdog-muted)]">
              No published articles yet.
            </p>
          )}
        </section>
        <BlogSidebar promotion={promotion} />
      </main>

      <FitdogBlogFooter />
    </>
  );
}
