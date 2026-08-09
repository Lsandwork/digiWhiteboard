"use client";

import { useEffect, useState } from "react";

type AnalyticsPayload = {
  settings: Record<string, unknown>;
  weekPublished: number;
  nextScheduled: Array<{ id: string; title: string; scheduledFor: string; keyword: string; url: string }>;
  nextAutoSlots: Array<{ at: string; label: string; window: string }>;
  timeline: Array<{
    kind: string;
    id: string;
    at: string;
    status: string;
    provider: string;
    url?: string | null;
    error?: string | null;
  }>;
  channelHealth: Array<{
    channel: string;
    success: number;
    failed: number;
    successRate: number | null;
    lastAt: string | null;
    lastUrl: string | null;
    status: string;
  }>;
  advice: string[];
  playbooks: Array<{
    articleId: string;
    title: string;
    url: string;
    keyword: string;
    wordpressUrl: string | null;
    ctaTips: string[];
  }>;
  resources: Array<{ label: string; href: string }>;
};

export function BlogPostingAnalyticsPanel() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/blog/posting-analytics");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load posting analytics");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="blog-dash-panel">
        <h2 className="text-xl font-semibold">Posting Analytics</h2>
        <p className="mt-2 text-sm text-red-700">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <p className="text-sm text-[var(--fitdog-muted,#6b7280)]">Loading posting analytics…</p>;
  }

  const settings = data.settings || {};

  return (
    <div className="blog-dash-panel space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--fitdog-heading,#121417)]">Posting Analytics</h2>
        <p className="mt-1 text-sm text-[var(--fitdog-muted,#6b7280)]">
          Where we posted, when it went live, what&apos;s next, and how to drive each piece harder.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="This week published" value={String(data.weekPublished)} />
        <StatCard
          label="Target / week"
          value={`${settings.postsPerWeek ?? "—"}`}
        />
        <StatCard
          label="Full-auto SEO"
          value={settings.fullAutoEnabled ? "ON" : "OFF"}
        />
        <StatCard
          label="WordPress mirror"
          value={settings.wordpressMirrorEnabled ? "ON" : "OFF"}
        />
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Channel health
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#fafbfc] text-left text-xs uppercase text-[var(--fitdog-muted,#6b7280)]">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Success</th>
                <th className="px-4 py-3">Failed</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Last</th>
              </tr>
            </thead>
            <tbody>
              {data.channelHealth.map((row) => (
                <tr key={row.channel} className="border-t border-[var(--fitdog-border,#e6e8eb)]">
                  <td className="px-4 py-3 font-medium capitalize">{row.channel}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.success}</td>
                  <td className="px-4 py-3">{row.failed}</td>
                  <td className="px-4 py-3">{row.successRate == null ? "—" : `${row.successRate}%`}</td>
                  <td className="px-4 py-3 text-[var(--fitdog-muted,#6b7280)]">
                    {row.lastAt ? new Date(row.lastAt).toLocaleString() : "—"}
                    {row.lastUrl ? (
                      <>
                        <br />
                        <a className="text-[var(--fitdog-orange,#ff6f26)] underline" href={row.lastUrl} target="_blank" rel="noreferrer">
                          open
                        </a>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
            Next scheduled posts
          </h3>
          <ul className="mt-3 space-y-3">
            {data.nextScheduled.length ? (
              data.nextScheduled.map((row) => (
                <li key={row.id} className="text-sm">
                  <p className="font-medium text-[var(--fitdog-heading,#121417)]">{row.title}</p>
                  <p className="text-[var(--fitdog-muted,#6b7280)]">
                    {row.scheduledFor ? new Date(row.scheduledFor).toLocaleString() : "—"}
                    {row.keyword ? ` · ${row.keyword}` : ""}
                  </p>
                </li>
              ))
            ) : (
              <li className="text-sm text-[var(--fitdog-muted,#6b7280)]">Nothing scheduled yet.</li>
            )}
          </ul>
        </section>
        <section className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
            Next auto SEO slots
          </h3>
          <ul className="mt-3 space-y-2">
            {data.nextAutoSlots.map((slot) => (
              <li key={slot.at} className="text-sm text-[var(--fitdog-heading,#121417)]">
                {slot.label}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Advice to drive postings
        </h3>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--fitdog-body,#2f363d)]">
          {data.advice.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Posting timeline
        </h3>
        <div className="overflow-x-auto rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#fafbfc] text-left text-xs uppercase text-[var(--fitdog-muted,#6b7280)]">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Where</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Link</th>
              </tr>
            </thead>
            <tbody>
              {data.timeline.slice(0, 40).map((row) => (
                <tr key={`${row.kind}-${row.id}`} className="border-t border-[var(--fitdog-border,#e6e8eb)]">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.at ? new Date(row.at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    {row.provider} <span className="text-[var(--fitdog-muted,#6b7280)]">({row.kind})</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.status}
                    {row.error ? (
                      <span className="block text-xs text-red-700">{row.error}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {row.url ? (
                      <a className="text-[var(--fitdog-orange,#ff6f26)] underline" href={row.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Per-post playbooks
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {data.playbooks.map((row) => (
            <article key={row.articleId} className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
              <a href={row.url} className="font-medium text-[var(--fitdog-heading,#121417)] underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                {row.title}
              </a>
              <p className="mt-1 text-xs text-[var(--fitdog-muted,#6b7280)]">
                {row.keyword || "no keyword"}
                {row.wordpressUrl ? " · mirrored to WordPress" : ""}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
                {row.ctaTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">
          Resources for this blog
        </h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {data.resources.map((res) => (
            <a
              key={res.href}
              href={res.href}
              className="rounded-full border border-[var(--fitdog-border,#e6e8eb)] px-3 py-1.5 text-sm text-[var(--fitdog-heading,#121417)] hover:border-[var(--fitdog-orange,#ff6f26)]"
              target={res.href.startsWith("http") ? "_blank" : undefined}
              rel={res.href.startsWith("http") ? "noreferrer" : undefined}
            >
              {res.label}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--fitdog-border,#e6e8eb)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--fitdog-muted,#6b7280)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[var(--fitdog-heading,#121417)]">{value}</p>
    </div>
  );
}
