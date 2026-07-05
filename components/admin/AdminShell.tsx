"use client";

import { useState } from "react";
import type { AdminTab, AdminBoardType } from "@/lib/admin/types";
import {
  canAccessPushNotices,
  canViewStaffDirectory,
  hasCoordinatorAccess,
  isCrossoverStaffRole,
  isFullAdminRole,
  isStaffPanelLimitedRole
} from "@/lib/admin/users";
import { Sidebar, MobileMenuButton, tabLabels, ADMIN_TABS } from "@/components/admin/Sidebar";
import { BoardSwitcher } from "@/components/admin/BoardSwitcher";

type AdminShellProps = {
  board: AdminBoardType;
  tab: AdminTab;
  username: string;
  role?: string | null;
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
  children: React.ReactNode;
  preview?: React.ReactNode;
  showPreview?: boolean;
};

export function AdminShell({
  board,
  tab,
  username,
  role,
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
  children,
  preview,
  showPreview = true
}: AdminShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const title = board === "staff" ? "Staff Digital Whiteboard Admin" : "Lobby Whiteboard Admin";
  const staffPanelLimited = isStaffPanelLimitedRole(role);
  const coordinatorTabs: AdminTab[] = [
    "push_notices",
    "crossover_communication",
    "owner_follow_up",
    "active_issues",
    "staff_directory",
    "whiteboard_preview",
    "templates",
    "notifications",
    "help"
  ];
  const crossoverStaffTabs: AdminTab[] = ["notifications", "help"];

  const visibleTabs = ADMIN_TABS.filter((item) => {
    if (hasCoordinatorAccess(role)) return coordinatorTabs.includes(item);
    if (isCrossoverStaffRole(role)) return crossoverStaffTabs.includes(item);
    if (item === "staff_directory" && !canViewStaffDirectory(role)) return false;
    if (board === "staff" && (item === "promotions" || item === "schedule")) return false;
    if (board === "staff" && item === "users") return false;
    if (item === "push_notices" && !canAccessPushNotices(role)) return false;
    if (["crossover_communication", "owner_follow_up", "active_issues"].includes(item) && !(isFullAdminRole(role) || hasCoordinatorAccess(role))) return false;
    return true;
  });

  return (
    <div className="admin-theme">
      <div className="admin-layout">
        <Sidebar
          activeTab={tab}
          username={username}
          role={role}
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
                <h1 className="admin-page-title">{title}</h1>
                <p className="admin-page-subtitle mt-1 max-w-2xl">
                  Manage what your {board === "staff" ? "staff board" : "lobby"} displays, content, and live preview.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 lg:items-end">
                <p className="text-xs text-admin-muted">{savedLabel}</p>
                <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                  {staffPanelLimited ? null : <button type="button" className="admin-btn-secondary flex-1 sm:flex-none" onClick={onPreviewLive}>Preview Live</button>}
                  <button type="button" className="admin-btn-secondary flex-1 sm:flex-none" onClick={onRefresh} disabled={refreshing}>
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
                  <button type="button" className="admin-btn-primary flex-1 sm:flex-none" onClick={onOpenBoard}>
                    {board === "staff" ? "Open Staff Whiteboard" : "Open Lobby Whiteboard"}
                  </button>
                </div>
              </div>
            </div>

            <nav className="admin-tabs" aria-label="Admin sections">
              {visibleTabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`admin-tab ${tab === item ? "admin-tab--active" : ""}`}
                  onClick={() => onTabChange(item)}
                >
                  {tabLabels[item]}
                </button>
              ))}
            </nav>
          </header>

          <div className={`admin-content-grid ${showPreview ? "" : "admin-content-grid--single"}`}>
            <div className="admin-content-main crossover-dashboard min-w-0 space-y-5">{children}</div>
            {showPreview && preview ? <aside className="admin-preview-column">{preview}</aside> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
