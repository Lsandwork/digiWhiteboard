"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { absoluteBlogUrl, publicBlogHref } from "@/lib/blog/site-url";

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
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

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
  if (!overview) return <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Loading overview…</p>;

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
    <div className="blog-dash-panel--wide space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Overview</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
          Human Editorial Score threshold {String(overview.settings.human_score_threshold ?? 90)}. Auto-publish{" "}
          {overview.settings.auto_publish_enabled ? "on" : "off"}. AI images{" "}
          {overview.settings.ai_images_enabled ? "enabled" : "disabled"}. Emergency stop{" "}
          {overview.settings.emergency_off ? "ON" : "off"}.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="blog-dash-side-card">
            <p className="text-xs uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--fitdog-heading,#121417)]">{card.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${BLOG_APP_PATH}?page=generate`} className="blog-dash-toolbar-btn blog-dash-toolbar-btn--success">
          Generate article
        </Link>
        <Link href={`${BLOG_APP_PATH}?page=topics`} className="blog-dash-toolbar-btn">
          Topic ideas
        </Link>
        <Link href={`${BLOG_APP_PATH}?page=setup`} className="blog-dash-toolbar-btn">
          Setup wizard
        </Link>
        <button
          type="button"
          className="blog-dash-toolbar-btn"
          onClick={() => {
            void (async () => {
              setSeedMessage(null);
              const res = await fetch("/api/blog/seed-published", { method: "POST" });
              const json = await res.json();
              setSeedMessage(res.ok ? `Seeded ${json.upserted} published articles.` : json.error || "Seed failed");
            })();
          }}
        >
          Seed 5 launch articles to DB
        </button>
        <Link href={absoluteBlogUrl(publicBlogHref())} target="_blank" className="blog-dash-toolbar-btn">
          Open public blog
        </Link>
      </div>
      {seedMessage ? <p className="text-sm text-emerald-800">{seedMessage}</p> : null}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--fitdog-heading,#121417)]">Recent articles</h3>
        <div className="overflow-hidden rounded-[var(--blog-card-radius,14px)] border border-[var(--fitdog-border,#e6e8eb)]">
          <table className="blog-dash-table min-w-full">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Human score</th>
                <th>Topic score</th>
              </tr>
            </thead>
            <tbody>
              {(overview.recent || []).map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`${BLOG_APP_PATH}?page=editor&id=${row.id}`} className="font-medium text-[var(--fitdog-orange,#ff6f26)] hover:underline">
                      {row.title}
                    </Link>
                  </td>
                  <td>{row.status}</td>
                  <td>{row.human_editorial_score ?? "—"}</td>
                  <td>{row.topic_quality_score ?? "—"}</td>
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
