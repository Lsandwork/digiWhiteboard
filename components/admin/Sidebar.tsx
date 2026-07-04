"use client";

import Image from "next/image";
import {
  Calendar,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Plug,
  ScrollText,
  Settings,
  Users,
  X
} from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";

const navItems: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "content", label: "Content", icon: <FileText className="h-4 w-4" /> },
  { id: "promotions", label: "Promotions", icon: <Megaphone className="h-4 w-4" /> },
  { id: "schedule", label: "Class Schedule", icon: <Calendar className="h-4 w-4" /> },
  { id: "display", label: "Display Settings", icon: <Settings className="h-4 w-4" /> },
  { id: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  { id: "logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
  { id: "integrations", label: "Integrations", icon: <Plug className="h-4 w-4" /> }
];

const tabLabels: Record<AdminTab, string> = {
  overview: "Overview",
  content: "Content",
  promotions: "Promotions",
  schedule: "Class Schedule",
  display: "Display Settings",
  users: "Users",
  settings: "Settings",
  logs: "Logs",
  integrations: "Integrations"
};

type SidebarProps = {
  activeTab: AdminTab;
  username: string;
  helpLink?: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
};

export function Sidebar({ activeTab, username, helpLink, mobileOpen, onMobileClose, onTabChange, onLogout }: SidebarProps) {
  return (
    <>
      {mobileOpen ? <button type="button" className="admin-mobile-backdrop" aria-label="Close menu" onClick={onMobileClose} /> : null}
      <aside className={`admin-sidebar ${mobileOpen ? "admin-sidebar--open" : ""}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-center gap-3">
            <Image src="/assets/fitdog-lobby-whiteboard/01-brand/logo/fitdog-logo-circle-badge-512.png" alt="Fitdog" width={40} height={40} className="rounded-full" />
            <span className="text-lg font-black tracking-wide text-white">fitdog</span>
          </div>
          <button type="button" className="admin-icon-btn admin-sidebar-close" onClick={onMobileClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${activeTab === item.id ? "admin-nav-item--active" : ""}`}
              onClick={() => {
                onTabChange(item.id);
                onMobileClose();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-3 p-4">
          <div className="admin-help-card rounded-xl p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <HelpCircle className="h-4 w-4 text-fitdog-orange" />
              Need help?
            </div>
            <p className="text-xs text-admin-muted">Visit the Fitdog Help Center for whiteboard setup guides.</p>
            {helpLink ? (
              <a href={helpLink} target="_blank" rel="noopener noreferrer" className="admin-btn-ghost mt-2 inline-block text-xs">
                Open Help Center
              </a>
            ) : null}
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
    </>
  );
}

export { tabLabels, ADMIN_TABS };

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="admin-icon-btn admin-mobile-menu-btn" onClick={onClick} aria-label="Open navigation menu">
      <Menu className="h-5 w-5" />
    </button>
  );
}
