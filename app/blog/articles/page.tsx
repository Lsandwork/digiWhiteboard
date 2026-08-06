import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ArticleCard } from "@/components/blog/public/ArticleCard";
import { BlogSearchBar } from "@/components/blog/public/BlogSearchBar";
import { FitdogBlogFooter } from "@/components/blog/public/FitdogBlogFooter";
import { FitdogBlogHeader } from "@/components/blog/public/FitdogBlogHeader";
import { getSeedCategories, listPublicArticles } from "@/lib/blog/content/public";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All Articles | Fitdog Blog",
  description: "Browse every published Fitdog blog article by category, topic, and search.",
  alternates: { canonical: "/blog/articles" }
};

type Props = { searchParams: Promise<{ q?: string; category?: string; page?: string }> };

export default async function AllArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim() || "";
  const category = params.category?.trim() || "";
  const page = Math.max(1, Number(params.page || "1") || 1);
  const pageSize = 9;

  const articles = await listPublicArticles({ q, category: category || undefined, limit: 200 });
  const totalPages = Math.max(1, Math.ceil(articles.length / pageSize));
  const pageItems = articles.slice((page - 1) * pageSize, page * pageSize);
  const categories = getSeedCategories();

  return (
    <>
      <FitdogBlogHeader active="Blog" />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">All Articles</h1>
            <p className="mt-2 text-[var(--fitdog-muted)]">Search, filter, and explore Fitdog’s published guidance.</p>
          </div>
          <div className="w-full md:max-w-md">
            <Suspense fallback={null}>
              <BlogSearchBar basePath="/blog/articles" />
            </Suspense>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/blog/articles"
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${!category ? "bg-[var(--fitdog-orange)] text-white" : "bg-[var(--fitdog-surface)]"}`}
          >
            All
          </Link>
          {categories.map((item) => (
            <Link
              key={item.slug}
              href={`/blog/articles?category=${item.slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                category === item.slug ? "bg-[var(--fitdog-orange)] text-white" : "bg-[var(--fitdog-surface)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {(q || category) && (
            <Link href="/blog/articles" className="rounded-full px-3 py-1.5 text-xs font-bold text-[var(--fitdog-orange)] underline">
              Clear filters
            </Link>
          )}
        </div>

        {pageItems.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <p className="mt-10 rounded-xl border border-dashed border-[var(--fitdog-border)] p-8 text-[var(--fitdog-muted)]">
            No articles matched your search. Try another keyword or clear filters.
          </p>
        )}

        {totalPages > 1 ? (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            {page > 1 ? (
              <Link
                href={`/blog/articles?page=${page - 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${category}` : ""}`}
                className="rounded border px-3 py-1.5 text-sm font-semibold"
              >
                Previous
              </Link>
            ) : null}
            <span className="text-sm text-[var(--fitdog-muted)]">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/blog/articles?page=${page + 1}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${category}` : ""}`}
                className="rounded border px-3 py-1.5 text-sm font-semibold"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
      <FitdogBlogFooter />
    </>
  );
}
