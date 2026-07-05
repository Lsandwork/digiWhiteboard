"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, HelpCircle, Menu, X } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import type { AdminBoardType } from "@/lib/admin/types";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_BRAND, FITDOG_TAB_ICONS } from "@/lib/fitdog-dashboard/assets";
import { getAdminSidebarRoleLabel, isGroomerRole, isTeamLeaderRole, isTrainerRole } from "@/lib/admin/users";
import { buildAdminNav, findNavGroupForTab, getTabLabel, type NavEntry } from "@/lib/admin/nav-groups";

const tabLabels = Object.fromEntries(ADMIN_TABS.map((tab) => [tab, getTabLabel(tab)])) as Record<AdminTab, string>;

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

function NavIcon({ tab }: { tab: AdminTab }) {
  const iconSrc = FITDOG_TAB_ICONS[tab];
  if (iconSrc) return <FitdogDashboardIcon src={iconSrc} size={20} className="admin-nav-item__icon shrink-0" />;
  return <span className="admin-nav-item__icon inline-block h-5 w-5 shrink-0 rounded bg-white/10" aria-hidden />;
}

function SidebarNavItem({
  tab,
  label,
  active,
  nested,
  onSelect
}: {
  tab: AdminTab;
  label: string;
  active: boolean;
  nested?: boolean;
  onSelect: (tab: AdminTab) => void;
}) {
  return (
    <button
      type="button"
      className={`admin-nav-item ${nested ? "admin-nav-item--nested" : ""} ${active ? "admin-nav-item--active" : ""}`}
      onClick={() => onSelect(tab)}
    >
      {!nested ? <NavIcon tab={tab} /> : null}
      <span>{label}</span>
    </button>
  );
}

function SidebarNavGroup({
  entry,
  activeTab,
  expanded,
  onToggle,
  onSelect
}: {
  entry: Extract<NavEntry, { type: "group" }>;
  activeTab: AdminTab;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (tab: AdminTab) => void;
}) {
  const childActive = entry.children.some((child) => child.tab === activeTab);
  const groupIcon = FITDOG_TAB_ICONS[entry.children[0]?.tab];

  return (
    <div className={`admin-nav-group ${expanded || childActive ? "admin-nav-group--open" : ""}`}>
      <button
        type="button"
        className={`admin-nav-item admin-nav-group__toggle ${childActive ? "admin-nav-item--active-parent" : ""}`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {groupIcon ? (
          <FitdogDashboardIcon src={groupIcon} size={20} className="admin-nav-item__icon shrink-0" />
        ) : (
          <span className="admin-nav-item__icon inline-block h-5 w-5 shrink-0 rounded bg-white/10" aria-hidden />
        )}
        <span className="flex-1 text-left">{entry.label}</span>
        <ChevronDown className={`admin-nav-group__chevron h-4 w-4 shrink-0 ${expanded ? "admin-nav-group__chevron--open" : ""}`} aria-hidden />
      </button>
      {expanded ? (
        <div className="admin-nav-group__children">
          {entry.children.map((child) => (
            <SidebarNavItem
              key={child.tab}
              tab={child.tab}
              label={child.label}
              active={activeTab === child.tab}
              nested
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type SidebarProps = {
  activeTab: AdminTab;
  board: AdminBoardType;
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

export function Sidebar({
  activeTab,
  board,
  username,
  role,
  displayLabel,
  mobileOpen,
  onMobileClose,
  onTabChange,
  onLogout,
  onOpenHelp,
  visibleTabs = ADMIN_TABS
}: SidebarProps) {
  const navEntries = useMemo(() => buildAdminNav(visibleTabs, board), [visibleTabs, board]);
  const activeGroupId = useMemo(() => findNavGroupForTab(navEntries, activeTab), [navEntries, activeTab]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(activeGroupId ? [activeGroupId] : []));

  useEffect(() => {
    if (!activeGroupId) return;
    setExpandedGroups((current) => {
      if (current.has(activeGroupId)) return current;
      const next = new Set(current);
      next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  const roleLabel = displayLabel ?? getAdminSidebarRoleLabel(role, username);

  function handleSelect(tab: AdminTab) {
    onTabChange(tab);
    onMobileClose();
  }

  function toggleGroup(id: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {navEntries.map((entry) =>
            entry.type === "group" ? (
              <SidebarNavGroup
                key={entry.id}
                entry={entry}
                activeTab={activeTab}
                expanded={expandedGroups.has(entry.id)}
                onToggle={() => toggleGroup(entry.id)}
                onSelect={handleSelect}
              />
            ) : (
              <SidebarNavItem
                key={entry.tab}
                tab={entry.tab}
                label={entry.label}
                active={activeTab === entry.tab}
                onSelect={handleSelect}
              />
            )
          )}
        </nav>

        <div className="space-y-3 p-4">
          {!isTeamLeaderRole(role) && !isGroomerRole(role) && !isTrainerRole(role) ? (
            <div className="admin-sidebar-help-card rounded-xl p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                <HelpCircle className="h-4 w-4 text-fitdog-orange" />
                Need help?
              </div>
              <p className="text-xs text-admin-muted">Search setup guides for lobby board, staff board, and admin tools.</p>
              <button type="button" className="admin-btn-ghost mt-2 inline-block text-xs" onClick={() => (onOpenHelp ? onOpenHelp() : handleSelect("help"))}>
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
