"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, HelpCircle, Menu, X } from "lucide-react";
import type { AdminTab } from "@/lib/admin/types";
import { ADMIN_TABS } from "@/lib/admin/types";
import type { AdminBoardType } from "@/lib/admin/types";
import { FitdogDashboardIcon } from "@/components/admin/ui/FitdogDashboardIcon";
import { FITDOG_BRAND, FITDOG_TAB_ICONS } from "@/lib/fitdog-dashboard/assets";
import { GINGR_NAV_ICON } from "@/lib/gingr/constants";
import { openGingrSecurely } from "@/lib/gingr/open-gingr";
import { RUFFLY_NAV_ICON } from "@/lib/ruffly/branding/assets";
import { getAdminSidebarRoleLabel, isGroomerRole, isTeamLeaderRole, isTrainerRole } from "@/lib/admin/users";
import {
  bucketNavEntries,
  buildStaffPanelNav,
  findNavGroupForTab,
  findNavSectionIdForPath,
  findNavSectionIdForTab,
  findSoleLeafTab,
  getTabLabel,
  type NavEntry
} from "@/lib/admin/nav-groups";

const tabLabels = Object.fromEntries(ADMIN_TABS.map((tab) => [tab, getTabLabel(tab)])) as Record<AdminTab, string>;

function sidebarPanelTitle(role?: string | null) {
  if (isTeamLeaderRole(role)) return "Team Lead Panel";
  if (isGroomerRole(role)) return "Groomer Panel";
  if (isTrainerRole(role)) return "Trainer Panel";
  return "Fitdog Digi-board";
}

function sidebarPanelSubtitle(role?: string | null) {
  if (isTeamLeaderRole(role)) return "Front Desk";
  if (isGroomerRole(role)) return "Grooming";
  if (isTrainerRole(role)) return "Training";
  return "Digi-board";
}

function userInitials(username: string) {
  const base = username.split("@")[0] ?? username;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function sectionContainsActive(
  children: Array<Exclude<NavEntry, { type: "section" }>>,
  activeTab: AdminTab,
  activePath?: string | null
) {
  return children.some((child) => {
    if (child.type === "item") return child.tab === activeTab;
    if (child.type === "group") return child.children.some((item) => item.tab === activeTab);
    if (child.type === "route") return child.href === activePath;
    return false;
  });
}

function NavIcon({ tab }: { tab: AdminTab }) {
  const iconSrc = FITDOG_TAB_ICONS[tab];
  if (iconSrc) return <FitdogDashboardIcon src={iconSrc} size={18} className="admin-nav-item__icon shrink-0" />;
  return <span className="admin-nav-item__icon inline-block h-[18px] w-[18px] shrink-0 rounded bg-white/10" aria-hidden />;
}

function SidebarNavItem({
  tab,
  label,
  active,
  nested,
  badgeCount,
  onSelect
}: {
  tab: AdminTab;
  label: string;
  active: boolean;
  nested?: boolean;
  badgeCount?: number;
  onSelect: (tab: AdminTab) => void;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      className={`admin-nav-item ${nested ? "admin-nav-item--nested" : ""} ${active ? "admin-nav-item--active" : ""}`}
      onClick={() => onSelect(tab)}
      title={label}
    >
      {!nested ? <NavIcon tab={tab} /> : null}
      <span className="flex-1 text-left">{label}</span>
      {badgeCount && badgeCount > 0 ? (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </button>
  );
}

function SidebarNavGroup({
  entry,
  activeTab,
  expanded,
  collapsed,
  badgeCounts,
  onToggle,
  onExpandSidebar,
  onSelect
}: {
  entry: Extract<NavEntry, { type: "group" }>;
  activeTab: AdminTab;
  expanded: boolean;
  collapsed?: boolean;
  badgeCounts?: Partial<Record<AdminTab, number>>;
  onToggle: () => void;
  onExpandSidebar?: () => void;
  onSelect: (tab: AdminTab) => void;
}) {
  const childActive = entry.children.some((child) => child.tab === activeTab);
  const groupIcon = FITDOG_TAB_ICONS[entry.children[0]?.tab];
  const groupBadge = entry.children.reduce((sum, child) => sum + (badgeCounts?.[child.tab] || 0), 0);

  return (
    <div className={`admin-nav-group ${expanded || childActive ? "admin-nav-group--open" : ""}`}>
      <button
        type="button"
        className={`admin-nav-item admin-nav-group__toggle ${childActive ? "admin-nav-item--active-parent" : ""}`}
        aria-expanded={expanded}
        title={entry.label}
        onClick={() => {
          // Collapsed rail hides group children via CSS — toggling alone looks like a dead click.
          if (collapsed) {
            onExpandSidebar?.();
            if (!expanded) onToggle();
            return;
          }
          onToggle();
        }}
      >
        {groupIcon ? (
          <FitdogDashboardIcon src={groupIcon} size={18} className="admin-nav-item__icon shrink-0" />
        ) : (
          <span className="admin-nav-item__icon inline-block h-[18px] w-[18px] shrink-0 rounded bg-white/10" aria-hidden />
        )}
        <span className="flex-1 text-left">{entry.label}</span>
        {groupBadge > 0 ? (
          <span className="mr-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
            {groupBadge > 99 ? "99+" : groupBadge}
          </span>
        ) : null}
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
              badgeCount={badgeCounts?.[child.tab]}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNavSection({
  id,
  label,
  expanded,
  activeChild,
  onToggle,
  children
}: {
  id: string;
  label: string;
  expanded: boolean;
  activeChild: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`admin-nav-section-block ${expanded ? "admin-nav-section-block--open" : ""}`}>
      <button
        type="button"
        className={`admin-nav-section ${activeChild ? "admin-nav-section--active" : ""}`}
        aria-expanded={expanded}
        aria-controls={`admin-nav-section-${id}`}
        onClick={onToggle}
      >
        <span className="admin-nav-section__label">{label}</span>
        <ChevronDown
          className={`admin-nav-section__chevron h-3.5 w-3.5 shrink-0 ${expanded ? "admin-nav-section__chevron--open" : ""}`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div id={`admin-nav-section-${id}`} className="admin-nav-section__children">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SidebarNavRouteItem({
  href,
  label,
  active,
  onNavigate
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
}) {
  const isGingr = href === "/gingr";
  const isRuffly = href === "/ruffly";
  const isBlog = href === "/admin/automatic-blog";
  const icon = isRuffly ? RUFFLY_NAV_ICON : GINGR_NAV_ICON;
  return (
    <Link
      href={href}
      className={`admin-nav-item ${active ? "admin-nav-item--active" : ""}`}
      title={label}
      onClick={() => {
        if (isGingr) openGingrSecurely();
        onNavigate();
      }}
    >
      {isBlog ? (
        <span
          className="admin-nav-item__icon inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm bg-emerald-700 text-[10px] font-semibold text-white"
          aria-hidden
        >
          B
        </span>
      ) : (
        <Image src={icon} alt="" width={18} height={18} className="admin-nav-item__icon shrink-0 rounded-sm" />
      )}
      <span>{label}</span>
    </Link>
  );
}

function NavEntryChildren({
  entries,
  activeTab,
  activePath,
  expandedGroups,
  collapsed,
  badgeCounts,
  onToggleGroup,
  onExpandSidebar,
  onSelect,
  onNavigate
}: {
  entries: Array<Exclude<NavEntry, { type: "section" }>>;
  activeTab: AdminTab;
  activePath?: string | null;
  expandedGroups: Set<string>;
  collapsed?: boolean;
  badgeCounts?: Partial<Record<AdminTab, number>>;
  onToggleGroup: (id: string) => void;
  onExpandSidebar?: () => void;
  onSelect: (tab: AdminTab) => void;
  onNavigate: () => void;
}) {
  return (
    <>
      {entries.map((entry) => {
        if (entry.type === "route") {
          return (
            <SidebarNavRouteItem
              key={entry.id}
              href={entry.href}
              label={entry.label}
              active={activePath === entry.href}
              onNavigate={onNavigate}
            />
          );
        }
        if (entry.type === "group") {
          return (
            <SidebarNavGroup
              key={entry.id}
              entry={entry}
              activeTab={activeTab}
              expanded={expandedGroups.has(entry.id)}
              collapsed={collapsed}
              badgeCounts={badgeCounts}
              onToggle={() => onToggleGroup(entry.id)}
              onExpandSidebar={onExpandSidebar}
              onSelect={onSelect}
            />
          );
        }
        return (
          <SidebarNavItem
            key={entry.tab}
            tab={entry.tab}
            label={entry.label}
            active={activeTab === entry.tab}
            badgeCount={badgeCounts?.[entry.tab]}
            onSelect={onSelect}
          />
        );
      })}
    </>
  );
}

function NavEntryList({
  entries,
  activeTab,
  activePath,
  expandedGroups,
  expandedSections,
  forceExpandSections,
  collapsed,
  badgeCounts,
  onToggleGroup,
  onToggleSection,
  onExpandSidebar,
  onSelect,
  onNavigate
}: {
  entries: NavEntry[];
  activeTab: AdminTab;
  activePath?: string | null;
  expandedGroups: Set<string>;
  expandedSections: Set<string>;
  forceExpandSections: boolean;
  collapsed?: boolean;
  badgeCounts?: Partial<Record<AdminTab, number>>;
  onToggleGroup: (id: string) => void;
  onToggleSection: (id: string) => void;
  onExpandSidebar?: () => void;
  onSelect: (tab: AdminTab) => void;
  onNavigate: () => void;
}) {
  const buckets = useMemo(() => bucketNavEntries(entries), [entries]);

  return (
    <>
      {buckets.map((bucket, index) => {
        const children = (
          <NavEntryChildren
            entries={bucket.children}
            activeTab={activeTab}
            activePath={activePath}
            expandedGroups={expandedGroups}
            collapsed={collapsed}
            badgeCounts={badgeCounts}
            onToggleGroup={onToggleGroup}
            onExpandSidebar={onExpandSidebar}
            onSelect={onSelect}
            onNavigate={onNavigate}
          />
        );

        if (!bucket.section) {
          return <div key={`nav-orphan-${index}`}>{children}</div>;
        }

        const activeChild = sectionContainsActive(bucket.children, activeTab, activePath);
        // Icon-rail mode must show every tab icon; accordion collapse only applies when expanded.
        const expanded = forceExpandSections || expandedSections.has(bucket.section.id);
        const soleLeaf = findSoleLeafTab(bucket.children);

        return (
          <SidebarNavSection
            key={bucket.section.id}
            id={bucket.section.id}
            label={bucket.section.label}
            expanded={expanded}
            activeChild={activeChild}
            onToggle={() => {
              // Single-destination sections (e.g. Commissions): open the tab on click.
              // If already on that tab, allow collapse/expand as usual.
              if (soleLeaf && activeTab !== soleLeaf) {
                if (!expandedSections.has(bucket.section!.id)) onToggleSection(bucket.section!.id);
                onSelect(soleLeaf);
                return;
              }
              onToggleSection(bucket.section!.id);
            }}
          >
            {children}
          </SidebarNavSection>
        );
      })}
    </>
  );
}

type SidebarProps = {
  activeTab: AdminTab;
  activePath?: string | null;
  board: AdminBoardType;
  username: string;
  displayName?: string | null;
  role?: string | null;
  displayLabel?: string | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  onOpenHelp?: () => void;
  visibleTabs?: AdminTab[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function Sidebar({
  activeTab,
  activePath = null,
  board,
  username,
  displayName = null,
  role,
  displayLabel,
  mobileOpen,
  onMobileClose,
  onTabChange,
  onLogout,
  onOpenHelp,
  visibleTabs = ADMIN_TABS,
  collapsed = false,
  onToggleCollapsed
}: SidebarProps) {
  const navEntries = useMemo(
    () => buildStaffPanelNav(visibleTabs, board, role),
    [visibleTabs, board, role]
  );
  const activeGroupId = useMemo(() => findNavGroupForTab(navEntries, activeTab), [navEntries, activeTab]);
  const activeSectionId = useMemo(() => {
    return findNavSectionIdForPath(navEntries, activePath) ?? findNavSectionIdForTab(navEntries, activeTab);
  }, [navEntries, activePath, activeTab]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(activeGroupId ? [activeGroupId] : []));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(activeSectionId ? [activeSectionId] : [])
  );
  const userCollapsedGroupsRef = useRef(new Set<string>());
  const userCollapsedSectionsRef = useRef(new Set<string>());
  const prevActiveGroupIdRef = useRef<string | null>(null);
  const prevActiveSectionIdRef = useRef<string | null>(null);
  const [badgeCounts, setBadgeCounts] = useState<Partial<Record<AdminTab, number>>>({});

  useEffect(() => {
    if (!visibleTabs.includes("fitdog_alerts")) return;
    let cancelled = false;
    async function loadBadges() {
      try {
        const res = await fetch("/api/admin/fitdog-alerts?view=badge", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { count?: number };
        if (!cancelled) setBadgeCounts({ fitdog_alerts: Number(json.count || 0) });
      } catch {
        // Badge fetch is best-effort.
      }
    }
    void loadBadges();
    const timer = window.setInterval(() => void loadBadges(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [visibleTabs]);

  useEffect(() => {
    if (!activeGroupId) return;
    const changed = prevActiveGroupIdRef.current !== activeGroupId;
    prevActiveGroupIdRef.current = activeGroupId;
    // Only clear manual-collapse when the user navigates into a *different* group.
    if (changed) userCollapsedGroupsRef.current.delete(activeGroupId);
    // Honor manual collapse — never auto-reopen while the user kept this group shut.
    if (userCollapsedGroupsRef.current.has(activeGroupId)) return;
    if (!changed) return;
    setExpandedGroups((current) => {
      if (current.has(activeGroupId) || userCollapsedGroupsRef.current.has(activeGroupId)) return current;
      const next = new Set(current);
      next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  useEffect(() => {
    if (!activeSectionId) return;
    const changed = prevActiveSectionIdRef.current !== activeSectionId;
    prevActiveSectionIdRef.current = activeSectionId;
    if (changed) userCollapsedSectionsRef.current.delete(activeSectionId);
    // Honor manual collapse — collapsing a section must not bounce open on the next paint.
    if (userCollapsedSectionsRef.current.has(activeSectionId)) return;
    if (!changed) return;
    setExpandedSections((current) => {
      if (current.has(activeSectionId) || userCollapsedSectionsRef.current.has(activeSectionId)) {
        return current;
      }
      const next = new Set(current);
      next.add(activeSectionId);
      return next;
    });
  }, [activeSectionId]);

  useEffect(() => {
    // Keep the active tab visible in long / collapsed icon rails.
    const timer = window.setTimeout(() => {
      const active = document.querySelector<HTMLElement>(
        ".admin-sidebar button.admin-nav-item--active, .admin-sidebar a.admin-nav-item--active"
      );
      active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeTab, activePath, collapsed, expandedSections, expandedGroups]);

  const roleLabel = displayLabel ?? getAdminSidebarRoleLabel(role, username);

  function handleSelect(tab: AdminTab) {
    onTabChange(tab);
    onMobileClose();
  }

  function toggleGroup(id: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        userCollapsedGroupsRef.current.add(id);
      } else {
        next.add(id);
        userCollapsedGroupsRef.current.delete(id);
      }
      return next;
    });
  }

  function toggleSection(id: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
        userCollapsedSectionsRef.current.add(id);
      } else {
        next.add(id);
        userCollapsedSectionsRef.current.delete(id);
      }
      return next;
    });
  }

  return (
    <>
      {mobileOpen ? <button type="button" className="admin-mobile-backdrop" aria-label="Close menu" onClick={onMobileClose} /> : null}
      <aside className={`admin-sidebar ${mobileOpen ? "admin-sidebar--open" : ""} ${collapsed ? "admin-sidebar--collapsed" : ""}`}>
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

        <div className="px-3 pb-2">
          <button
            type="button"
            className="admin-nav-item admin-sidebar-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <ChevronsLeft className="h-4 w-4 shrink-0" />}
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          <NavEntryList
            entries={navEntries}
            activeTab={activeTab}
            activePath={activePath}
            expandedGroups={expandedGroups}
            expandedSections={expandedSections}
            forceExpandSections={collapsed}
            collapsed={collapsed}
            badgeCounts={badgeCounts}
            onToggleGroup={toggleGroup}
            onToggleSection={toggleSection}
            onExpandSidebar={collapsed ? onToggleCollapsed : undefined}
            onSelect={handleSelect}
            onNavigate={onMobileClose}
          />
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
            <div className="admin-user-card__avatar" aria-hidden>{userInitials(displayName?.trim() || username)}</div>
            <div className="min-w-0 flex-1">
              <p className="admin-user-card__name truncate">{displayName?.trim() || username.split("@")[0] || username}</p>
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
