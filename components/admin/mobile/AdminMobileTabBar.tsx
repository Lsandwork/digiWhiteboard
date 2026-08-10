"use client";

import type { AdminTab } from "@/lib/admin/types";
import { Camera, ClipboardList, Home, LayoutGrid, MoreHorizontal } from "lucide-react";

type TabDef = {
  id: string;
  label: string;
  icon: typeof Home;
  /** Candidate Digi tabs — first visible wins */
  tabs: AdminTab[];
};

const PRIMARY: TabDef[] = [
  {
    id: "home",
    label: "Home",
    icon: Home,
    tabs: ["my_shift", "ops_command_center", "overview", "checklist", "handler_shift_entry", "notifications"]
  },
  {
    id: "floor",
    label: "Floor",
    icon: ClipboardList,
    tabs: ["fitdog_alerts", "crossover_communication", "active_issues", "owner_follow_up"]
  },
  {
    id: "photos",
    label: "Photos",
    icon: Camera,
    tabs: ["bulk_photo_upload", "media_library"]
  },
  {
    id: "board",
    label: "Board",
    icon: LayoutGrid,
    tabs: ["push_notices", "yard_push_notices", "walks_board", "whiteboard_preview", "grooming_push"]
  }
];

function resolveTab(def: TabDef, visibleTabs: AdminTab[]): AdminTab | null {
  for (const tab of def.tabs) {
    if (visibleTabs.includes(tab)) return tab;
  }
  return null;
}

function isActive(def: TabDef, activeTab: AdminTab): boolean {
  return def.tabs.includes(activeTab);
}

type Props = {
  activeTab: AdminTab;
  visibleTabs: AdminTab[];
  onTabChange: (tab: AdminTab) => void;
  onOpenMore: () => void;
};

export function AdminMobileTabBar({ activeTab, visibleTabs, onTabChange, onOpenMore }: Props) {
  const items = PRIMARY.map((def) => ({
    ...def,
    target: resolveTab(def, visibleTabs)
  })).filter((item) => item.target);

  const moreActive = !items.some((item) => isActive(item, activeTab));

  return (
    <nav className="admin-mobile-tabbar" aria-label="Primary">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item, activeTab);
        return (
          <button
            key={item.id}
            type="button"
            className={`admin-mobile-tabbar__item${active ? " is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => item.target && onTabChange(item.target)}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 2} aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={`admin-mobile-tabbar__item${moreActive ? " is-active" : ""}`}
        aria-current={moreActive ? "page" : undefined}
        onClick={onOpenMore}
      >
        <MoreHorizontal size={22} strokeWidth={moreActive ? 2.4 : 2} aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}
