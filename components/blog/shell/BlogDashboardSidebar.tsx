"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FileText,
  FolderOpen,
  Gauge,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Mail,
  Newspaper,
  PenLine,
  Search,
  Settings,
  Sparkles,
  Tags,
  Users,
  Wand2,
  Share2,
  ExternalLink
} from "lucide-react";
import { BLOG_APP_PATH } from "@/lib/blog/constants";
import { BLOG_DASHBOARD_NAV, type BlogDashboardNavItem } from "@/lib/blog/dashboard-nav";
import { FITDOG_BLOG_LOGO } from "@/lib/blog/brand";
import { BLOG_HELP_GUIDE_PATH } from "@/lib/blog/help-guide";
import type { BlogPageId } from "@/lib/blog/constants";

const ICONS: Record<string, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  calendar: CalendarDays,
  articles: Newspaper,
  topics: Sparkles,
  drafts: PenLine,
  "human-review": FileText,
  approved: BookOpen,
  scheduled: Clapperboard,
  published: Newspaper,
  categories: FolderOpen,
  tags: Tags,
  authors: Users,
  media: ImageIcon,
  newsletter: Mail,
  generate: Wand2,
  "social-generator": Share2,
  "posting-analytics": BarChart3,
  agents: Bot,
  automation: Settings,
  analytics: BarChart3,
  "search-console": Search,
  settings: Settings,
  promotions: Gauge,
  help: HelpCircle
};

type Counts = Partial<Record<NonNullable<BlogDashboardNavItem["badgeKey"]>, number>>;

type Props = {
  page: BlogPageId;
  collapsed: boolean;
  mobileOpen: boolean;
  counts: Counts;
  publicBlogUrl: string;
  canAccess: (permission: string) => boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

function formatBadge(value?: number) {
  if (value == null || value <= 0) return null;
  if (value > 999) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

export function BlogDashboardSidebar({
  page,
  collapsed,
  mobileOpen,
  counts,
  publicBlogUrl,
  canAccess,
  onToggleCollapsed,
  onCloseMobile
}: Props) {
  return (
    <>
      {mobileOpen ? <button type="button" className="blog-dash__overlay" aria-label="Close menu" onClick={onCloseMobile} /> : null}
      <aside
        className={`blog-dash__sidebar${collapsed ? " blog-dash__sidebar--collapsed" : ""}${mobileOpen ? " blog-dash__sidebar--open" : ""}`}
        aria-label="Blog Generator navigation"
      >
        <div className="blog-dash__sidebar-brand">
          <Image
            src={FITDOG_BLOG_LOGO.markCircle}
            alt="Fitdog"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          {!collapsed ? (
            <p className="blog-dash__wordmark">
              fit<span>dog</span>
            </p>
          ) : null}
        </div>

        <nav className="blog-dash__nav">
          {BLOG_DASHBOARD_NAV.map((section) => {
            const items = section.items.filter((item) => !item.unavailable && canAccess(item.permission));
            if (!items.length) return null;
            return (
              <div key={section.id} className="blog-dash__nav-section">
                {!collapsed ? <p className="blog-dash__nav-label">{section.label}</p> : null}
                {items.map((item) => {
                  const href = item.id === "help" ? BLOG_HELP_GUIDE_PATH : `${BLOG_APP_PATH}?page=${item.id}`;
                  const active = item.id === "help" ? false : page === item.id || (item.id === "overview" && page === "overview");
                  const Icon = ICONS[item.id] || LayoutDashboard;
                  const badge = item.badgeKey ? formatBadge(counts[item.badgeKey]) : null;
                  return (
                    <Link
                      key={item.id}
                      href={href}
                      className={`blog-dash__nav-link${active ? " blog-dash__nav-link--active" : ""}${
                        item.mobileHidden ? " blog-dash__nav-link--mobile-hidden" : ""
                      }`}
                      title={collapsed ? item.label : undefined}
                      onClick={onCloseMobile}
                    >
                      <Icon className="blog-dash__nav-icon" aria-hidden />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      {!collapsed && badge ? <span className="blog-dash__badge">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="blog-dash__sidebar-footer">
          {!collapsed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/assets/fitdog/social-moments/posters/social-moment-08.jpg"
              alt=""
              className="mb-1 h-16 w-full rounded-lg object-cover opacity-90"
            />
          ) : null}
          <a
            href={publicBlogUrl}
            target="_blank"
            rel="noreferrer"
            className="blog-dash__public-btn"
            title="View Public Blog"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {!collapsed ? "View Public Blog" : null}
          </a>
          <button
            type="button"
            className="blog-dash__collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </>
  );
}
