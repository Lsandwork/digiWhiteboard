"use client";

import Image from "next/image";
import { useState } from "react";
import type { AdminTab, AdminBoardType } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import {
  canAccessAdminTab,
  isStaffPanelLimitedAccess,
  type UserAccess
} from "@/lib/admin/permissions";
import { FITDOG_BRAND, FITDOG_UI } from "@/lib/fitdog-dashboard/assets";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import { getTabLabel } from "@/lib/admin/nav-groups";
import { BoardSwitcher } from "@/components/admin/BoardSwitcher";
import { DemoRoleSwitcher } from "@/components/demo/DemoRoleSwitcher";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { getEffectiveDemoRole } from "@/lib/demo/session";

type AdminShellProps = {
  board: AdminBoardType;
  tab: AdminTab;
  username: string;
  role?: string | null;
  isDemo?: boolean;
  demoRole?: string | null;
  access?: UserAccess | null;
  displayLabel?: string | null;
  savedLabel: string;
  refreshing?: boolean;
  castRefreshing?: boolean;
  onBoardChange: (board: AdminBoardType) => void;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  onCastRefresh?: () => void;
  onPreviewLive: () => void;
  onOpenBoard: () => void;
  onLogout: () => void;
  onOpenHelp?: () => void;
  onDemoRoleSwitched?: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
  showPreview?: boolean;
};

export function AdminShell({
  board,
  tab,
  username,
  role,
  isDemo,
  demoRole,
  access,
  displayLabel,
  savedLabel,
  refreshing,
  castRefreshing,
  onBoardChange,
  onTabChange,
  onRefresh,
  onCastRefresh,
  onPreviewLive,
  onOpenBoard,
  onLogout,
  onOpenHelp,
  onDemoRoleSwitched,
  children,
  preview,
  showPreview = true
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = board === "staff" ? "Staff Digital Whiteboard Admin" : "Lobby Whiteboard Admin";
  const staffPanelLimited = isStaffPanelLimitedAccess(access, role) && !isDemo;
  const effectiveRole = isDemo ? (demoRole ?? role) : role;

  const visibleTabs = ADMIN_TABS.filter((item) =>
    canAccessAdminTab(access, item, effectiveRole, board, { isDemo })
  );
  const pageLabel = getTabLabel(tab);

  return (
    <div className="admin-theme">
      <div className="admin-layout">
        <Sidebar
          activeTab={tab}
          board={board}
          username={username}
          role={effectiveRole}
          displayLabel={displayLabel}
          visibleTabs={visibleTabs}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onTabChange={onTabChange}
          onLogout={onLogout}
          onOpenHelp={onOpenHelp}
        />

        <div className="admin-main">
          <header className="admin-header">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <MobileMenuButton onClick={() => setMobileOpen(true)} />
                  {staffPanelLimited ? null : <BoardSwitcher board={board} onChange={onBoardChange} />}
                  <span className="admin-status-dot" aria-hidden />
                  <span className="text-xs font-semibold text-emerald-400">Online</span>
                </div>
                <p className="admin-section-kicker">{title}</p>
                <h1 className="admin-page-title">{pageLabel}</h1>
                <p className="admin-page-subtitle mt-1 max-w-2xl">
                  Manage what your {board === "staff" ? "staff board" : "lobby"} displays, content, and live preview.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 lg:items-end">
                <div className="admin-header-brand">
                  <Image src={FITDOG_BRAND.logoBadge64} alt="Fitdog" width={36} height={36} className="rounded-full" />
                  <div>
                    <p className="admin-header-brand__label">FITDOG</p>
                    <p className="text-xs font-bold text-white">Admin Center</p>
                  </div>
                </div>
                <p className="text-xs text-admin-muted">{savedLabel}</p>
                <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                  {staffPanelLimited ? null : <button type="button" className="admin-btn-secondary flex-1 sm:flex-none" onClick={onPreviewLive}>Preview Live</button>}
                  <button type="button" className="admin-btn-secondary inline-flex flex-1 items-center justify-center gap-2 sm:flex-none" onClick={onRefresh} disabled={refreshing}>
                    <FitdogDashboardIcon src={FITDOG_UI.refresh} size={18} alt="" />
                    {refreshing ? "Refreshing…" : "Refresh"}
                  </button>
                  {staffPanelLimited ? null : (
                    <button
                      type="button"
                      className="admin-btn-secondary flex-1 sm:flex-none"
                      onClick={onCastRefresh}
                      disabled={castRefreshing || !onCastRefresh}
                      title="Force a hard reload on every active Chromecast and TV display"
                    >
                      {castRefreshing ? "Refreshing TVs…" : "Hard Refresh Cast TVs"}
                    </button>
                  )}
                  <button type="button" className="admin-btn-primary inline-flex flex-1 items-center justify-center gap-2 sm:flex-none" onClick={onOpenBoard}>
                    <FitdogDashboardIcon src={FITDOG_UI.openWhiteboard} size={18} alt="" />
                    {isDemo ? "Open Demo Whiteboard" : board === "staff" ? "Open Staff Whiteboard" : "Open Lobby Whiteboard"}
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div className={`admin-content-grid ${showPreview ? "" : "admin-content-grid--single"}`}>
            <div className="admin-content-main crossover-dashboard min-w-0 space-y-5">{children}</div>
            {showPreview && preview ? <aside className="admin-preview-column">{preview}</aside> : null}
          </div>
        </div>
      </div>

      {isDemo ? (
        <DemoRoleSwitcher
          currentRole={getEffectiveDemoRole({ email: username, role: role ?? undefined, isDemo: true, demoRole: demoRole ?? undefined })}
          onSwitched={() => {
        onDemoRoleSwitched?.();
        window.location.reload();
      }}
        />
      ) : null}
    </div>
  );
}
