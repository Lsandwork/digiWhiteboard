"use client";

import { useMemo } from "react";
import { buildArticlePreviewHtml, estimateReadingMinutes } from "@/lib/blog/utils/article-preview-html";
import { BLOG_FITDOG_HOSTNAME } from "@/lib/blogs-domain";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

type ArticlePreviewFields = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  bodyHtml?: string | null;
  seoTitle: string;
  metaDescription: string;
  authorProfile?: string;
  coverAlt?: string;
};

type Props = {
  article: ArticlePreviewFields;
  device?: PreviewDevice;
  compact?: boolean;
};

export function ArticleLivePreview({ article, device = "desktop", compact = false }: Props) {
  const previewHtml = useMemo(
    () => buildArticlePreviewHtml(article.bodyMarkdown, article.bodyHtml),
    [article.bodyMarkdown, article.bodyHtml]
  );
  const readingMinutes = useMemo(() => estimateReadingMinutes(article.bodyMarkdown), [article.bodyMarkdown]);

  return (
    <div className={`blog-editor-preview blog-editor-preview--${device}${compact ? " blog-editor-preview--compact" : ""}`}>
      <div className="blog-editor-preview__chrome">
        <span className="blog-editor-preview__dot" />
        <span className="blog-editor-preview__dot" />
        <span className="blog-editor-preview__dot" />
        <span className="blog-editor-preview__url">
          {BLOG_FITDOG_HOSTNAME}/{article.slug || "preview"}
        </span>
      </div>
      <article className="blog-editor-preview__page">
        <p className="blog-editor-preview__eyebrow">Fitdog Blog · Preview</p>
        <h1 className="blog-editor-preview__title">{article.title || "Untitled article"}</h1>
        {article.excerpt ? <p className="blog-editor-preview__excerpt">{article.excerpt}</p> : null}
        <p className="blog-editor-preview__meta">
          {article.authorProfile || "Fitdog Team"} · {readingMinutes} min read
          {article.seoTitle ? ` · SEO: ${article.seoTitle}` : ""}
        </p>
        {article.coverAlt ? (
          <div className="blog-editor-preview__cover" aria-hidden>
            <span>{article.coverAlt}</span>
          </div>
        ) : null}
        <div className="blog-editor-preview__prose fitdog-blog-prose" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        {article.metaDescription ? (
          <div className="blog-editor-preview__seo">
            <strong>Meta description</strong>
            <p>{article.metaDescription}</p>
          </div>
        ) : null}
      </article>
    </div>
  );
}

type CompareRow = { label: string; value: string };

export function ArticlePreviewCompareTable({ rows }: { rows: CompareRow[] }) {
  return (
    <div className="blog-editor-preview-table-wrap">
      <table className="blog-editor-preview-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Live value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
