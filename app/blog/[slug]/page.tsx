import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleToolbar } from "@/components/blog/public/ArticleToolbar";
import { FitdogBlogFooter } from "@/components/blog/public/FitdogBlogFooter";
import { FitdogBlogHeader } from "@/components/blog/public/FitdogBlogHeader";
import { NewsletterForm } from "@/components/blog/public/NewsletterForm";
import { FITDOG_PUBLIC_URLS } from "@/lib/blog/brand";
import {
  getPublicArticle,
  listPublicArticles,
  neighboringArticles,
  relatedArticles
} from "@/lib/blog/content/public";
import { isBlogPublicEnabled } from "@/lib/blog/flags";
import { getBlogSettings } from "@/lib/blog/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function extractToc(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line))
    .map((line) => {
      const text = line.replace(/^##\s+/, "");
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");
      return { text, id };
    });
}

function addHeadingIds(html: string) {
  return html.replace(/<h2>(.*?)<\/h2>/g, (_match, text: string) => {
    const id = String(text)
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return `<h2 id="${id}">${text}</h2>`;
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.seoTitle,
    description: article.metaDescription,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: {
      title: article.seoTitle,
      description: article.metaDescription,
      type: "article",
      url: `/blog/${article.slug}`,
      images: [{ url: article.coverImage, alt: article.coverAlt }]
    }
  };
}

export default async function BlogArticlePage({ params }: Props) {
  if (!isBlogPublicEnabled()) notFound();
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) notFound();

  const all = await listPublicArticles({ limit: 50 });
  const related = relatedArticles(article, all, 3);
  const neighbors = neighboringArticles(article, all);
  const toc = extractToc(article.bodyMarkdown);
  const bodyHtml = addHeadingIds(article.bodyHtml);

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
    image: article.coverImage,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    author: { "@type": "Organization", name: article.authorProfile },
    publisher: { "@type": "Organization", name: "Fitdog" }
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: "/blog" },
      { "@type": "ListItem", position: 2, name: article.categoryLabel, item: `/blog/category/${article.categorySlug}` },
      { "@type": "ListItem", position: 3, name: article.title, item: `/blog/${article.slug}` }
    ]
  };

  return (
    <>
      <FitdogBlogHeader active="Blog" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <nav className="text-sm text-[var(--fitdog-muted)]" aria-label="Breadcrumb">
          <Link href="/blog" className="hover:text-[var(--fitdog-orange)]">
            Blog
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/blog/category/${article.categorySlug}`} className="hover:text-[var(--fitdog-orange)]">
            {article.categoryLabel}
          </Link>
          <span aria-hidden> / </span>
          <span>{article.title}</span>
        </nav>

        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--fitdog-orange)]">{article.categoryLabel}</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-[var(--fitdog-dark)] md:text-5xl">{article.title}</h1>
        <p className="mt-4 text-[var(--fitdog-muted)]">{article.excerpt}</p>
        <p className="mt-4 text-sm text-[var(--fitdog-muted)]">
          {article.authorProfile} · {article.readingMinutes} min read ·{" "}
          {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {article.updatedAt && article.updatedAt !== article.publishedAt
            ? ` · Updated ${new Date(article.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
            : ""}
        </p>

        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-xl bg-[var(--fitdog-surface)]">
          <Image src={article.coverImage} alt={article.coverAlt} fill className="object-cover" sizes="(max-width: 768px) 100vw, 768px" priority />
        </div>
        <p className="mt-2 text-xs text-[var(--fitdog-muted)]">Image: Fitdog-owned media library asset · {article.coverAlt}</p>

        <div className="mt-6">
          <ArticleToolbar slug={article.slug} title={article.title} />
        </div>

        {toc.length > 3 ? (
          <details className="mt-6 rounded-lg border border-[var(--fitdog-border)] bg-[var(--fitdog-surface)] p-4 print:hidden">
            <summary className="cursor-pointer font-bold">Table of contents</summary>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-[var(--fitdog-orange)] hover:underline">
                    {item.text}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        ) : null}

        <div
          className="prose prose-stone mt-8 max-w-none prose-headings:font-extrabold prose-headings:text-[var(--fitdog-dark)] prose-a:text-[var(--fitdog-orange)] prose-li:marker:text-[var(--fitdog-orange)]"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <p className="mt-8 rounded-lg bg-[var(--fitdog-orange-light)] p-4 text-sm text-[var(--fitdog-dark)]">
          This article is educational and is not a substitute for veterinary, training, or medical advice. If your dog shows concerning symptoms, contact a veterinarian.
        </p>

        {disclosure ? <p className="mt-4 text-xs text-[var(--fitdog-muted)]">{disclosure}</p> : null}

        <div className="mt-8 rounded-xl bg-[var(--fitdog-dark)] px-5 py-5 text-white">
          <p className="font-bold">Need hands-on support?</p>
          <p className="mt-1 text-sm text-white/85">
            Fitdog can help with daycare, boarding, training, grooming, and adventures when that support fits your dog.
          </p>
          <a
            href={FITDOG_PUBLIC_URLS.book}
            className="mt-4 inline-flex rounded-md bg-[var(--fitdog-orange)] px-4 py-2 text-sm font-bold text-white"
            target="_blank"
            rel="noopener noreferrer"
          >
            Book a Service
          </a>
        </div>

        <div className="mt-8 grid gap-4 border-t border-[var(--fitdog-border)] pt-6 md:grid-cols-2">
          {neighbors.previous ? (
            <Link href={`/blog/${neighbors.previous.slug}`} className="rounded-lg border border-[var(--fitdog-border)] p-4 hover:border-[var(--fitdog-orange)]">
              <p className="text-xs font-bold uppercase text-[var(--fitdog-muted)]">Previous</p>
              <p className="mt-1 font-semibold">{neighbors.previous.title}</p>
            </Link>
          ) : (
            <div />
          )}
          {neighbors.next ? (
            <Link href={`/blog/${neighbors.next.slug}`} className="rounded-lg border border-[var(--fitdog-border)] p-4 text-right hover:border-[var(--fitdog-orange)]">
              <p className="text-xs font-bold uppercase text-[var(--fitdog-muted)]">Next</p>
              <p className="mt-1 font-semibold">{neighbors.next.title}</p>
            </Link>
          ) : null}
        </div>

        {related.length ? (
          <section className="mt-10">
            <h2 className="text-xl font-extrabold">Related articles</h2>
            <ul className="mt-4 space-y-3">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link href={`/blog/${item.slug}`} className="font-semibold text-[var(--fitdog-orange)] hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-sm text-[var(--fitdog-muted)]">{item.excerpt}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10 rounded-xl bg-[var(--fitdog-orange)] p-5 text-white print:hidden">
          <h2 className="text-lg font-bold">Get more practical dog tips</h2>
          <div className="mt-3 max-w-md">
            <NewsletterForm />
          </div>
        </section>

        <p className="mt-8">
          <Link href="/blog" className="font-bold text-[var(--fitdog-orange)] hover:underline">
            ← Back to Fitdog Blog
          </Link>
        </p>
      </article>
      <FitdogBlogFooter />
    </>
  );
}
