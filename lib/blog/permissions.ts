import type { PermissionKey } from "@/lib/admin/permissions";

export const BLOG_PERMISSIONS = [
  "blog.view",
  "blog.submit_idea",
  "blog.create",
  "blog.edit",
  "blog.review",
  "blog.approve",
  "blog.schedule",
  "blog.publish",
  "blog.archive",
  "blog.delete",
  "blog.manage_sources",
  "blog.manage_knowledge",
  "blog.manage_media",
  "blog.approve_images",
  "blog.manage_brand",
  "blog.manage_providers",
  "blog.manage_publishing",
  "blog.manage_automation",
  "blog.view_costs",
  "blog.view_analytics",
  "blog.view_audit_log"
] as const satisfies readonly PermissionKey[];

export type BlogPermission = (typeof BLOG_PERMISSIONS)[number];

/** Marketing role blog capabilities (Admin / Super Admin use broader role matrices). */
export const BLOG_MARKETING_PERMISSIONS: BlogPermission[] = [
  "blog.view",
  "blog.submit_idea",
  "blog.create",
  "blog.edit",
  "blog.review",
  "blog.approve",
  "blog.schedule",
  "blog.publish",
  "blog.archive",
  "blog.manage_sources",
  "blog.manage_media",
  "blog.approve_images",
  "blog.manage_brand",
  "blog.view_analytics"
];
