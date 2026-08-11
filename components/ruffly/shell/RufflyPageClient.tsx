"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  hasPermission,
  type UserAccess
} from "@/lib/admin/permissions";
import { ADMIN_TABS, parseAdminBoardType, type AdminBoardType, type AdminTab } from "@/lib/admin/types";
import { RUFFLY_NAV_PAGES, type RufflyPageId } from "@/lib/ruffly/constants";
import { RUFFLY_DESCRIPTOR, RUFFLY_NAV_ICON, RUFFLY_WORDMARK } from "@/lib/ruffly/branding/assets";
import { RufflyWorkspace } from "@/components/ruffly/shell/RufflyWorkspace";

type Props = {
  username: string;
  role: string;
  access: UserAccess | null;
  flags: {
    enabled: boolean;
    webchat: boolean;
    ai: boolean;
    voice: boolean;
    campaigns: boolean;
    automations: boolean;
  };
};

function RufflyPageInner({ username, role, access, flags }: Props) {
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

  const page = ((searchParams.get("page") as RufflyPageId | null) || "overview") as RufflyPageId;

  const rufflyNav = useMemo(
    () =>
      RUFFLY_NAV_PAGES.filter((item) => {
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
    <div className="admin-theme">
      <div className={`admin-layout admin-layout--gingr ${sidebarCollapsed ? "admin-layout--collapsed" : ""}`}>
        <Sidebar
          activeTab={firstAccessibleAdminTab(effectiveAccess, role, board) as AdminTab}
          activePath="/ruffly"
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

        <div className="admin-main admin-main--gingr">
          <div className="gingr-mobile-bar">
            <MobileMenuButton onClick={() => setMobileOpen(true)} />
            <ThemeToggle />
          </div>

          <div className="ruffly-canvas light-canvas space-y-4">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Image src={RUFFLY_NAV_ICON} alt="" width={40} height={40} />
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-[#1f2933]">{RUFFLY_WORDMARK}</h1>
                  <p className="text-xs text-slate-600">{RUFFLY_DESCRIPTOR}</p>
                </div>
              </div>
              <Link
                href="/admin?board=staff&tab=crossover_communication"
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Back to Digi-board
              </Link>
            </header>

            <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <nav className="rounded-2xl border border-orange-100 bg-[#fff8f3] p-3" aria-label="Ruffly sections">
                <ul className="space-y-1">
                  {rufflyNav.map((item) => {
                    const active = page === item.id;
                    return (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className={`block rounded-xl px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ff6f26] ${
                            active ? "bg-[#ff6f26] text-white shadow-sm" : "text-slate-800 hover:bg-white"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <RufflyWorkspace page={page} flags={flags} />
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RufflyPageClient(props: Props) {
  return (
    <Suspense fallback={<div className="ruffly-canvas light-canvas p-8 text-sm font-medium text-slate-800">Loading Ruffly…</div>}>
      <RufflyPageInner {...props} />
    </Suspense>
  );
}
