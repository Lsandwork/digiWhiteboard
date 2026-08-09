"use client";

import type { AdminTab } from "@/lib/admin/types";

const BOARD_SECTIONS: Array<{ tab: AdminTab; label: string }> = [
  { tab: "push_notices", label: "Notices" },
  { tab: "yard_push_notices", label: "Yard" },
  { tab: "walks_board", label: "Walks" },
  { tab: "grooming_push", label: "Grooming" },
  { tab: "whiteboard_preview", label: "Preview" }
];

type Props = {
  activeTab: AdminTab;
  visibleTabs: AdminTab[];
  onTabChange: (tab: AdminTab) => void;
};

export function AdminBoardSubnav({ activeTab, visibleTabs, onTabChange }: Props) {
  const items = BOARD_SECTIONS.filter((item) => visibleTabs.includes(item.tab));
  const show = items.some((item) => item.tab === activeTab);
  if (!show || items.length < 2) return null;

  return (
    <div className="admin-board-subnav" role="tablist" aria-label="Board sections">
      {items.map((item) => {
        const active = item.tab === activeTab;
        return (
          <button
            key={item.tab}
            type="button"
            role="tab"
            aria-selected={active}
            className={`admin-board-subnav__item${active ? " is-active" : ""}`}
            onClick={() => onTabChange(item.tab)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
