"use client";

import Image from "next/image";
import { HelpCircle, LayoutDashboard, FileText, Megaphone, Calendar, Settings, ScrollText, Plug, LogOut } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";

const navItems: { id: AdminTab | "integrations" | "settings"; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "content", label: "Content", icon: <FileText className="h-4 w-4" /> },
  { id: "promotions", label: "Promotions", icon: <Megaphone className="h-4 w-4" /> },
  { id: "schedule", label: "Class Schedule", icon: <Calendar className="h-4 w-4" /> },
  { id: "display", label: "Display Settings", icon: <Settings className="h-4 w-4" /> },
  { id: "logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
  { id: "integrations", label: "Integrations", icon: <Plug className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> }
];

type SidebarProps = {
  activeTab: AdminTab;
  username: string;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
};

export function Sidebar({ activeTab, username, onTabChange, onLogout }: SidebarProps) {
  return (
    <aside className="admin-sidebar">
      <div className="flex items-center gap-3 px-4 py-5">
        <Image src="/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png" alt="Fitdog" width={40} height={40} className="rounded-full" />
        <span className="text-lg font-black tracking-wide text-white">fitdog</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const isActive = item.id === activeTab || (item.id === "integrations" && activeTab === "logs");
          const tabId = item.id === "integrations" || item.id === "settings" ? "logs" : item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${isActive ? "admin-nav-item--active" : ""}`}
              onClick={() => onTabChange(tabId as AdminTab)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 p-4">
        <div className="admin-help-card rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
            <HelpCircle className="h-4 w-4 text-fitdog-orange" />
            Need help?
          </div>
          <p className="text-xs text-admin-muted">Visit the Fitdog Help Center for whiteboard setup guides.</p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-admin-border px-3 py-2">
          <div>
            <p className="text-sm font-bold text-white">{username}</p>
            <p className="text-xs text-admin-muted">Admin</p>
          </div>
          <button type="button" className="admin-icon-btn" onClick={onLogout} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
