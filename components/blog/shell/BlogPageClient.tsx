"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import "@/app/admin/automatic-blog/blog-dashboard.css";
import { BlogDashboardSidebar } from "@/components/blog/shell/BlogDashboardSidebar";
import { BlogDashboardTopbar } from "@/components/blog/shell/BlogDashboardTopbar";
import { BlogMobileTabBar } from "@/components/blog/shell/BlogMobileTabBar";
import { BlogWorkspace } from "@/components/blog/shell/BlogWorkspace";
import {
  accessFromLegacyRole,
  canAccessBlogGenerator,
  effectiveAccessLabel,
  hasPermission,
  type UserAccess
} from "@/lib/admin/permissions";
import { BLOG_APP_PATH, type BlogPageId } from "@/lib/blog/constants";
import { absoluteBlogUrl, publicBlogHref } from "@/lib/blog/site-url";

type Props = {
  username: string;
  role: string;
  access: UserAccess | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

const SIDEBAR_KEY = "fitdog_blog_sidebar_collapsed";

function firstNameFrom(displayName: string, username: string) {
  const source = displayName.trim() || username.split("@")[0] || "there";
  return source.split(/\s+/)[0] || "there";
}

function BlogPageInner({ username, role, access, displayName, avatarUrl }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const publicBlogUrl = absoluteBlogUrl(publicBlogHref());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(SIDEBAR_KEY) === "1") setSidebarCollapsed(true);
      } catch {
        // ignore
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const effectiveAccess = useMemo(
    () => access ?? accessFromLegacyRole(null, username, role),
    [access, role, username]
  );

  const page = ((searchParams.get("page") as BlogPageId | null) || "overview") as BlogPageId;
  const articleId = searchParams.get("id");

  const resolvedName = (displayName || "").trim() || username.split("@")[0] || username;
  const firstName = firstNameFrom(resolvedName, username);
  const roleLabel = effectiveAccessLabel(effectiveAccess, role, username);

  const canAccess = useCallback(
    (permission: string) => {
      if (role === "owner_admin" || role === "super_admin") return true;
      if (canAccessBlogGenerator(effectiveAccess, role)) {
        if (hasPermission(effectiveAccess, permission as never)) return true;
        return hasPermission(accessFromLegacyRole(null, username, role), permission as never);
      }
      return hasPermission(effectiveAccess, permission as never);
    },
    [effectiveAccess, role, username]
  );

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="blog-dash blog-dash--app">
      <div
        className="blog-dash__shell"
        style={
          {
            ["--blog-sidebar-width" as string]: sidebarCollapsed ? "72px" : "220px"
          } as React.CSSProperties
        }
      >
        <BlogDashboardSidebar
          page={page}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileOpen}
          counts={{
            drafts: counts.drafts,
            needsReview: counts.needsReview,
            approved: counts.approved,
            scheduled: counts.scheduled,
            published: counts.published,
            subscribers: counts.subscribers,
            topics: counts.topics
          }}
          publicBlogUrl={publicBlogUrl}
          canAccess={canAccess}
          onToggleCollapsed={toggleSidebarCollapsed}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="blog-dash__main">
          <BlogDashboardTopbar
            firstName={firstName}
            displayName={resolvedName}
            roleLabel={roleLabel}
            avatarUrl={avatarUrl}
            page={page}
            onToggleMobile={() => setMobileOpen(true)}
            onLogout={() => void logout()}
            notificationCount={counts.needsReview || 0}
          />
          <div className="blog-dash__content">
            <BlogWorkspace
              page={page}
              articleId={articleId}
              role={role}
              access={effectiveAccess}
              canCreate={canAccess("blog.create")}
              canSubmitIdea={canAccess("blog.submit_idea") || canAccess("blog.create")}
              onDashboardCounts={setCounts}
            />
          </div>
        </div>
      </div>
      <BlogMobileTabBar page={page} canAccess={canAccess} onOpenMore={() => setMobileOpen(true)} />
      {/* Keep path stable for deep links */}
      <span className="sr-only">{BLOG_APP_PATH}</span>
    </div>
  );
}

export function BlogPageClient(props: Props) {
  return (
    <Suspense fallback={<div className="blog-dash p-6 text-sm text-[var(--fitdog-muted,#64748b)]">Loading Blog Generator…</div>}>
      <BlogPageInner {...props} />
    </Suspense>
  );
}
