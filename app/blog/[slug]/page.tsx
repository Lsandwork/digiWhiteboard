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
import { absoluteBlogUrl } from "@/lib/blog/site-url";
import { publicBlogHref } from "@/lib/blog/public-path";

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
  return html.replace(/<h([23])>(.*?)<\/h\1>/g, (_match, level: string, text: string) => {
    const id = String(text)
      .replace(/<[^>]+>/g, "")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    return `<h${level} id="${id}">${text}</h${level}>`;
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticle(slug);
  if (!article) return { title: "Article not found" };
  const canonical = absoluteBlogUrl(publicBlogHref(article.slug));
  const image = absoluteBlogUrl(article.coverImage);
  return {
    title: article.seoTitle,
    description: article.metaDescription,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title: article.seoTitle,
      description: article.metaDescription,
      type: "article",
      url: canonical,
      siteName: "Fitdog Blog",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt || article.publishedAt,
      authors: [article.authorProfile],
      images: [{ url: image, alt: article.coverAlt }]
    },
    twitter: {
      card: "summary_large_image",
      title: article.seoTitle,
      description: article.metaDescription,
      images: [image]
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
  const canonical = absoluteBlogUrl(publicBlogHref(article.slug));
  const coverAbsolute = absoluteBlogUrl(article.coverImage);

  let disclosure: string | null = null;
  try {
    const settings = await getBlogSettings();
    disclosure = settings.public_ai_disclosure ? String(settings.public_ai_disclosure) : null;
  } catch {
    disclosure = null;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.metaDescription || article.excerpt,
    image: [coverAbsolute],
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical
    },
    author: { "@type": "Organization", name: article.authorProfile || "Fitdog Team" },
    publisher: {
      "@type": "Organization",
      name: "Fitdog",
      logo: {
        "@type": "ImageObject",
        url: absoluteBlogUrl("/assets/lobby-whiteboard/light-v2/branding/fitdog-dog-logo-exact.png")
      }
    },
    articleSection: article.categoryLabel,
    wordCount: article.bodyMarkdown.split(/\s+/).filter(Boolean).length,
    inLanguage: "en-US"
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Blog", item: absoluteBlogUrl(publicBlogHref()) },
      {
        "@type": "ListItem",
        position: 2,
        name: article.categoryLabel,
        item: absoluteBlogUrl(publicBlogHref(`/category/${article.categorySlug}`))
      },
      { "@type": "ListItem", position: 3, name: article.title, item: canonical }
    ]
  };

  return (
    <>
      <FitdogBlogHeader active="Blog" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <article className="mx-auto max-w-3xl px-4 py-8 md:px-6" itemScope itemType="https://schema.org/BlogPosting">
        <meta itemProp="headline" content={article.title} />
        <meta itemProp="datePublished" content={article.publishedAt} />
        <meta itemProp="dateModified" content={article.updatedAt || article.publishedAt} />

        <nav className="text-sm text-[var(--fitdog-muted)]" aria-label="Breadcrumb">
          <Link href={publicBlogHref()} className="hover:text-[var(--fitdog-orange)]">
            Blog
          </Link>
          <span aria-hidden> / </span>
          <Link href={publicBlogHref(`/category/${article.categorySlug}`)} className="hover:text-[var(--fitdog-orange)]">
            {article.categoryLabel}
          </Link>
          <span aria-hidden> / </span>
          <span>{article.title}</span>
        </nav>

        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-[var(--fitdog-orange)]">{article.categoryLabel}</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight text-[var(--fitdog-dark)] md:text-5xl" itemProp="headline">
          {article.title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[var(--fitdog-muted)]" itemProp="description">
          {article.excerpt}
        </p>
        <p className="mt-4 text-sm text-[var(--fitdog-muted)]">
          <span itemProp="author">{article.authorProfile}</span> · {article.readingMinutes} min read ·{" "}
          <time dateTime={article.publishedAt}>
            {new Date(article.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </time>
          {article.updatedAt && article.updatedAt !== article.publishedAt
            ? ` · Updated ${new Date(article.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
            : ""}
        </p>

        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-xl bg-[var(--fitdog-surface)]">
          <Image
            src={article.coverImage}
            alt={article.coverAlt}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        </div>
        <p className="mt-2 text-xs text-[var(--fitdog-muted)]">Photo: Fitdog · {article.coverAlt}</p>

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
          className="fitdog-blog-prose mt-8"
          itemProp="articleBody"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <p className="mt-10 rounded-lg bg-[var(--fitdog-orange-light)] p-4 text-sm leading-relaxed text-[var(--fitdog-dark)]">
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
            <Link href={publicBlogHref(neighbors.previous.slug)} className="rounded-lg border border-[var(--fitdog-border)] p-4 hover:border-[var(--fitdog-orange)]">
              <p className="text-xs font-bold uppercase text-[var(--fitdog-muted)]">Previous</p>
              <p className="mt-1 font-semibold">{neighbors.previous.title}</p>
            </Link>
          ) : (
            <div />
          )}
          {neighbors.next ? (
            <Link href={publicBlogHref(neighbors.next.slug)} className="rounded-lg border border-[var(--fitdog-border)] p-4 text-right hover:border-[var(--fitdog-orange)]">
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
                  <Link href={publicBlogHref(item.slug)} className="font-semibold text-[var(--fitdog-orange)] hover:underline">
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
          <Link href={publicBlogHref()} className="font-bold text-[var(--fitdog-orange)] hover:underline">
            ← Back to Fitdog Blog
          </Link>
        </p>
      </article>
      <FitdogBlogFooter />
    </>
  );
}
