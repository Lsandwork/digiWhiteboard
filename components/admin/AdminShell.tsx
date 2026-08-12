"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { AdminTab, AdminBoardType } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import {
  canAccessAdminTab,
  type UserAccess
} from "@/lib/admin/permissions";
import { FITDOG_BRAND, FITDOG_UI } from "@/lib/fitdog-dashboard/assets";
import { Sidebar, MobileMenuButton } from "@/components/admin/Sidebar";
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner";
import { buildStaffPanelNav, findNavSectionForTab, getTabDescription, getTabLabel } from "@/lib/admin/nav-groups";
import { BoardSwitcher } from "@/components/admin/BoardSwitcher";
import { DemoRoleSwitcher } from "@/components/demo/DemoRoleSwitcher";
import { FitdogAiBubble } from "@/components/ai/FitdogAiBubble";
import { TextScaleControls } from "@/components/admin/TextScaleControls";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/admin/NotificationBell";
import { AdminBoardSubnav } from "@/components/admin/mobile/AdminBoardSubnav";
import { AdminMobileTabBar } from "@/components/admin/mobile/AdminMobileTabBar";
import { OpsGlobalSearch } from "@/components/admin/ops-command-center/GlobalSearch";
import {
  LockRuffOpsButton,
  RuffOpsLockScreen,
  useRuffOpsLock
} from "@/components/admin/ops-command-center/LockRuffOps";
import { ShellLayoutSwitcher } from "@/components/shared/ShellLayoutSwitcher";
import { getEffectiveDemoRole, usesDemoRoleSwitcher } from "@/lib/demo/session";

type AdminShellProps = {
  board: AdminBoardType;
  tab: AdminTab;
  username: string;
  displayName?: string | null;
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
  canSeeAdminUtilities?: boolean;
  canUseBoardSwitcher?: boolean;
  accessibleBoards?: AdminBoardType[];
  children: React.ReactNode;
  preview?: React.ReactNode;
  showPreview?: boolean;
};

export function AdminShell({
  board,
  tab,
  username,
  displayName = null,
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
  canSeeAdminUtilities = false,
  canUseBoardSwitcher = false,
  accessibleBoards = ["lobby", "staff"],
  children,
  preview,
  showPreview = true
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { locked, lock, unlock } = useRuffOpsLock();
  const title =
    board === "staff"
      ? "Staff Digital Whiteboard Admin"
      : board === "marketing"
        ? "Marketing — CAST-TV"
        : "Lobby Whiteboard Admin";
  const effectiveRole = isDemo ? (demoRole ?? role) : role;

  const visibleTabs = useMemo(
    () => ADMIN_TABS.filter((item) => canAccessAdminTab(access, item, effectiveRole, board, { isDemo })),
    [access, effectiveRole, board, isDemo]
  );
  const pageLabel = getTabLabel(tab);
  const navEntries = useMemo(
    () => buildStaffPanelNav(visibleTabs, board, effectiveRole),
    [visibleTabs, board, effectiveRole]
  );
  const sectionLabel = findNavSectionForTab(navEntries, tab);
  const pageDescription = getTabDescription(tab, board);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem("fitdog_admin_sidebar_collapsed");
        if (stored === "1") setSidebarCollapsed(true);
      } catch {
        // ignore storage errors
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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

  function handleBoardChange(nextBoard: AdminBoardType) {
    onBoardChange(nextBoard);
    setMobileOpen(false);
  }

  function handleTabChange(next: AdminTab) {
    onTabChange(next);
    setMobileOpen(false);
  }

  return (
    <div className="admin-theme admin-theme--app">
      <ImpersonationBanner />
      <div className={`admin-layout ${sidebarCollapsed ? "admin-layout--collapsed" : ""}`}>
        <Sidebar
          activeTab={tab}
          board={board}
          username={username}
          displayName={displayName}
          role={effectiveRole}
          displayLabel={displayLabel}
          visibleTabs={visibleTabs}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onTabChange={handleTabChange}
          onLogout={onLogout}
          onOpenHelp={onOpenHelp}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />

        <div className="admin-main">
          <header className="admin-header">
            {/* Phone app chrome — compact sticky bar */}
            <div className="admin-appbar">
              <div className="admin-appbar__leading">
                <MobileMenuButton onClick={() => setMobileOpen(true)} />
                <div className="admin-appbar__titles min-w-0">
                  <p className="admin-appbar__brand">Fitdog</p>
                  <h1 className="admin-appbar__title">{pageLabel}</h1>
                </div>
              </div>
              <div className="admin-appbar__actions">
                <NotificationBell onOpenTab={handleTabChange} />
                <button
                  type="button"
                  className="admin-appbar__board-btn"
                  onClick={onOpenBoard}
                  aria-label={
                    board === "staff" ? "Open Staff Whiteboard" : board === "marketing" ? "Open CAST-TV" : "Open Lobby Whiteboard"
                  }
                >
                  <FitdogDashboardIcon src={FITDOG_UI.openWhiteboard} size={18} alt="" />
                  <span>Board</span>
                </button>
              </div>
            </div>

            {/* Desktop / tablet header keeps full context */}
            <div className="admin-header__desktop flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <MobileMenuButton onClick={() => setMobileOpen(true)} />
                  {canUseBoardSwitcher ? (
                    <BoardSwitcher board={board} boards={accessibleBoards} onChange={handleBoardChange} />
                  ) : null}
                  <span className="admin-status-dot" aria-hidden />
                  <span className="text-xs font-semibold text-emerald-400">Online</span>
                </div>
                <p className="admin-section-kicker">{sectionLabel ?? title}</p>
                <h1 className="admin-page-title">{pageLabel}</h1>
                <p className="admin-page-subtitle mt-1 max-w-2xl">{pageDescription}</p>
              </div>

              <div className="admin-header__actions flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
                <div className="admin-header__toolbar flex w-full flex-wrap items-center justify-end gap-2 sm:gap-3">
                  <div className="admin-header__utils flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    {canSeeAdminUtilities ? (
                      <button
                        type="button"
                        className="admin-btn-secondary admin-header__util-btn flex-1 sm:flex-none"
                        onClick={onPreviewLive}
                      >
                        <span className="admin-header__label-full">Preview Live</span>
                        <span className="admin-header__label-short">Preview</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-btn-secondary admin-header__util-btn inline-flex flex-1 items-center justify-center gap-2 sm:flex-none"
                      onClick={onRefresh}
                      disabled={refreshing}
                    >
                      <FitdogDashboardIcon src={FITDOG_UI.refresh} size={18} alt="" />
                      <span className="admin-header__label-full">{refreshing ? "Refreshing…" : "Refresh"}</span>
                      <span className="admin-header__label-short">{refreshing ? "…" : "Refresh"}</span>
                    </button>
                    {canSeeAdminUtilities ? (
                      <button
                        type="button"
                        className="admin-btn-secondary admin-header__util-btn flex-1 sm:flex-none"
                        onClick={onCastRefresh}
                        disabled={castRefreshing || !onCastRefresh}
                        title="Force a hard reload on every active Chromecast and TV display"
                      >
                        <span className="admin-header__label-full">
                          {castRefreshing ? "Refreshing TVs…" : "Hard Refresh Cast TVs"}
                        </span>
                        <span className="admin-header__label-short">
                          {castRefreshing ? "TVs…" : "Refresh TVs"}
                        </span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="admin-btn-primary admin-header__primary-btn inline-flex flex-1 items-center justify-center gap-2 sm:flex-none"
                      onClick={onOpenBoard}
                    >
                      <FitdogDashboardIcon src={FITDOG_UI.openWhiteboard} size={18} alt="" />
                      <span className="admin-header__label-full">
                        {isDemo
                          ? "Open Demo Whiteboard"
                          : board === "marketing"
                            ? "Open CAST-TV"
                            : board === "staff"
                              ? "Open Staff Whiteboard"
                              : "Open Lobby Whiteboard"}
                      </span>
                      <span className="admin-header__label-short">
                        {isDemo
                          ? "Open Board"
                          : board === "marketing"
                            ? "Open CAST-TV"
                            : board === "staff"
                              ? "Open Staff"
                              : "Open Lobby"}
                      </span>
                    </button>
                  </div>
                  <div className="admin-header__meta flex items-center gap-2">
                    <OpsGlobalSearch
                      onNavigate={(nextTab) => {
                        if ((ADMIN_TABS as readonly string[]).includes(nextTab)) {
                          handleTabChange(nextTab as AdminTab);
                        }
                      }}
                    />
                    <LockRuffOpsButton onLock={lock} />
                    <NotificationBell onOpenTab={handleTabChange} />
                    <ThemeToggle />
                    <div className="admin-header-brand">
                      <Image src={FITDOG_BRAND.logoBadge64} alt="Fitdog" width={36} height={36} className="rounded-full" />
                      <div>
                        <p className="admin-header-brand__label">FITDOG</p>
                        <p className="text-xs font-bold text-white">Fitdog Digi-board</p>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="admin-header__saved text-xs text-admin-muted">{savedLabel}</p>
              </div>
            </div>
          </header>

          <AdminBoardSubnav activeTab={tab} visibleTabs={visibleTabs} onTabChange={handleTabChange} />

          <div className={`admin-content-grid ${showPreview ? "" : "admin-content-grid--single"}`}>
            <div className="admin-content-main crossover-dashboard min-w-0 space-y-5">{children}</div>
            {showPreview && preview ? <aside className="admin-preview-column">{preview}</aside> : null}
          </div>

          <ShellLayoutSwitcher />
        </div>
      </div>

      {isDemo && usesDemoRoleSwitcher({ email: username, role: role ?? undefined, isDemo: true, demoRole: demoRole ?? undefined }) ? (
        <DemoRoleSwitcher
          currentRole={getEffectiveDemoRole({ email: username, role: role ?? undefined, isDemo: true, demoRole: demoRole ?? undefined })}
          onSwitched={() => {
            onDemoRoleSwitched?.();
            window.location.reload();
          }}
        />
      ) : null}

      <AdminMobileTabBar
        activeTab={tab}
        visibleTabs={visibleTabs}
        onTabChange={handleTabChange}
        onOpenMore={() => setMobileOpen(true)}
      />

      <div className="admin-floating-dock">
        <TextScaleControls />
        <FitdogAiBubble board={board} tab={tab} />
      </div>

      {locked ? (
        <RuffOpsLockScreen
          username={displayName || username}
          onUnlockRequest={async (password) => {
            try {
              const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, unlockOnly: true })
              });
              if (!response.ok) return false;
              unlock();
              return true;
            } catch {
              return false;
            }
          }}
        />
      ) : null}
    </div>
  );
}
