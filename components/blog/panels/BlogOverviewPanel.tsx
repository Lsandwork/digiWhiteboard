"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";

type Overview = {
  settings: Record<string, unknown>;
  counts: Record<string, number>;
  topicCount: number;
  recent: Array<{
    id: string;
    title: string;
    status: string;
    human_editorial_score?: number;
    topic_quality_score?: number;
    updated_at?: string;
    published_url?: string;
  }>;
  monthCostCents: number;
};

export function BlogOverviewPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/blog/overview");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (!cancelled) setOverview(json.overview);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        {error}
        <p className="mt-2 text-xs">
          If tables are missing, apply migration <code>054_automatic_blog.sql</code>.
        </p>
      </div>
    );
  }
  if (!overview) return <p className="text-sm text-slate-600">Loading overview…</p>;

  const cards = [
    { label: "Topics", value: overview.topicCount },
    { label: "Human review", value: overview.counts.HUMAN_REVIEW || 0 },
    { label: "Needs changes", value: overview.counts.NEEDS_CHANGES || 0 },
    { label: "Image review", value: overview.counts.IMAGE_REVIEW || 0 },
    { label: "Scheduled", value: overview.counts.SCHEDULED || 0 },
    { label: "Published", value: overview.counts.PUBLISHED || 0 },
    { label: "Failed", value: overview.counts.FAILED || 0 },
    { label: "Est. cost (30d)", value: `$${(overview.monthCostCents / 100).toFixed(2)}` }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Overview</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Human Editorial Score threshold {String(overview.settings.human_score_threshold ?? 90)}. Auto-publish{" "}
          {overview.settings.auto_publish_enabled ? "on" : "off"}. AI images{" "}
          {overview.settings.ai_images_enabled ? "enabled" : "disabled"}. Emergency stop{" "}
          {overview.settings.emergency_off ? "ON" : "off"}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${BLOG_APP_PATH}?page=generate`} className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white">
          Generate article
        </Link>
        <Link href={`${BLOG_APP_PATH}?page=topics`} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          Topic ideas
        </Link>
        <Link href={`${BLOG_APP_PATH}?page=setup`} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
          Setup wizard
        </Link>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Recent articles</h3>
        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Human score</th>
                <th className="px-3 py-2">Topic score</th>
              </tr>
            </thead>
            <tbody>
              {(overview.recent || []).map((row) => (
                <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-2">
                    <Link href={`${BLOG_APP_PATH}?page=editor&id=${row.id}`} className="text-emerald-700 hover:underline">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.status}</td>
                  <td className="px-3 py-2">{row.human_editorial_score ?? "—"}</td>
                  <td className="px-3 py-2">{row.topic_quality_score ?? "—"}</td>
                </tr>
              ))}
              {!overview.recent?.length ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={4}>
                    No articles yet. Seed topics and generate your first draft.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
