"use client";

import Image from "next/image";
import { HelpCircle, Menu, X } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_BRAND, FITDOG_TAB_ICONS } from "@/lib/fitdog-dashboard/assets";
import { getAdminSidebarRoleLabel, isGroomerRole, isTeamLeaderRole, isTrainerRole } from "@/lib/admin/users";

const navItems: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content" },
  { id: "promotions", label: "Promotions" },
  { id: "schedule", label: "Class Schedule" },
  { id: "display", label: "Display Settings" },
  { id: "push_notices", label: "Push Notices" },
  { id: "grooming_push", label: "Grooming Push" },
  { id: "trainer_push", label: "Trainer Push" },
  { id: "trainer_entry", label: "Trainer's Entry" },
  { id: "crossover_communication", label: "Front Desk Log" },
  { id: "owner_follow_up", label: "Owner Follow Up" },
  { id: "active_issues", label: "Active Issues" },
  { id: "whiteboard_preview", label: "Whiteboard Preview" },
  { id: "yard_links", label: "Video Links" },
  { id: "management_support", label: "Management Support" },
  { id: "ms_hub", label: "Support Overview" },
  { id: "ms_groomer_complaints", label: "Groomer Complaints" },
  { id: "ms_groomer_requests", label: "Groomer Requests" },
  { id: "ms_trainer_complaints", label: "Trainer Complaints" },
  { id: "ms_trainer_requests", label: "Trainer Requests" },
  { id: "admin_trainer_entries", label: "Trainer Entries" },
  { id: "package_commissions", label: "Package Commissions" },
  { id: "analytics", label: "Analytics" },
  { id: "templates", label: "Templates" },
  { id: "notifications", label: "Notifications" },
  { id: "staff_directory", label: "Staff Directory" },
  { id: "users", label: "Users" },
  { id: "settings", label: "Settings" },
  { id: "logs", label: "Logs" },
  { id: "integrations", label: "Integrations" },
  { id: "help", label: "Help Center" }
];

const tabLabels: Record<AdminTab, string> = Object.fromEntries(navItems.map((item) => [item.id, item.label])) as Record<AdminTab, string>;

function sidebarPanelTitle(role?: string | null) {
  if (isTeamLeaderRole(role)) return "Team Lead Panel";
  if (isGroomerRole(role)) return "Groomer Panel";
  if (isTrainerRole(role)) return "Trainer Panel";
  return "Fitdog Admin";
}

function sidebarPanelSubtitle(role?: string | null) {
  if (isTeamLeaderRole(role)) return "Front Desk";
  if (isGroomerRole(role)) return "Grooming";
  if (isTrainerRole(role)) return "Training";
  return "Admin Center";
}

function userInitials(username: string) {
  const base = username.split("@")[0] ?? username;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

type SidebarProps = {
  activeTab: AdminTab;
  username: string;
  role?: string | null;
  displayLabel?: string | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  onOpenHelp?: () => void;
  visibleTabs?: AdminTab[];
};

export function Sidebar({ activeTab, username, role, displayLabel, mobileOpen, onMobileClose, onTabChange, onLogout, onOpenHelp, visibleTabs = ADMIN_TABS }: SidebarProps) {
  const visibleNavItems = navItems.filter((item) => visibleTabs.includes(item.id));
  const roleLabel = displayLabel ?? getAdminSidebarRoleLabel(role, username);

  return (
    <>
      {mobileOpen ? <button type="button" className="admin-mobile-backdrop" aria-label="Close menu" onClick={onMobileClose} /> : null}
      <aside className={`admin-sidebar ${mobileOpen ? "admin-sidebar--open" : ""}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-5">
          <div className="admin-sidebar-brand">
            <Image src={FITDOG_BRAND.logoBadge128} alt="Fitdog" width={44} height={44} className="rounded-full" />
            <div className="admin-sidebar-brand__text min-w-0">
              <p className="admin-sidebar-brand__title truncate">{sidebarPanelTitle(role)}</p>
              <p className="admin-sidebar-brand__subtitle truncate">{sidebarPanelSubtitle(role)}</p>
            </div>
          </div>
          <button type="button" className="admin-icon-btn admin-sidebar-close" onClick={onMobileClose} aria-label="Close navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {visibleNavItems.map((item) => {
            const iconSrc = FITDOG_TAB_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`admin-nav-item ${activeTab === item.id ? "admin-nav-item--active" : ""}`}
                onClick={() => {
                  onTabChange(item.id);
                  onMobileClose();
                }}
              >
                {iconSrc ? (
                  <FitdogDashboardIcon src={iconSrc} size={22} className="admin-nav-item__icon" />
                ) : (
                  <span className="admin-nav-item__icon inline-block h-[22px] w-[22px] rounded bg-white/10" aria-hidden />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 p-4">
          {!isTeamLeaderRole(role) && !isGroomerRole(role) && !isTrainerRole(role) ? (
            <div className="admin-sidebar-help-card rounded-xl p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                <HelpCircle className="h-4 w-4 text-fitdog-orange" />
                Need help?
              </div>
              <p className="text-xs text-admin-muted">Search setup guides for lobby board, staff board, and admin tools.</p>
              <button type="button" className="admin-btn-ghost mt-2 inline-block text-xs" onClick={() => (onOpenHelp ? onOpenHelp() : onTabChange("help"))}>
                Open Help Center
              </button>
            </div>
          ) : null}

          <div className="admin-user-card">
            <div className="admin-user-card__avatar" aria-hidden>{userInitials(username)}</div>
            <div className="min-w-0 flex-1">
              <p className="admin-user-card__name truncate">{username.split("@")[0] ?? username}</p>
              <p className="admin-user-card__meta truncate">{roleLabel}</p>
              <p className="admin-user-card__meta truncate">{username}</p>
            </div>
            <button type="button" className="admin-icon-btn shrink-0" onClick={onLogout} aria-label="Log out">
              <FitdogDashboardIcon src="/assets/fitdog/ui/logout-64.png" size={18} alt="Log out" />
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
