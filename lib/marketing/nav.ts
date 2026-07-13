import type { MarketingRouteKey } from "@/lib/marketing/constants";
import { MARKETING_ROUTES } from "@/lib/marketing/constants";

export type MarketingNavItem = {
  key: MarketingRouteKey;
  label: string;
  href: string;
  icon: string;
};

export const MARKETING_NAV: MarketingNavItem[] = [
  { key: "dashboard", label: "Dashboard", href: MARKETING_ROUTES.dashboard, icon: "/assets/admin/icons/svg/dashboard.svg" },
  { key: "mediaPush", label: "Media Push Notice", href: MARKETING_ROUTES.mediaPush, icon: "/assets/fitdog/ui-pack/emergency-alerts.svg" },
  { key: "requests", label: "Active Media Requests", href: MARKETING_ROUTES.requests, icon: "/assets/admin/icons/svg/open-issues.svg" },
  { key: "upload", label: "Bulk Photo Upload", href: MARKETING_ROUTES.upload, icon: "/assets/fitdog/ui-pack/bulk-photo-upload.svg" },
  { key: "storage", label: "Photo Storage", href: MARKETING_ROUTES.storage, icon: "/assets/admin/icons/svg/database.svg" },
  { key: "campaigns", label: "Albums & Campaigns", href: MARKETING_ROUTES.campaigns, icon: "/assets/admin/icons/svg/bookings.svg" },
  { key: "calendar", label: "Content Calendar", href: MARKETING_ROUTES.calendar, icon: "/assets/admin/icons/svg/reports.svg" },
  { key: "notifications", label: "Notifications", href: MARKETING_ROUTES.notifications, icon: "/assets/admin/icons/svg/notifications.svg" },
  { key: "history", label: "Activity History", href: MARKETING_ROUTES.history, icon: "/assets/admin/icons/svg/audit-logs.svg" },
  { key: "settings", label: "Settings", href: MARKETING_ROUTES.settings, icon: "/assets/admin/icons/svg/profile-settings.svg" }
];

export const MARKETING_QUICK_ACTIONS = [
  { label: "Request a Dog", description: "Media Push Notice", href: MARKETING_ROUTES.mediaPush },
  { label: "Bulk Upload Photos", description: "Upload photos & videos", href: MARKETING_ROUTES.upload },
  { label: "Create Campaign", description: "New album or campaign", href: MARKETING_ROUTES.campaigns },
  { label: "View Photo Storage", description: "Search media library", href: MARKETING_ROUTES.storage }
] as const;
