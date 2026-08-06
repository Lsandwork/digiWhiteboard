import Image from "next/image";
import Link from "next/link";
import type { PublicBlogArticle } from "@/lib/blog/content/public";

export function ArticleCard({ article }: { article: PublicBlogArticle }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-[var(--fitdog-border)] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/blog/${article.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-[var(--fitdog-surface)]">
        <Image
          src={article.coverImage}
          alt={article.coverAlt}
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.03]"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/blog/category/${article.categorySlug}`}
          className="text-xs font-bold uppercase tracking-wide text-[var(--fitdog-orange)] hover:underline"
        >
          {article.categoryLabel}
        </Link>
        <h3 className="mt-2 text-lg font-bold leading-snug text-[var(--fitdog-dark)]">
          <Link href={`/blog/${article.slug}`} className="hover:text-[var(--fitdog-orange)]">
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--fitdog-muted)]">{article.excerpt}</p>
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--fitdog-muted)]">
          <span>{article.readingMinutes} min read</span>
          <Link
            href={`/blog/${article.slug}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--fitdog-orange-light)] text-[var(--fitdog-orange)] transition group-hover:bg-[var(--fitdog-orange)] group-hover:text-white"
            aria-label={`Read ${article.title}`}
          >
            →
          </Link>
        </div>
      </div>
    </article>
  );
}
