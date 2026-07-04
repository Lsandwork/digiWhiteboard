"use client";

import type { AdminTab, AdminBoardType } from "@/lib/admin/types";
import { Sidebar } from "@/components/admin/Sidebar";
import { BoardSwitcher } from "@/components/admin/BoardSwitcher";

type AdminShellProps = {
  board: AdminBoardType;
  tab: AdminTab;
  username: string;
  savedLabel: string;
  onBoardChange: (board: AdminBoardType) => void;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  onOpenBoard: () => void;
  onLogout: () => void;
  children: React.ReactNode;
  preview: React.ReactNode;
};

export function AdminShell({
  board,
  tab,
  username,
  savedLabel,
  onBoardChange,
  onTabChange,
  onRefresh,
  onOpenBoard,
  onLogout,
  children,
  preview
}: AdminShellProps) {
  const title = board === "staff" ? "Staff Digital Whiteboard Admin" : "Lobby Whiteboard Admin";

  return (
    <div className="admin-theme min-h-screen">
      <div className="admin-layout">
        <Sidebar activeTab={tab} username={username} onTabChange={onTabChange} onLogout={onLogout} />

        <div className="admin-main">
          <header className="admin-header">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <BoardSwitcher board={board} onChange={onBoardChange} />
                  <span className="admin-status-dot" aria-hidden />
                  <span className="text-xs font-semibold text-emerald-400">Online</span>
                </div>
                <h1 className="text-2xl font-black text-white lg:text-3xl">{title}</h1>
                <p className="mt-1 max-w-2xl text-sm text-admin-muted">
                  Manage what your {board === "staff" ? "staff board" : "lobby"} displays, promotions, schedule, and live preview.
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 lg:items-end">
                <p className="text-xs text-admin-muted">{savedLabel}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="admin-btn-secondary" onClick={onOpenBoard}>Preview Live</button>
                  <button type="button" className="admin-btn-secondary" onClick={onRefresh}>Refresh</button>
                  <button type="button" className="admin-btn-primary" onClick={onOpenBoard}>
                    {board === "staff" ? "Open Staff Whiteboard" : "Open Lobby Whiteboard"}
                  </button>
                </div>
              </div>
            </div>

            <nav className="admin-tabs" aria-label="Admin sections">
              {(["overview", "content", "promotions", "schedule", "display", "logs"] as AdminTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`admin-tab ${tab === item ? "admin-tab--active" : ""}`}
                  onClick={() => onTabChange(item)}
                >
                  {item === "display" ? "Display Settings" : item.charAt(0).toUpperCase() + item.slice(1)}
                </button>
              ))}
            </nav>
          </header>

          <div className="admin-content-grid">
            <div className="min-w-0 space-y-5">{children}</div>
            <aside className="admin-preview-column">{preview}</aside>
          </div>
        </div>
      </div>
    </div>
  );
}
