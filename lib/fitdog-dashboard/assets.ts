import type { AdminTab } from "@/lib/admin/types";

/** Local Fitdog dashboard brand assets (see fitdog-dashboard-manifest.json). */
export const FITDOG_BRAND = {
  logoBadge: "/assets/fitdog/brand/fitdog-logo-circle-badge.png",
  logoBadge128: "/assets/fitdog/brand/fitdog-logo-circle-badge-128.png",
  logoBadge256: "/assets/fitdog/brand/fitdog-logo-circle-badge-256.png",
  logoBadge64: "/assets/fitdog/brand/fitdog-logo-circle-badge-64.png",
  wordmark: "/assets/fitdog/brand/fitdog-wordmark-horizontal.png"
} as const;

export const FITDOG_UI = {
  pushNotices: "/assets/fitdog/ui/push-notices-64.png",
  groomingPush: "/assets/fitdog/ui/grooming-push-64.png",
  frontDeskLog: "/assets/fitdog/ui/front-desk-log-64.png",
  videoLinks: "/assets/fitdog/ui/video-links-64.png",
  managementSupport: "/assets/fitdog/ui/management-support-64.png",
  notifications: "/assets/fitdog/ui/notifications-64.png",
  settings: "/assets/fitdog/ui/settings-64.png",
  search: "/assets/fitdog/ui/search-64.png",
  refresh: "/assets/fitdog/ui/refresh-64.png",
  openWhiteboard: "/assets/fitdog/ui/open-whiteboard-64.png",
  view: "/assets/fitdog/ui/view-64.png",
  edit: "/assets/fitdog/ui/edit-64.png",
  more: "/assets/fitdog/ui/more-64.png",
  openItems: "/assets/fitdog/ui/open-items-64.png",
  needsReview: "/assets/fitdog/ui/needs-review-64.png",
  dueToday: "/assets/fitdog/ui/due-today-64.png",
  urgent: "/assets/fitdog/ui/urgent-64.png",
  clearFilters: "/assets/fitdog/ui/clear-filters-64.png",
  resolved: "/assets/fitdog/ui/resolved-64.png",
  ownerComplaint: "/assets/fitdog/ui/owner-complaint-64.png",
  ownerRequest: "/assets/fitdog/ui/owner-request-64.png",
  logout: "/assets/fitdog/ui/logout-64.png"
} as const;

/** Sidebar nav icons for staff panel tabs. */
export const FITDOG_TAB_ICONS: Partial<Record<AdminTab, string>> = {
  push_notices: FITDOG_UI.pushNotices,
  grooming_push: FITDOG_UI.groomingPush,
  crossover_communication: FITDOG_UI.frontDeskLog,
  yard_links: FITDOG_UI.videoLinks,
  management_support: FITDOG_UI.managementSupport,
  notifications: FITDOG_UI.notifications,
  settings: FITDOG_UI.settings
};
