"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { BlogWorkspace } from "@/components/blog/shell/BlogWorkspace";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  hasPermission,
  type UserAccess
} from "@/lib/admin/permissions";
import { ADMIN_TABS, parseAdminBoardType, type AdminBoardType, type AdminTab } from "@/lib/admin/types";
import { BLOG_APP_PATH, BLOG_NAV_PAGES, type BlogPageId } from "@/lib/blog/constants";

type Props = {
  username: string;
  role: string;
  access: UserAccess | null;
};

function BlogPageInner({ username, role, access }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [board, setBoardState] = useState<AdminBoardType>("staff");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fitdog_admin_board");
        if (stored === "staff" || stored === "lobby" || stored === "marketing") {
          setBoardState(parseAdminBoardType(stored));
        }
        const collapsed = window.localStorage.getItem("fitdog_admin_sidebar_collapsed");
        if (collapsed === "1") setSidebarCollapsed(true);
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

  const visibleTabs = useMemo(
    () => ADMIN_TABS.filter((item) => canAccessAdminTab(effectiveAccess, item, role, board)),
    [board, effectiveAccess, role]
  );

  const page = ((searchParams.get("page") as BlogPageId | null) || "overview") as BlogPageId;
  const articleId = searchParams.get("id");

  const blogNav = useMemo(
    () =>
      BLOG_NAV_PAGES.filter((item) => {
        if (item.id === "editor") return false;
        if (role === "owner_admin") return true;
        return hasPermission(effectiveAccess, item.permission as never);
      }),
    [effectiveAccess, role]
  );

  const navigateToTab = useCallback(
    (tab: AdminTab) => {
      router.push(`/admin?board=${board}&tab=${tab}`);
    },
    [board, router]
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
        window.localStorage.setItem("fitdog_admin_sidebar_collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        activeTab={firstAccessibleAdminTab(effectiveAccess, role, board) as AdminTab}
        activePath={BLOG_APP_PATH}
        board={board}
        username={username}
        role={role}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onTabChange={navigateToTab}
        onLogout={() => void logout()}
        onOpenHelp={() => navigateToTab("help")}
        visibleTabs={visibleTabs}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMobileOpen(true)} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Blog Generator</p>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Fitdog editorial system</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/blog" className="text-sm text-emerald-700 hover:underline" target="_blank">
              Public blog
            </Link>
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-3 md:block dark:border-slate-700 dark:bg-slate-950">
            <nav className="space-y-1">
              {blogNav.map((item) => {
                const active = page === item.id;
                return (
                  <Link
                    key={item.id}
                    href={`${BLOG_APP_PATH}?page=${item.id}`}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      active
                        ? "bg-emerald-700 text-white"
                        : "text-slate-700 hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mb-4 flex gap-2 overflow-x-auto md:hidden">
              {blogNav.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={`${BLOG_APP_PATH}?page=${item.id}`}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                    page === item.id ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <BlogWorkspace page={page} articleId={articleId} role={role} access={effectiveAccess} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlogPageClient(props: Props) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-600">Loading Blog Generator…</div>}>
      <BlogPageInner {...props} />
    </Suspense>
  );
}
