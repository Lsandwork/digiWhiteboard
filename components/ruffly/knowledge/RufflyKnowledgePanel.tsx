"use client";

import { useCallback, useEffect, useState } from "react";

type KnowledgeArticle = {
  id: string;
  title: string;
  category: string;
  status: string;
  audience?: string;
  customer_visible?: boolean;
  ai_enabled?: boolean;
  source?: string | null;
  updated_at?: string;
};

export function RufflyKnowledgePanel({ enabled = true }: { enabled?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ruffly/knowledge", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load Knowledge Base.");
      setArticles(Array.isArray(body.articles) ? body.articles : []);
      if (body.warning) setMessage(String(body.warning));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Knowledge Base.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function importStarterArticles() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ruffly/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "seed_starter" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to import starter articles.");
      setArticles(Array.isArray(body.articles) ? body.articles : []);
      setMessage(String(body.message || "Starter articles imported."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import starter articles.");
    } finally {
      setBusy(false);
    }
  }

  const publishedCustomer = articles.filter(
    (article) => article.status === "published" && article.customer_visible !== false && article.ai_enabled !== false
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#1f2933]">Knowledge Base</h2>
          <p className="mt-1 text-sm text-slate-500">
            Approved articles that power customer-facing AI. Only published, customer-visible articles are used.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void importStarterArticles()}
            className="rounded-xl bg-[#ff6f26] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Importing…" : "Import starter Fitdog articles"}
          </button>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            Refresh
          </button>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Feature flag is off. Super Admin can enable this channel in Ruffly Settings after credentials are configured.
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
      ) : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        {publishedCustomer.length} published customer-visible article{publishedCustomer.length === 1 ? "" : "s"} ready for AI.
        {articles.length === 0 ? " Click Import starter Fitdog articles to finish setup Step 13." : ""}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : null}

      {!loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {articles.map((article) => (
            <article key={article.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{article.category}</p>
                  <h3 className="mt-1 font-semibold text-[#1f2933]">{article.title}</h3>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                    article.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {article.status}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Audience: {article.audience || "customer"} · AI: {article.ai_enabled === false ? "off" : "on"} · Customer
                visible: {article.customer_visible === false ? "no" : "yes"}
              </p>
              {article.source ? (
                <p className="mt-1 truncate text-xs text-slate-400" title={article.source}>
                  Source: {article.source}
                </p>
              ) : null}
            </article>
          ))}
          {!articles.length ? (
            <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 md:col-span-2">
              No knowledge articles yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
