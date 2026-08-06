"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Clock3,
  Eye,
  HeartHandshake,
  Mail,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { comparePeriodLabel } from "@/lib/blog/workflow";
import { NewArticleSplitButton } from "@/components/blog/dashboard/NewArticleSplitButton";
import { BlogPipelineBoard } from "@/components/blog/dashboard/BlogPipelineBoard";

type Range = "7d" | "30d" | "90d" | "year";

type DashboardPayload = {
  range: Range;
  publicBlogUrl: string;
  kpis: {
    articlesPublished: { value: number; total: number; deltaPercent: number; available: boolean; label: string };
    totalViews: { value: number | null; available: boolean; reason?: string; label: string };
    engagementRate: { value: number | null; available: boolean; reason?: string; label: string };
    avgReadTime: { value: number | null; available: boolean; reason?: string; label: string };
    newsletterSubs: { value: number; newInRange?: number; deltaPercent?: number; available: boolean; label: string };
  };
  performance: {
    available: boolean;
    reason: string;
    summary: Record<string, number | null>;
  };
  topArticles: Array<{
    id: string;
    title: string;
    publishedAt: string | null;
    readingMinutes: number | null;
    coverImage: string | null;
    coverAlt: string;
    views: number | null;
    href: string;
  }>;
  calendar: Array<{
    id: string;
    title: string;
    status: string;
    when: string | null;
    coverImage: string | null;
    href: string;
  }>;
  pipeline: {
    topicIdeas: { count: number; items: Array<Record<string, unknown>> };
    drafts: { count: number; items: Array<Record<string, unknown>> };
    needsReview: { count: number; items: Array<Record<string, unknown>> };
    approved: { count: number; items: Array<Record<string, unknown>> };
    scheduled: { count: number; items: Array<Record<string, unknown>> };
  };
  activity: Array<{
    id: string;
    actor: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
  }>;
  recentSubscribers: Array<{ id: string; email: string; createdAt: string }>;
  categories: Array<{ slug: string; label: string; count: number; percent: number }>;
  aiAssistant: {
    image: string;
    imageAlt: string;
    insights: Array<{ id: string; text: string; tone: string }>;
    trending: { available: boolean; reason?: string };
  };
  promo: { image: string; imageAlt: string; headline: string; href: string };
  counts: Record<string, number>;
};

type Props = {
  canCreate: boolean;
  canSubmitIdea: boolean;
  onCounts?: (counts: Record<string, number>) => void;
};

const CATEGORY_COLORS = ["#ff6f26", "#1e3a5f", "#10b981", "#38bdf8", "#eab308", "#9ca3af"];

function formatNumber(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

function formatRelative(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function statusBadge(status: string) {
  const upper = status.toUpperCase();
  if (upper === "SCHEDULED") return "bg-blue-100 text-blue-700";
  if (upper === "DRAFTING" || upper.includes("DRAFT")) return "bg-slate-100 text-slate-600";
  if (upper === "APPROVED") return "bg-emerald-100 text-emerald-700";
  if (upper === "HUMAN_REVIEW") return "bg-pink-100 text-pink-700";
  return "bg-slate-100 text-slate-600";
}

function KpiCard({
  label,
  value,
  delta,
  available,
  reason,
  icon,
  iconClass,
  comparison
}: {
  label: string;
  value: string;
  delta?: number | null;
  available: boolean;
  reason?: string;
  icon: React.ReactNode;
  iconClass: string;
  comparison: string;
}) {
  return (
    <article className="blog-dash-card blog-dash-kpi">
      <div className={`blog-dash-kpi__icon ${iconClass}`}>{icon}</div>
      <p className="blog-dash-kpi__label">{label}</p>
      {available ? (
        <>
          <p className="blog-dash-kpi__value">{value}</p>
          {delta != null ? (
            <p className={`blog-dash-kpi__delta${delta < 0 ? " blog-dash-kpi__delta--down" : ""}`}>
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% {comparison}
            </p>
          ) : (
            <p className="blog-dash-kpi__delta blog-dash-kpi__delta--muted">{comparison}</p>
          )}
        </>
      ) : (
        <>
          <p className="blog-dash-kpi__value text-[18px] text-[var(--fitdog-muted)]">—</p>
          <p className="blog-dash-kpi__delta blog-dash-kpi__delta--muted">{reason || "Not connected"}</p>
        </>
      )}
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="blog-dash-card h-[122px] p-4">
            <div className="blog-dash-skel h-8 w-8 rounded-full" />
            <div className="blog-dash-skel mt-4 h-3 w-24" />
            <div className="blog-dash-skel mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="blog-dash-card blog-dash-skel h-[320px] lg:col-span-1" />
        <div className="blog-dash-card blog-dash-skel h-[320px]" />
        <div className="blog-dash-card blog-dash-skel h-[320px]" />
      </div>
    </div>
  );
}

export function BlogDashboardPanel({ canCreate, canSubmitIdea, onCounts }: Props) {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/blog/dashboard?range=${range}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load dashboard");
      setData(json.dashboard);
      onCounts?.(json.dashboard.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [onCounts, range]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const comparison = useMemo(() => comparePeriodLabel(range), [range]);

  const categoryChart = useMemo(
    () =>
      (data?.categories || []).map((row, index) => ({
        ...row,
        fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
      })),
    [data?.categories]
  );

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="blog-dash-card p-6 text-sm text-red-700">
        <p>{error}</p>
        <button type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--fitdog-orange)] px-3 py-2 text-white" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const pipelineForBoard = {
    topicIdeas: {
      count: data.pipeline.topicIdeas.count,
      items: data.pipeline.topicIdeas.items.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
        score: row.score != null ? Number(row.score) : null,
        kind: "topic" as const
      }))
    },
    drafts: {
      count: data.pipeline.drafts.count,
      items: data.pipeline.drafts.items.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
        coverImage: row.coverImage ? String(row.coverImage) : null,
        score: row.score != null ? Number(row.score) : null,
        kind: "article" as const
      }))
    },
    needsReview: {
      count: data.pipeline.needsReview.count,
      items: data.pipeline.needsReview.items.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
        coverImage: row.coverImage ? String(row.coverImage) : null,
        score: row.score != null ? Number(row.score) : null,
        factCheckStatus: row.factCheckStatus ? String(row.factCheckStatus) : null,
        kind: "article" as const
      }))
    },
    approved: {
      count: data.pipeline.approved.count,
      items: data.pipeline.approved.items.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
        coverImage: row.coverImage ? String(row.coverImage) : null,
        score: row.score != null ? Number(row.score) : null,
        kind: "article" as const
      }))
    },
    scheduled: {
      count: data.pipeline.scheduled.count,
      items: data.pipeline.scheduled.items.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        updatedAt: row.updatedAt ? String(row.updatedAt) : null,
        coverImage: row.coverImage ? String(row.coverImage) : null,
        kind: "article" as const
      }))
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            label={data.kpis.articlesPublished.label}
            value={formatNumber(data.kpis.articlesPublished.value)}
            delta={data.kpis.articlesPublished.deltaPercent}
            available
            icon={<BookOpen className="h-4 w-4 text-white" />}
            iconClass="bg-[var(--fitdog-orange)] text-white"
            comparison={comparison}
          />
          <KpiCard
            label={data.kpis.totalViews.label}
            value="—"
            available={false}
            reason={data.kpis.totalViews.reason}
            icon={<Eye className="h-4 w-4 text-white" />}
            iconClass="bg-sky-500 text-white"
            comparison={comparison}
          />
          <KpiCard
            label={data.kpis.engagementRate.label}
            value="—"
            available={false}
            reason={data.kpis.engagementRate.reason}
            icon={<HeartHandshake className="h-4 w-4 text-white" />}
            iconClass="bg-pink-500 text-white"
            comparison={comparison}
          />
          <KpiCard
            label={data.kpis.avgReadTime.label}
            value="—"
            available={false}
            reason={data.kpis.avgReadTime.reason}
            icon={<Clock3 className="h-4 w-4 text-white" />}
            iconClass="bg-violet-500 text-white"
            comparison={comparison}
          />
          <KpiCard
            label={data.kpis.newsletterSubs.label}
            value={formatNumber(data.kpis.newsletterSubs.value)}
            delta={data.kpis.newsletterSubs.deltaPercent ?? null}
            available
            icon={<Mail className="h-4 w-4 text-white" />}
            iconClass="bg-teal-500 text-white"
            comparison={comparison}
          />
        </div>
        <NewArticleSplitButton canCreate={canCreate} canSubmitIdea={canSubmitIdea} />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr_1fr]">
        <section className="blog-dash-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">Content Performance Overview</h2>
            <label className="text-xs text-[var(--fitdog-muted)]">
              Range{" "}
              <select
                className="ml-1 rounded-md border border-[var(--fitdog-border)] bg-white px-2 py-1 text-xs"
                value={range}
                onChange={(e) => setRange(e.target.value as Range)}
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="year">This Year</option>
              </select>
            </label>
          </div>
          {!data.performance.available ? (
            <div className="flex h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--fitdog-border)] bg-[#fafbfc] px-6 text-center">
              <TrendingUp className="mb-2 h-8 w-8 text-[var(--fitdog-orange)]" aria-hidden />
              <p className="text-sm font-semibold text-[var(--fitdog-heading)]">Analytics unavailable</p>
              <p className="mt-1 max-w-md text-xs text-[var(--fitdog-muted)]">{data.performance.reason}</p>
              <p className="mt-3 text-xs text-[var(--fitdog-muted)]">
                Published in range: <strong>{data.kpis.articlesPublished.value}</strong> · Total published:{" "}
                <strong>{data.kpis.articlesPublished.total}</strong>
              </p>
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Views", data.performance.summary.views],
              ["Visitors", data.performance.summary.visitors],
              ["Unique Visitors", data.performance.summary.uniqueVisitors],
              ["Bounce Rate", data.performance.summary.bounceRate],
              ["Shares", data.performance.summary.shares],
              ["Saves", data.performance.summary.saves]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[#f8f9fb] px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-[var(--fitdog-muted)]">{label}</p>
                <p className="text-sm font-semibold text-[var(--fitdog-heading)]">
                  {value == null ? "Unavailable" : String(value)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="blog-dash-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">Top Performing Articles</h2>
            <Link href={`${BLOG_APP_PATH}?page=published`} className="text-xs font-semibold text-[var(--fitdog-orange)] hover:underline">
              View all articles
            </Link>
          </div>
          <ul className="space-y-2.5">
            {data.topArticles.slice(0, 5).map((article) => (
              <li key={article.id} className="flex items-center gap-2.5">
                {article.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={article.coverImage} alt="" className="h-11 w-11 rounded-lg object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-lg bg-slate-100" />
                )}
                <div className="min-w-0 flex-1">
                  <Link href={article.href} className="line-clamp-1 text-[13px] font-semibold text-[var(--fitdog-heading)] hover:text-[var(--fitdog-orange)]">
                    {article.title}
                  </Link>
                  <p className="text-[11px] text-[var(--fitdog-muted)]">
                    {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : "—"}
                    {article.readingMinutes ? ` · ${article.readingMinutes} min read` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--fitdog-muted)]" title="Pageview analytics not connected">
                  {article.views == null ? "—" : formatNumber(article.views)}
                </span>
              </li>
            ))}
            {!data.topArticles.length ? (
              <li className="rounded-lg border border-dashed border-[var(--fitdog-border)] px-3 py-8 text-center text-xs text-[var(--fitdog-muted)]">
                No published articles yet.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="blog-dash-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">Content Calendar</h2>
            <Link href={`${BLOG_APP_PATH}?page=calendar`} className="text-xs font-semibold text-[var(--fitdog-orange)] hover:underline">
              View full calendar
            </Link>
          </div>
          <ul className="space-y-2.5">
            {data.calendar.slice(0, 5).map((item) => {
              const when = item.when ? new Date(item.when) : null;
              return (
                <li key={item.id} className="flex items-center gap-2.5">
                  <div className="flex h-11 w-11 flex-col items-center justify-center rounded-lg bg-[var(--fitdog-orange-soft)] text-[var(--fitdog-orange)]">
                    <span className="text-[9px] font-bold uppercase">{when ? when.toLocaleString(undefined, { month: "short" }) : "—"}</span>
                    <span className="text-sm font-bold leading-none">{when ? when.getDate() : "–"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={item.href} className="line-clamp-1 text-[13px] font-semibold text-[var(--fitdog-heading)] hover:text-[var(--fitdog-orange)]">
                      {item.title}
                    </Link>
                    <p className="text-[11px] text-[var(--fitdog-muted)]">
                      {when ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "No schedule"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge(item.status)}`}>
                    {item.status.replace(/_/g, " ")}
                  </span>
                </li>
              );
            })}
            {!data.calendar.length ? (
              <li className="rounded-lg border border-dashed border-[var(--fitdog-border)] px-3 py-8 text-center text-xs text-[var(--fitdog-muted)]">
                No upcoming scheduled content.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <BlogPipelineBoard pipeline={pipelineForBoard} onChanged={() => void load()} />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <section className="blog-dash-card p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-[var(--fitdog-heading)]">Recent Activity</h2>
          <ul className="space-y-3">
            {data.activity.slice(0, 6).map((event) => (
              <li key={event.id} className="flex gap-2.5 text-[12px]">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--fitdog-orange)]" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[var(--fitdog-heading)]">
                    <span className="font-semibold">{event.action}</span>
                    {event.entityId ? (
                      <>
                        {" · "}
                        <Link
                          href={
                            event.entityType === "article"
                              ? `${BLOG_APP_PATH}?page=editor&id=${event.entityId}`
                              : `${BLOG_APP_PATH}?page=audit`
                          }
                          className="text-[var(--fitdog-orange)] hover:underline"
                        >
                          open
                        </Link>
                      </>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-[var(--fitdog-muted)]">
                    {event.actor} · {formatRelative(event.createdAt)}
                  </p>
                </div>
              </li>
            ))}
            {!data.activity.length ? (
              <li className="text-xs text-[var(--fitdog-muted)]">No recent audit events.</li>
            ) : null}
          </ul>
        </section>

        <section className="blog-dash-card relative overflow-hidden min-h-[220px]">
          <Image src={data.promo.image} alt={data.promo.imageAlt} fill className="object-cover" sizes="(max-width:1280px) 50vw, 25vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">
            <p className="text-lg font-bold leading-tight">{data.promo.headline}</p>
            <a href={data.promo.href} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs font-semibold underline">
              Explore adventures
            </a>
          </div>
        </section>

        <section className="blog-dash-card overflow-hidden">
          <div className="relative h-28">
            <Image src={data.aiAssistant.image} alt={data.aiAssistant.imageAlt} fill className="object-cover" sizes="320px" />
          </div>
          <div className="p-4">
            <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">AI Content Assistant</h2>
            <p className="mt-0.5 text-xs text-[var(--fitdog-muted)]">Insights from Fitdog editorial queues</p>
            <ul className="mt-3 space-y-2">
              {data.aiAssistant.insights.map((insight) => (
                <li key={insight.id} className="flex gap-2 text-[12px] text-[var(--fitdog-body)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--fitdog-orange)]" />
                  {insight.text}
                </li>
              ))}
              {!data.aiAssistant.insights.length ? (
                <li className="text-xs text-[var(--fitdog-muted)]">No AI queue insights right now.</li>
              ) : null}
            </ul>
            <p className="mt-3 text-[11px] text-[var(--fitdog-muted)]">
              Trending:{" "}
              {data.aiAssistant.trending.available ? null : (
                <span className="font-medium text-[var(--fitdog-heading)]">{data.aiAssistant.trending.reason}</span>
              )}
            </p>
            <Link
              href={`${BLOG_APP_PATH}?page=generate`}
              className="mt-3 inline-flex rounded-lg border border-[var(--fitdog-orange)] px-3 py-2 text-sm font-semibold text-[var(--fitdog-orange)] hover:bg-[var(--fitdog-orange-soft)]"
            >
              Generate New Ideas
            </Link>
          </div>
        </section>

        <section className="blog-dash-card p-4">
          <h2 className="mb-1 text-[15px] font-semibold text-[var(--fitdog-heading)]">Performance by Category</h2>
          <p className="mb-3 text-xs text-[var(--fitdog-muted)]">Published article mix for the selected period source inventory</p>
          {categoryChart.length ? (
            <>
              <div className="mx-auto h-40 w-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryChart} dataKey="count" nameKey="label" innerRadius={48} outerRadius={70} paddingAngle={2}>
                      {categoryChart.map((entry) => (
                        <Cell key={entry.slug} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [`${value} articles`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="text-center text-xs text-[var(--fitdog-muted)]">
                Total published{" "}
                <span className="font-bold text-[var(--fitdog-heading)]">{categoryChart.reduce((s, r) => s + r.count, 0)}</span>
              </p>
              <ul className="mt-3 space-y-1.5">
                {categoryChart.map((row) => (
                  <li key={row.slug} className="flex items-center justify-between text-[12px]">
                    <Link href={`${BLOG_APP_PATH}?page=published&category=${row.slug}`} className="flex items-center gap-2 hover:underline">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.fill }} aria-hidden />
                      {row.label}
                    </Link>
                    <span className="text-[var(--fitdog-muted)]">
                      {row.count} · {row.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--fitdog-border)] px-3 py-10 text-center text-xs text-[var(--fitdog-muted)]">
              No categorized published articles yet.
            </p>
          )}
        </section>
      </div>

      <section className="blog-dash-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--fitdog-heading)]">Recent Newsletter Signups</h2>
          <Link href={`${BLOG_APP_PATH}?page=newsletter`} className="text-xs font-semibold text-[var(--fitdog-orange)] hover:underline">
            View newsletter
          </Link>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.recentSubscribers.map((sub) => (
            <li key={sub.id} className="rounded-lg border border-[var(--fitdog-border)] px-3 py-2 text-[12px]">
              <p className="truncate font-semibold text-[var(--fitdog-heading)]">{sub.email}</p>
              <p className="text-[11px] text-[var(--fitdog-muted)]">{formatRelative(sub.createdAt)}</p>
            </li>
          ))}
          {!data.recentSubscribers.length ? (
            <li className="text-xs text-[var(--fitdog-muted)]">No newsletter subscribers yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
