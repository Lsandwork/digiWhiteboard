import type { PermissionKey } from "@/lib/admin/permissions";
import type { BlogPageId } from "@/lib/blog/constants";

export type BlogDashboardNavItem = {
  id: BlogPageId;
  label: string;
  permission: PermissionKey;
  badgeKey?: "drafts" | "needsReview" | "approved" | "scheduled" | "published" | "subscribers" | "topics";
  /** When true, item is omitted from nav (feature unavailable). */
  unavailable?: boolean;
};

export type BlogDashboardNavSection = {
  id: string;
  label: string;
  items: BlogDashboardNavItem[];
};

/** Mockup information architecture for the Blog Generator sidebar. */
export const BLOG_DASHBOARD_NAV: BlogDashboardNavSection[] = [
  {
    id: "main",
    label: "MAIN",
    items: [
      { id: "overview", label: "Dashboard", permission: "blog.view" },
      { id: "calendar", label: "Content Calendar", permission: "blog.view" },
      { id: "articles", label: "All Articles", permission: "blog.view" },
      { id: "topics", label: "Topics", permission: "blog.view", badgeKey: "topics" },
      { id: "drafts", label: "Drafts", permission: "blog.edit", badgeKey: "drafts" },
      { id: "human-review", label: "Needs Review", permission: "blog.review", badgeKey: "needsReview" },
      { id: "approved", label: "Approved", permission: "blog.approve", badgeKey: "approved" },
      { id: "scheduled", label: "Scheduled", permission: "blog.schedule", badgeKey: "scheduled" },
      { id: "published", label: "Published", permission: "blog.view", badgeKey: "published" },
      { id: "categories", label: "Categories", permission: "blog.view" },
      { id: "tags", label: "Tags", permission: "blog.view" },
      { id: "authors", label: "Authors", permission: "blog.view" },
      { id: "media", label: "Media Library", permission: "blog.manage_media" }
    ]
  },
  {
    id: "engagement",
    label: "ENGAGEMENT",
    items: [
      // Comments are not in the product — omit rather than fake.
      { id: "newsletter", label: "Newsletter", permission: "blog.view", badgeKey: "subscribers" }
    ]
  },
  {
    id: "automation",
    label: "AUTOMATION & AI",
    items: [
      { id: "generate", label: "Blog Generator", permission: "blog.create" },
      { id: "social-generator", label: "Social Media Generator", permission: "blog.create" },
      { id: "agents", label: "AI Agents", permission: "blog.manage_providers" },
      { id: "automation", label: "Automation Rules", permission: "blog.manage_automation" }
    ]
  },
  {
    id: "analytics",
    label: "ANALYTICS",
    items: [
      { id: "analytics", label: "Performance", permission: "blog.view_analytics" },
      { id: "posting-analytics", label: "Posting Analytics", permission: "blog.view_analytics" },
      { id: "search-console", label: "Search Console", permission: "blog.view_analytics" }
    ]
  },
  {
    id: "settings",
    label: "SETTINGS",
    items: [
      { id: "settings", label: "Blog Settings", permission: "blog.manage_automation" },
      { id: "promotions", label: "Promotions", permission: "blog.manage_brand" },
      { id: "help", label: "How to Use", permission: "blog.view" }
    ]
  }
];

export type ExtendedBlogPageId = BlogDashboardNavItem["id"];

export function isExtendedBlogPageId(value: string | null | undefined): value is ExtendedBlogPageId {
  if (!value) return false;
  return BLOG_DASHBOARD_NAV.some((section) => section.items.some((item) => item.id === value));
}
