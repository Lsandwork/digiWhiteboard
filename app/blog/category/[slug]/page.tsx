import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/blog/public/ArticleCard";
import { FitdogBlogFooter } from "@/components/blog/public/FitdogBlogFooter";
import { FitdogBlogHeader } from "@/components/blog/public/FitdogBlogHeader";
import { INITIAL_BLOG_CATEGORIES } from "@/lib/blog/content/initial-articles";
import { listPublicArticles } from "@/lib/blog/content/public";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = INITIAL_BLOG_CATEGORIES.find((item) => item.slug === slug);
  if (!category) return { title: "Category not found" };
  return {
    title: `${category.label} | Fitdog Blog`,
    description: `Fitdog articles about ${category.label.toLowerCase()}.`,
    alternates: { canonical: `/blog/category/${slug}` }
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = INITIAL_BLOG_CATEGORIES.find((item) => item.slug === slug);
  if (!category) notFound();
  const articles = await listPublicArticles({ category: slug, limit: 50 });

  return (
    <>
      <FitdogBlogHeader active="Blog" />
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <nav className="text-sm text-[var(--fitdog-muted)]">
          <Link href="/blog" className="hover:text-[var(--fitdog-orange)]">
            Blog
          </Link>
          <span aria-hidden> / </span>
          <span>{category.label}</span>
        </nav>
        <h1 className="mt-4 text-3xl font-extrabold">{category.label}</h1>
        <p className="mt-2 text-[var(--fitdog-muted)]">Practical Fitdog guidance in this category.</p>
        {articles.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <p className="mt-10 rounded-xl border border-dashed border-[var(--fitdog-border)] p-8 text-[var(--fitdog-muted)]">
            No published articles in this category yet.{" "}
            <Link href="/blog/articles" className="font-bold text-[var(--fitdog-orange)] hover:underline">
              Browse all articles
            </Link>
          </p>
        )}
      </main>
      <FitdogBlogFooter />
    </>
  );
}
