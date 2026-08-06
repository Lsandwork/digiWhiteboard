"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { BlogContextualHelpLink } from "@/components/blog/help/BlogContextualHelpLink";
import type { BlogHelpStepId } from "@/lib/blog/help-guide";

type Article = {
  id: string;
  title: string;
  status: string;
  human_editorial_score?: number;
  topic_quality_score?: number;
  scheduled_for?: string;
  published_url?: string;
  updated_at?: string;
};

function helpStepForTitle(title: string): BlogHelpStepId | null {
  const lower = title.toLowerCase();
  if (lower.includes("review")) return "review";
  if (lower.includes("calendar") || lower.includes("scheduled")) return "publish";
  if (lower.includes("draft")) return "create";
  if (lower.includes("published")) return "performance";
  return null;
}

export function BlogArticlesPanel({ title, statuses }: { title: string; statuses: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const helpStep = helpStepForTitle(title);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/blog/articles?statuses=${encodeURIComponent(statuses)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed");
        if (!cancelled) setArticles(json.articles || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statuses]);

  return (
    <div className="blog-dash-panel--wide space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">Statuses: {statuses}</p>
        </div>
        {helpStep ? <BlogContextualHelpLink step={helpStep} /> : null}
      </div>
      {error ? <p className="text-sm text-amber-700">{error}</p> : null}
      <div className="overflow-hidden rounded-[var(--blog-card-radius,14px)] border border-[var(--fitdog-border,#e6e8eb)]">
        <table className="blog-dash-table min-w-full">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Human</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id}>
                <td>
                  <Link href={`${BLOG_APP_PATH}?page=editor&id=${article.id}`} className="font-medium text-[var(--fitdog-orange,#ff6f26)] hover:underline">
                    {article.title}
                  </Link>
                </td>
                <td>{article.status}</td>
                <td>{article.human_editorial_score ?? "—"}</td>
                <td className="text-[var(--fitdog-muted,#6b7280)]">{article.updated_at ? new Date(article.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!articles.length ? (
              <tr>
                <td colSpan={4} className="py-6 text-[var(--fitdog-muted,#6b7280)]">
                  No articles in this queue.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
