"use client";

import type { NotificationSidebarFilter, NotificationTopFilter } from "@/lib/staff/notification-hub";

type FilterCounts = {
  all: number;
  requests: number;
  complaints: number;
  responses: number;
  mentions: number;
};

const SIDEBAR_ITEMS: { id: NotificationSidebarFilter; label: string; countKey?: keyof FilterCounts }[] = [
  { id: "all", label: "All", countKey: "all" },
  { id: "unread", label: "Unread" },
  { id: "requests", label: "Requests", countKey: "requests" },
  { id: "complaints", label: "Complaints", countKey: "complaints" },
  { id: "write_ups", label: "Write-Ups" },
  { id: "owner_issues", label: "Owner Issues" },
  { id: "follow_ups", label: "Follow-Ups" },
  { id: "mentions", label: "Mentions / Replies", countKey: "mentions" },
  { id: "resolved", label: "Resolved / Closed" }
];

const TOP_TABS: { id: NotificationTopFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "requests", label: "Requests" },
  { id: "complaints", label: "Complaints" },
  { id: "responses", label: "Responses" },
  { id: "needs_reply", label: "Needs Reply" },
  { id: "closed", label: "Closed" }
];

type NotificationFiltersProps = {
  sidebar: NotificationSidebarFilter;
  top: NotificationTopFilter;
  query: string;
  sort: "newest" | "oldest" | "priority";
  statusFilter: string;
  assignedFilter: string;
  showAssignedFilter: boolean;
  staffNames: string[];
  counts: FilterCounts;
  mobileOpen: boolean;
  onSidebarChange: (value: NotificationSidebarFilter) => void;
  onTopChange: (value: NotificationTopFilter) => void;
  onQueryChange: (value: string) => void;
  onSortChange: (value: "newest" | "oldest" | "priority") => void;
  onStatusFilterChange: (value: string) => void;
  onAssignedFilterChange: (value: string) => void;
  onMobileToggle: () => void;
};

export function NotificationSidebar({
  sidebar,
  counts,
  mobileOpen,
  onSidebarChange,
  onMobileToggle
}: Pick<NotificationFiltersProps, "sidebar" | "counts" | "mobileOpen" | "onSidebarChange" | "onMobileToggle">) {
  return (
    <aside className={`notif-hub-sidebar ${mobileOpen ? "notif-hub-sidebar--open" : ""}`}>
      <div className="notif-hub-sidebar__header">
        <h3 className="notif-hub-sidebar__title">Categories</h3>
        <button type="button" className="notif-hub-sidebar__close md:hidden" onClick={onMobileToggle} aria-label="Close filters">
          ×
        </button>
      </div>
      <nav className="notif-hub-sidebar__nav">
        {SIDEBAR_ITEMS.map((item) => {
          const count = item.countKey ? counts[item.countKey] : 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`notif-hub-sidebar__item ${sidebar === item.id ? "notif-hub-sidebar__item--active" : ""}`}
              onClick={() => {
                onSidebarChange(item.id);
                onMobileToggle();
              }}
            >
              <span>{item.label}</span>
              {count > 0 ? <span className="notif-hub-sidebar__count">{count}</span> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function NotificationToolbar({
  top,
  query,
  sort,
  statusFilter,
  assignedFilter,
  showAssignedFilter,
  staffNames,
  onTopChange,
  onQueryChange,
  onSortChange,
  onStatusFilterChange,
  onAssignedFilterChange,
  onMobileToggle
}: Omit<NotificationFiltersProps, "sidebar" | "counts" | "mobileOpen" | "onSidebarChange"> & { onMobileToggle: () => void }) {
  return (
    <div className="notif-hub-toolbar">
      <button type="button" className="notif-hub-toolbar__filters-btn md:hidden" onClick={onMobileToggle}>
        Filters
      </button>
      <div className="notif-hub-toolbar__tabs">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`notif-hub-toolbar__tab ${top === tab.id ? "notif-hub-toolbar__tab--active" : ""}`}
            onClick={() => onTopChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="notif-hub-toolbar__controls">
        <input
          type="search"
          className="notif-hub-toolbar__search"
          placeholder="Search notifications…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <select className="notif-hub-toolbar__select" value={sort} onChange={(event) => onSortChange(event.target.value as typeof sort)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="priority">Priority</option>
        </select>
        <select className="notif-hub-toolbar__select" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Review">In Review</option>
          <option value="Waiting on Response">Waiting on Response</option>
          <option value="Responded">Responded</option>
          <option value="Resolved">Resolved</option>
          <option value="Closed">Closed</option>
        </select>
        {showAssignedFilter ? (
          <select className="notif-hub-toolbar__select" value={assignedFilter} onChange={(event) => onAssignedFilterChange(event.target.value)}>
            <option value="">All assignees</option>
            {staffNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Use NotificationSidebar + NotificationToolbar */
export function NotificationFilters(props: NotificationFiltersProps) {
  return (
    <>
      <NotificationSidebar
        sidebar={props.sidebar}
        counts={props.counts}
        mobileOpen={props.mobileOpen}
        onSidebarChange={props.onSidebarChange}
        onMobileToggle={props.onMobileToggle}
      />
      <NotificationToolbar {...props} />
    </>
  );
}
