"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS, parseAdminBoardType } from "@/lib/admin/types";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import {
  accessFromLegacyRole,
  canAccessAdminTab,
  firstAccessibleAdminTab,
  type UserAccess
} from "@/lib/admin/permissions";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { GingrWorkspaceSkeleton } from "@/components/gingr/GingrWorkspaceSkeleton";

const GingrWorkspace = dynamic(
  () => import("@/components/gingr/GingrWorkspace").then((module) => module.GingrWorkspace),
  {
    ssr: false,
    loading: () => <GingrWorkspaceSkeleton />
  }
);

type GingrPageClientProps = {
  username: string;
  role: string;
  access: UserAccess | null;
  embedAllowed: boolean;
  embedBlockReason?: string | null;
};

export function GingrPageClient({
  username,
  role,
  access,
  embedAllowed,
  embedBlockReason
}: GingrPageClientProps) {
  const router = useRouter();
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
        // ignore storage errors
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
      if (board === "staff" && tab === "users") {
        router.push("/admin?tab=users");
        return;
      }
      router.push(`/admin?board=${board}&tab=${tab}`);
    },
    [board, router]
  );

  const openHelp = useCallback(() => {
    navigateToTab("help");
  }, [navigateToTab]);

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
        // ignore storage errors
      }
      return next;
    });
  }

  return (
    <div className="admin-theme">
      <div className={`admin-layout admin-layout--gingr ${sidebarCollapsed ? "admin-layout--collapsed" : ""}`}>
        <Sidebar
          activeTab={firstAccessibleAdminTab(effectiveAccess, role, board) as AdminTab}
          activePath="/gingr"
          board={board}
          username={username}
          role={role}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onTabChange={navigateToTab}
          onLogout={() => void logout()}
          onOpenHelp={openHelp}
          visibleTabs={visibleTabs}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />

        <div className="admin-main admin-main--gingr">
          <div className="gingr-mobile-bar">
            <MobileMenuButton onClick={() => setMobileOpen(true)} />
            <ThemeToggle />
          </div>
          <GingrWorkspace embedAllowed={embedAllowed} embedBlockReason={embedBlockReason} />
        </div>
      </div>
    </div>
  );
}
