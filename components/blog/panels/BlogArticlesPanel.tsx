"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";

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

export function BlogArticlesPanel({ title, statuses }: { title: string; statuses: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">Statuses: {statuses}</p>
      </div>
      {error ? <p className="text-sm text-amber-700">{error}</p> : null}
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Human</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">
                  <Link href={`${BLOG_APP_PATH}?page=editor&id=${article.id}`} className="text-emerald-700 hover:underline">
                    {article.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{article.status}</td>
                <td className="px-3 py-2">{article.human_editorial_score ?? "—"}</td>
                <td className="px-3 py-2">{article.updated_at ? new Date(article.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!articles.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-slate-500">
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
