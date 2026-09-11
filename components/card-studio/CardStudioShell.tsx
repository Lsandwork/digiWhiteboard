"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  type UserAccess
} from "@/lib/admin/permissions";
import { canDeleteCardStudioTemplates, canManageCardStudioPrinters, canManageCardStudioSettings } from "@/lib/admin/permissions";
import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS, parseAdminBoardType } from "@/lib/admin/types";
import { CARD_STUDIO_NAV } from "@/lib/card-studio/constants";
import { CardStudioAccess } from "@/components/card-studio/CardStudioAccess";

export function CardStudioShell({
  username,
  role,
  access,
  children
}: {
  username: string;
  role: string;
  access: UserAccess | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [board, setBoardState] = useState<AdminBoardType>(role === "marketing" ? "marketing" : "staff");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fitdog_admin_board");
        if (stored === "staff" || stored === "lobby" || stored === "marketing") {
          setBoardState(parseAdminBoardType(stored));
        }
        if (window.localStorage.getItem("fitdog_admin_sidebar_collapsed") === "1") setSidebarCollapsed(true);
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

  const navigateToTab = useCallback(
    (tab: AdminTab) => {
      router.push(`/admin?board=${board}&tab=${tab}`);
    },
    [board, router]
  );

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } catch {
      // continue
    }
    window.location.assign("/admin/login");
  }

  return (
    <div className="admin-theme cs-app">
      <div className={`admin-layout ${sidebarCollapsed ? "admin-layout--collapsed" : ""}`}>
        <Sidebar
          activeTab={firstAccessibleAdminTab(effectiveAccess, role, board) as AdminTab}
          activePath="/card-studio"
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
          onToggleCollapsed={() => {
            setSidebarCollapsed((current) => {
              const next = !current;
              try {
                window.localStorage.setItem("fitdog_admin_sidebar_collapsed", next ? "1" : "0");
              } catch {
                // ignore
              }
              return next;
            });
          }}
        />
        <div className="admin-main">
          <div className="gingr-mobile-bar">
            <MobileMenuButton onClick={() => setMobileOpen(true)} />
            <ThemeToggle />
          </div>
          <div className="cs-shell">
            <nav className="cs-subnav" aria-label="Card Studio">
              <h2>Card Studio</h2>
              {CARD_STUDIO_NAV.map((item) => {
                const active =
                  item.href === "/card-studio"
                    ? pathname === "/card-studio"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <a key={item.id} href={item.href} className={active ? "is-active" : ""}>
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="cs-main">
              <CardStudioAccess
                canManagePrinters={canManageCardStudioPrinters(effectiveAccess, role)}
                canManageSettings={canManageCardStudioSettings(effectiveAccess, role)}
                canDeleteTemplates={canDeleteCardStudioTemplates(effectiveAccess, role)}
              >
                {children}
              </CardStudioAccess>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
