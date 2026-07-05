"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, ExternalLink, Search, Shield } from "lucide-react";
import { HelpArticleWalkthrough } from "@/components/admin/help/HelpArticleWalkthrough";
import { HelpVisualMedia } from "@/components/admin/help/HelpVisualMedia";
import {
  filterHelpCategoriesForRole,
  getHelpRoleLabel,
  searchHelpArticles,
  buildAdminTabHref,
  type HelpArticle,
  type HelpCategory
} from "@/lib/admin/help-content";
import { accessFromLegacyRole, canAccessTab } from "@/lib/admin/permissions";
import type { AdminUserRole } from "@/lib/admin/users";
import { isCrossoverStaffRole, isFullAdminRole, isStaffOpsLimitedRole } from "@/lib/admin/users";
import type { AdminBoardType, AdminTab } from "@/lib/admin/types";

type QuickLinkItem = {
  href: string;
  label: string;
  roles: ("admin" | "staff_ops" | "viewer")[];
};

const QUICK_LINKS: QuickLinkItem[] = [
  { href: "/lobby/checkouts", label: "Lobby Whiteboard", roles: ["admin", "viewer"] },
  { href: "/", label: "Staff Whiteboard", roles: ["admin", "staff_ops", "viewer"] },
  { href: "/admin?board=staff&tab=crossover_communication", label: "Front Desk Log", roles: ["admin", "staff_ops", "viewer"] },
  { href: "/admin?board=staff&tab=push_notices", label: "Push Notices", roles: ["admin", "staff_ops"] },
  { href: "/admin?board=staff&tab=staff_directory", label: "Staff Directory", roles: ["admin", "staff_ops"] },
  { href: "/admin?tab=integrations", label: "Integrations", roles: ["admin"] },
  { href: "/admin?tab=users", label: "Admin Users", roles: ["admin"] },
  { href: "/admin?tab=settings", label: "Settings", roles: ["admin"] }
];

type AdminHelpCenterProps = {
  role: AdminUserRole;
  onGoToTab?: (tab: AdminTab, board?: AdminBoardType) => void;
};

function quickLinkVisible(link: QuickLinkItem, role: AdminUserRole) {
  if (isFullAdminRole(role)) return true;
  if (role === "viewer") return link.roles.includes("viewer");
  if (isStaffOpsLimitedRole(role)) return link.roles.includes("staff_ops");
  if (isCrossoverStaffRole(role)) return link.roles.includes("viewer") || link.roles.includes("staff_ops");
  return false;
}

export function AdminHelpCenter({ role, onGoToTab }: AdminHelpCenterProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategory | "All">("All");

  const visibleCategories = useMemo(() => filterHelpCategoriesForRole(role), [role]);
  const results = useMemo(() => searchHelpArticles(query, category, role), [query, category, role]);
  const roleLabel = getHelpRoleLabel(role);
  const isAdmin = isFullAdminRole(role);

  const grouped = useMemo(() => {
    if (query.trim() || category !== "All") return null;
    return visibleCategories.map((cat) => ({
      category: cat,
      articles: results.filter((article) => article.category === cat)
    })).filter((group) => group.articles.length > 0);
  }, [query, category, results, visibleCategories]);

  const visibleQuickLinks = QUICK_LINKS.filter((link) => quickLinkVisible(link, role));

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
              {isAdmin
                ? "Plain-English guides for lobby board, staff board, and admin dashboard. You see all topics as an admin."
                : `Guides for your role (${roleLabel}). Only topics you can use are shown below.`}
            </p>
            <p className="admin-help-role-badge mt-2 inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" aria-hidden />
              Showing help for: <strong>{roleLabel}</strong>
            </p>
          </div>
        </div>

        <label className="admin-help-search relative mt-5 block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-admin-muted" aria-hidden />
          <input
            className="admin-input admin-help-search-input pl-12"
            placeholder="Search help… e.g. cast, login, push notices, TV"
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
          {visibleCategories.map((item) => (
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
          <p className="admin-empty-state-text">Try a simpler word like “login”, “cast”, or “push notices”.</p>
        </section>
      ) : grouped && !query.trim() && category === "All" ? (
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.category} className="admin-help-group">
              <h3 className="admin-help-group-title">{group.category}</h3>
              <div className="admin-help-grid">
                {group.articles.map((article) => (
                  <HelpArticleCard key={article.id} article={article} onGoToTab={onGoToTab} role={role} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="admin-help-grid">
          {results.map((article) => (
            <HelpArticleCard key={article.id} article={article} onGoToTab={onGoToTab} role={role} />
          ))}
        </div>
      )}

      <section className="admin-card p-5">
        <h3 className="admin-section-title">Quick links</h3>
        <p className="admin-section-helper">Jump straight to boards and tools available for your role.</p>
        <div className="admin-help-quick-links mt-4">
          {visibleQuickLinks.map((link) => (
            <QuickLink key={link.href} href={link.href} label={link.label} />
          ))}
        </div>
      </section>
    </div>
  );
}

function canOpenAdminTab(role: AdminUserRole, tab?: AdminTab): boolean {
  if (!tab) return false;
  const access = accessFromLegacyRole(null, null, role);
  return canAccessTab(access, tab, role);
}

function HelpArticleCard({
  article,
  onGoToTab,
  role
}: {
  article: HelpArticle;
  onGoToTab?: (tab: AdminTab, board?: AdminBoardType) => void;
  role: AdminUserRole;
}) {
  const showAdminTab = canOpenAdminTab(role, article.adminTab);

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

      {article.visualSteps?.length || article.walkthrough ? (
        <div className="admin-help-visual-guide">
          <p className="admin-help-visual-guide-title">Visual guide</p>

          {article.walkthrough ? <HelpArticleWalkthrough walkthrough={article.walkthrough} /> : null}

          {article.visualSteps?.length ? (
            <div className={`admin-help-visual-steps ${article.walkthrough ? "admin-help-visual-steps--with-demo" : ""}`}>
              {article.visualSteps.map((step) => (
                <figure key={step.title} className="admin-help-visual-step">
                  <HelpVisualMedia
                    step={step}
                    variant={article.walkthrough === "staff-cast" ? "staff" : "lobby"}
                  />
                  <figcaption>
                    <strong>{step.title}</strong>
                    <span>{step.caption}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

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
        {showAdminTab && onGoToTab ? (
          <button
            type="button"
            className="admin-btn-primary inline-flex items-center gap-2"
            onClick={() => onGoToTab(article.adminTab!, article.adminBoard)}
          >
            Open in Admin <ArrowRight className="h-4 w-4" />
          </button>
        ) : showAdminTab ? (
          <Link href={buildAdminTabHref(article.adminTab!, article.adminBoard)} className="admin-btn-primary inline-flex items-center gap-2">
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
