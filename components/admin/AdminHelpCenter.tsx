"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink, Search } from "lucide-react";
import {
  HELP_CATEGORIES,
  HELP_ARTICLES,
  searchHelpArticles,
  buildAdminTabHref,
  type HelpCategory
} from "@/lib/admin/help-content";
import type { AdminBoardType, AdminTab } from "@/lib/admin/types";

type AdminHelpCenterProps = {
  onGoToTab?: (tab: AdminTab, board?: AdminBoardType) => void;
};

export function AdminHelpCenter({ onGoToTab }: AdminHelpCenterProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "All">("All");

  const results = useMemo(() => searchHelpArticles(query, category), [query, category]);

  const grouped = useMemo(() => {
    if (query.trim() || category !== "All") return null;
    return HELP_CATEGORIES.map((cat) => ({
      category: cat,
      articles: HELP_ARTICLES.filter((article) => article.category === cat)
    })).filter((group) => group.articles.length > 0);
  }, [query, category]);

  return (
    <div className="admin-help-center space-y-6">
      <header className="admin-help-hero">
        <div className="flex items-start gap-3">
          <div className="admin-help-hero-icon">
            <BookOpen className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 className="admin-page-title">Fitdog Help Center</h2>
            <p className="admin-page-subtitle mt-1 max-w-2xl">
              Plain-English guides for your lobby board, staff board, and admin dashboard. Search below or browse by topic.
            </p>
          </div>
        </div>

        <label className="admin-help-search relative mt-5 block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-admin-muted" aria-hidden />
          <input
            className="admin-input admin-help-search-input pl-12"
            placeholder="Search help… e.g. promotions, login, TV, checkout"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search help articles"
          />
        </label>

        <div className="admin-help-categories mt-4">
          <button
            type="button"
            className={`admin-help-category ${category === "All" ? "admin-help-category--active" : ""}`}
            onClick={() => setCategory("All")}
          >
            All topics
          </button>
          {HELP_CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              className={`admin-help-category ${category === item ? "admin-help-category--active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="admin-help-results-meta">
        <p className="text-sm text-admin-muted">
          {results.length} {results.length === 1 ? "guide" : "guides"}
          {query.trim() ? ` matching “${query.trim()}”` : category !== "All" ? ` in ${category}` : ""}
        </p>
      </div>

      {results.length === 0 ? (
        <section className="admin-empty-state">
          <p className="admin-empty-state-title">No guides found</p>
          <p className="admin-empty-state-text">Try a simpler word like “login”, “promotions”, or “TV”.</p>
        </section>
      ) : grouped && !query.trim() && category === "All" ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.category} className="admin-help-group">
              <h3 className="admin-help-group-title">{group.category}</h3>
              <div className="admin-help-grid">
                {group.articles.map((article) => (
                  <HelpArticleCard key={article.id} article={article} onGoToTab={onGoToTab} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="admin-help-grid">
          {results.map((article) => (
            <HelpArticleCard key={article.id} article={article} onGoToTab={onGoToTab} />
          ))}
        </div>
      )}

      <section className="admin-card p-5">
        <h3 className="admin-section-title">Quick links</h3>
        <p className="admin-section-helper">Jump straight to the live boards or admin areas.</p>
        <div className="admin-help-quick-links mt-4">
          <QuickLink href="/lobby/checkouts" label="Lobby Whiteboard" />
          <QuickLink href="/" label="Staff Whiteboard" />
          <QuickLink href="/admin?board=staff&tab=push_notices" label="Push Notices" />
          <QuickLink href="/admin?tab=integrations" label="Integrations" />
          <QuickLink href="/admin?tab=users" label="Admin Users" />
          <QuickLink href="/admin?tab=settings" label="Settings" />
        </div>
      </section>
    </div>
  );
}

function HelpArticleCard({
  article,
  onGoToTab
}: {
  article: (typeof HELP_ARTICLES)[number];
  onGoToTab?: (tab: AdminTab, board?: AdminBoardType) => void;
}) {
  return (
    <article className="admin-help-card">
      <p className="admin-help-card-category">{article.category}</p>
      <h4 className="admin-help-card-title">{article.title}</h4>
      <p className="admin-help-card-summary">{article.summary}</p>

      <ol className="admin-help-steps">
        {article.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>

      {article.tips?.length ? (
        <div className="admin-help-tips">
          <p className="admin-help-tips-label">Tip</p>
          <ul>
            {article.tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="admin-help-card-actions">
        {article.adminTab && onGoToTab ? (
          <button
            type="button"
            className="admin-btn-primary inline-flex items-center gap-2"
            onClick={() => onGoToTab(article.adminTab!, article.adminBoard)}
          >
            Open in Admin <ArrowRight className="h-4 w-4" />
          </button>
        ) : article.adminTab ? (
          <Link href={buildAdminTabHref(article.adminTab, article.adminBoard)} className="admin-btn-primary inline-flex items-center gap-2">
            Open in Admin <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}

        {article.links?.map((link) =>
          link.href.startsWith("/") ? (
            <Link key={link.label} href={link.href} className="admin-btn-secondary inline-flex items-center gap-2">
              {link.label}
            </Link>
          ) : (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer" className="admin-btn-secondary inline-flex items-center gap-2">
              {link.label} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )
        )}
      </div>
    </article>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="admin-help-quick-link">
      {label}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
